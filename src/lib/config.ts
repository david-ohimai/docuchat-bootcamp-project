import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Every environment variable the app needs, validated once at startup.
// A misconfigured app should refuse to start, not fail later at runtime.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().default(6379),

    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
    CHAT_MODEL: z.string().default('gpt-4o-mini'),
    EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

    FRONTEND_URL: z.string().default('http://localhost:3001'),
    RUN_WORKER_IN_PROCESS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine((env) => env.JWT_ACCESS_SECRET !== env.JWT_REFRESH_SECRET, {
    // If they matched, a refresh token could be used as an access token.
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\nInvalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
