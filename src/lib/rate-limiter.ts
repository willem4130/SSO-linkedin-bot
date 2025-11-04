import Bottleneck from 'bottleneck';
import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Advanced Rate Limiting with Bottleneck
 *
 * Coordinates rate limiting across:
 * - Multiple jobs running concurrently
 * - Different API endpoints with different limits
 * - Distributed systems (optional Redis clustering)
 *
 * Prevents API rate limit violations by:
 * - Queueing requests when limit reached
 * - Automatic retries after cooldown
 * - Fair distribution across concurrent jobs
 *
 * API Limits Reference:
 * - LinkedIn: 500 requests per day per user, 100k per day app-level
 * - OpenAI: Depends on tier (RPM/TPM limits)
 */

interface RateLimiterConfig {
  maxConcurrent?: number;      // Max concurrent requests (default: 1)
  minTime?: number;            // Min time between requests in ms (default: 0)
  reservoir?: number;          // Max requests in time window
  reservoirRefreshAmount?: number; // How many tokens to add on refresh
  reservoirRefreshInterval?: number; // Refresh interval in ms
  id?: string;                 // Unique ID for Redis clustering
}

/**
 * Create a rate limiter with custom configuration
 */
export function createRateLimiter(config: RateLimiterConfig): Bottleneck {
  const {
    maxConcurrent = 1,
    minTime = 0,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id = 'default',
  } = config;

  // Build config with optional Redis support
  let limiterConfig: Bottleneck.ConstructorOptions = {
    maxConcurrent,
    minTime,
    reservoir,
    reservoirRefreshAmount,
    reservoirRefreshInterval,
    id,
  };

  // Optional: Use Redis for distributed rate limiting
  if (process.env.REDIS_URL && process.env.ENABLE_DISTRIBUTED_RATE_LIMITING === 'true') {
    const redis = new Redis(process.env.REDIS_URL);
    limiterConfig = {
      ...limiterConfig,
      datastore: 'ioredis',
      clientOptions: redis.options,
    };
  }

  const limiter = new Bottleneck(limiterConfig);

  // Event listeners
  limiter.on('failed', async (error, jobInfo) => {
    logger.warn(
      { error, jobInfo, limiterId: id },
      `Rate limiter job failed: ${error.message}`
    );

    // Retry after 5 seconds on rate limit errors
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return 5000; // Retry after 5 seconds
    }
  });

  limiter.on('retry', (error, jobInfo) => {
    logger.info(
      { error, jobInfo, limiterId: id },
      'Rate limiter retrying job'
    );
  });

  limiter.on('depleted', () => {
    logger.warn({ limiterId: id }, 'Rate limiter reservoir depleted');
  });

  limiter.on('debug', (message, data) => {
    logger.debug({ limiterId: id, message, data }, 'Rate limiter debug');
  });

  return limiter;
}

/**
 * LinkedIn API Rate Limiter
 * 500 calls per day per user token = ~1 every 3 minutes to be safe
 */
export const linkedInRateLimiter = createRateLimiter({
  maxConcurrent: 1,
  minTime: 200,                  // Min 200ms between requests (~400 req/day max)
  reservoir: 500,                // 500 requests
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 24 * 60 * 60 * 1000, // Per day
  id: 'linkedin-api',
});

/**
 * OpenAI API Rate Limiter
 * Tier 1: 500 RPM (requests per minute)
 * Conservative: 1 request every 150ms = ~400 RPM
 */
export const openaiRateLimiter = createRateLimiter({
  maxConcurrent: 3,              // Allow 3 concurrent (API supports it)
  minTime: 150,                  // Min 150ms between requests
  reservoir: 500,                // 500 requests
  reservoirRefreshAmount: 500,
  reservoirRefreshInterval: 60 * 1000, // Per minute
  id: 'openai-api',
});

/**
 * Wrap a function with rate limiting
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  limiter: Bottleneck
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return limiter.schedule(() => fn(...args)) as Promise<ReturnType<T>>;
  };
}

/**
 * Get rate limiter statistics
 */
export async function getRateLimiterStats(limiter: Bottleneck) {
  const counts = limiter.counts();

  return {
    running: counts.RUNNING,     // Currently executing
    queued: counts.QUEUED,       // Waiting in queue
    executing: counts.EXECUTING, // Being executed
    done: counts.DONE,           // Completed
  };
}

/**
 * Update rate limiter reservoir (useful for dynamic limits)
 */
export async function updateReservoir(
  limiter: Bottleneck,
  newReservoir: number
) {
  await limiter.updateSettings({
    reservoir: newReservoir,
  });
  logger.info({ newReservoir }, 'Updated rate limiter reservoir');
}

/**
 * Stop all rate limiters gracefully
 */
export async function stopAllRateLimiters() {
  const limiters = [
    linkedInRateLimiter,
    openaiRateLimiter,
  ];

  logger.info('Stopping all rate limiters');

  for (const limiter of limiters) {
    await limiter.stop({ dropWaitingJobs: false }); // Complete queued jobs
  }

  logger.info('All rate limiters stopped');
}
