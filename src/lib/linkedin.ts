import axios from 'axios';
import { createLinkedInCircuitBreaker } from './resilience';
import { linkedInRateLimiter, withRateLimit } from './rate-limiter';
import { logger } from './logger';

/**
 * LinkedIn API Client
 *
 * Features:
 * - Post to personal profile (ugcPosts API)
 * - Get post statistics
 * - Circuit breaker for reliability
 * - Rate limiting (500 calls/day per user)
 *
 * API Reference: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */

const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';

/**
 * Get LinkedIn user profile
 */
async function getUserProfileInternal(accessToken: string) {
  logger.info('Fetching LinkedIn user profile');

  const response = await axios.get(`${LINKEDIN_API_BASE}/userinfo`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  logger.info({ sub: response.data.sub }, 'LinkedIn profile fetched');
  return response.data;
}

/**
 * Post to LinkedIn personal profile (internal)
 */
async function postToLinkedInInternal(
  accessToken: string,
  personUrn: string,
  content: string
) {
  logger.info({ contentLength: content.length }, 'Creating LinkedIn post');

  const response = await axios.post(
    `${LINKEDIN_API_BASE}/ugcPosts`,
    {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content
          },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  const postId = response.data.id;
  logger.info({ postId }, 'LinkedIn post created successfully');

  return {
    id: postId,
    urn: response.data.id,
  };
}

/**
 * Get post statistics (internal)
 */
async function getPostStatisticsInternal(
  accessToken: string,
  postUrn: string
) {
  logger.info({ postUrn }, 'Fetching LinkedIn post statistics');

  // Note: LinkedIn's share statistics API requires organization context
  // For personal posts, we use a simplified approach
  // Full analytics requires Marketing Developer Platform approval

  const response = await axios.get(
    `${LINKEDIN_API_BASE}/socialActions/${encodeURIComponent(postUrn)}/likes`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  logger.info({ likes: response.data.paging?.total }, 'Post statistics fetched');

  return {
    likes: response.data.paging?.total || 0,
    // Note: Comments and shares require separate API calls
    // Will implement when needed
  };
}

/**
 * Wrapped functions with circuit breakers and rate limiting
 */

const getUserProfileWithBreaker = createLinkedInCircuitBreaker(getUserProfileInternal);
export const getUserProfile = withRateLimit(
  (token: string) => getUserProfileWithBreaker.fire(token),
  linkedInRateLimiter
);

const postToLinkedInWithBreaker = createLinkedInCircuitBreaker(postToLinkedInInternal);
export const postToLinkedIn = withRateLimit(
  (token: string, personUrn: string, content: string) =>
    postToLinkedInWithBreaker.fire(token, personUrn, content),
  linkedInRateLimiter
);

const getPostStatisticsWithBreaker = createLinkedInCircuitBreaker(getPostStatisticsInternal);
export const getPostStatistics = withRateLimit(
  (token: string, postUrn: string) => getPostStatisticsWithBreaker.fire(token, postUrn),
  linkedInRateLimiter
);
