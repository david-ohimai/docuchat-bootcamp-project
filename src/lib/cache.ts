import crypto from 'crypto';
import IORedis from 'ioredis';
import { config } from './config';
import { logger } from './logger';
import { cacheOperations } from './metrics';

// Separate from the BullMQ connection: BullMQ needs maxRetriesPerRequest: null,
// a cache connection should not have it.
export const cacheRedis = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  keyPrefix: 'docuchat:',
  lazyConnect: config.NODE_ENV === 'test',
});

cacheRedis.on('error', (error: Error & { code?: string }) =>
  logger.error('Cache Redis error', { error: error.message || error.code }),
);

// Every entry expires. TTLs reflect how stale each kind of data can safely be.
export const CACHE_TTL = {
  DOCUMENT: 600, // 10 minutes
  CONVERSATION_LIST: 120, // 2 minutes
  EMBEDDING: 604800, // 7 days: the same text + model always gives the same vector
} as const;

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await cacheRedis.get(key);
  cacheOperations.inc({ result: raw ? 'hit' : 'miss' });
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await cacheRedis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await cacheRedis.del(key);
}

/**
 * Cache-aside with stampede protection: only one caller rebuilds a missing key,
 * the others wait briefly and re-read it.
 */
export async function cacheGetOrSet<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const lockKey = `lock:${key}`;
  const acquired = await cacheRedis.set(lockKey, '1', 'EX', 5, 'NX');

  if (acquired) {
    try {
      const value = await fetchFn();
      await cacheSet(key, value, ttlSeconds);
      return value;
    } finally {
      await cacheRedis.del(lockKey);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  const retried = await cacheGet<T>(key);
  if (retried !== null) return retried;
  return fetchFn();
}

export function contentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
