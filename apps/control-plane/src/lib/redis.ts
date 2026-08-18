import Redis from 'ioredis';
import { config } from '../config';

export function createRedisClient(): Redis {
  return new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
}

/**
 * Fixed-window rate limiter, org-scoped.
 * Key: rate:{organizationId}:search:{window}
 * Window is the current minute (epoch minutes), matching the "/min" semantics
 * of FREE_SEARCH_LIMIT / PRO_SEARCH_LIMIT.
 */
export async function checkAndIncrementRateLimit(
  redis: Redis,
  organizationId: string,
  limit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const window = Math.floor(Date.now() / 60000);
  const key = `rate:${organizationId}:search:${window}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 120);
  }
  const allowed = count <= limit;
  return { allowed, remaining: Math.max(0, limit - count) };
}
