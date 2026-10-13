import IORedis from 'ioredis';
import { config } from '../lib/config';

// Shared by every BullMQ queue and worker. maxRetriesPerRequest: null is required
// by BullMQ's blocking commands.
export const redisConnection = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: null,
});
