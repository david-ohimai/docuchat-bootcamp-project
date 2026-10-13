import { Queue } from 'bullmq';
import { redisConnection } from './connection';

// Holding pen for jobs that failed every attempt. Inspect and retry from Bull Board.
export const deadLetterQueue = new Queue('dead-letter', { connection: redisConnection });
