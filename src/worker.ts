// Standalone worker process: `npm run worker` (dev) or `npm run start:worker` (prod).
import './events';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createDocumentWorker } from './queues/document.worker';

const worker = createDocumentWorker();

async function shutdown(signal: string) {
  logger.info('Worker shutting down', { signal });
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
