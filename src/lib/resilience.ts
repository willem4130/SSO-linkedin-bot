import CircuitBreaker from 'opossum';
import { logger } from './logger';

/**
 * Circuit Breaker Wrapper for External APIs
 *
 * Prevents cascading failures when external services are down.
 * Automatically "opens" the circuit after consecutive failures,
 * preventing wasteful requests to failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests fail immediately
 * - HALF_OPEN: Testing if service recovered
 *
 * Features:
 * - Automatic circuit opening on repeated failures
 * - Exponential backoff testing for recovery
 * - Fallback responses when circuit is open
 * - Detailed metrics and logging
 */

interface CircuitBreakerConfig {
  timeout?: number;              // Request timeout in ms (default: 10000)
  errorThresholdPercentage?: number; // % of failures to open circuit (default: 50)
  resetTimeout?: number;         // Time in ms before attempting recovery (default: 30000)
  volumeThreshold?: number;      // Minimum requests before opening circuit (default: 5)
  name?: string;                 // Circuit breaker name for logging
}

/**
 * Create a circuit breaker for an async function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: CircuitBreakerConfig
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  const {
    timeout = 10000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    volumeThreshold = 5,
    name = fn.name || 'unnamed',
  } = config || {};

  const breaker = new CircuitBreaker(fn, {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    volumeThreshold,
    name,
  });

  // Event listeners for circuit state changes
  breaker.on('open', () => {
    logger.warn(
      { circuit: name, state: 'OPEN' },
      `Circuit breaker opened for ${name} - service is failing`
    );
  });

  breaker.on('halfOpen', () => {
    logger.info(
      { circuit: name, state: 'HALF_OPEN' },
      `Circuit breaker half-open for ${name} - testing recovery`
    );
  });

  breaker.on('close', () => {
    logger.info(
      { circuit: name, state: 'CLOSED' },
      `Circuit breaker closed for ${name} - service recovered`
    );
  });

  breaker.on('failure', (error) => {
    logger.error(
      { circuit: name, error },
      `Circuit breaker detected failure in ${name}`
    );
  });

  breaker.on('success', () => {
    logger.debug(
      { circuit: name },
      `Circuit breaker success for ${name}`
    );
  });

  breaker.on('timeout', () => {
    logger.error(
      { circuit: name, timeout },
      `Circuit breaker timeout for ${name} (${timeout}ms)`
    );
  });

  return breaker as CircuitBreaker<Parameters<T>, ReturnType<T>>;
}

/**
 * LinkedIn API circuit breaker
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLinkedInCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  return createCircuitBreaker(fn, {
    timeout: 10000,
    errorThresholdPercentage: 50,
    resetTimeout: 60000,
    volumeThreshold: 3,
    name: `linkedin:${fn.name}`,
  });
}

/**
 * OpenAI API circuit breaker
 * Longer timeout for AI generation (can take 30+ seconds)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createOpenAICircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  return createCircuitBreaker(fn, {
    timeout: 60000,              // 60 seconds for AI generation
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 3,
    name: `openai:${fn.name}`,
  });
}

/**
 * Helper: Create circuit breaker with fallback
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withFallback<T extends (...args: any[]) => Promise<any>>(
  breaker: CircuitBreaker<Parameters<T>, ReturnType<T>>,
  fallbackFn: (...args: Parameters<T>) => ReturnType<T>
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    try {
      return await breaker.fire(...args);
    } catch (error) {
      logger.warn(
        { circuit: breaker.name, error },
        `Circuit breaker failed, using fallback for ${breaker.name}`
      );
      return await fallbackFn(...args);
    }
  };
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getCircuitBreakerStats(breaker: CircuitBreaker<unknown[], unknown>) {
  const stats = breaker.stats;

  return {
    name: breaker.name,
    state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
    failures: stats.failures,
    successes: stats.successes,
    timeouts: stats.timeouts,
    rejects: stats.rejects,
    fires: stats.fires,
    latencyMean: stats.latencyMean,
  };
}
