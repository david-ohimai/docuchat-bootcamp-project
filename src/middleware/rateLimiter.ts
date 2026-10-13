import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { cacheRedis } from '../lib/cache';

type Tier = 'free' | 'pro' | 'enterprise';

/**
 * Redis-backed limiter so the limit holds across multiple API instances.
 * Each limiter needs its own key prefix: with a shared prefix, the upload and
 * chat limiters would silently count against each other.
 */
function createLimiter(options: {
  name: string;
  windowMs: number;
  limit: number | ((req: Request) => number);
  message: string;
  keyGenerator?: (req: Request) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7', // RateLimit-* headers + Retry-After
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `rl:${options.name}:`,
      sendCommand: (command: string, ...args: string[]) =>
        cacheRedis.call(command, ...args) as Promise<RedisReply>,
    }),
    message: { success: false, error: { code: 'RATE_LIMITED', message: options.message } },
    keyGenerator: options.keyGenerator ?? ((req: Request) => req.user?.id ?? req.ip ?? 'anonymous'),
  });
}

function byTier(limits: Record<Tier, number>) {
  return (req: Request) => limits[(req.user?.tier as Tier) ?? 'free'] ?? limits.free;
}

// Auth: same for everyone, keyed by IP (there is no user yet).
export const authLimiter = createLimiter({
  name: 'auth',
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Too many auth attempts. Please try again later.',
  keyGenerator: (req) => req.ip ?? 'anonymous',
});

// These run after `authenticate`, so they can key on the user and their tier.
// (Mounted before authentication, every request would count as an anonymous free user.)
export const apiLimiter = createLimiter({
  name: 'api',
  windowMs: 15 * 60 * 1000,
  limit: byTier({ free: 100, pro: 500, enterprise: 2000 }),
  message: 'Rate limit exceeded. Please slow down.',
});

export const uploadLimiter = createLimiter({
  name: 'upload',
  windowMs: 60 * 60 * 1000,
  limit: byTier({ free: 5, pro: 50, enterprise: 500 }),
  message: 'Upload limit reached. Please try again later.',
});

export const chatLimiter = createLimiter({
  name: 'chat',
  windowMs: 60 * 1000,
  limit: byTier({ free: 10, pro: 30, enterprise: 100 }),
  message: 'Too many questions. Please slow down.',
});
