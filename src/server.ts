import { app } from './app';
import { config } from './lib/config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createDocumentWorker } from './queues/document.worker';

const server = app.listen(config.PORT, () => {
  logger.info('Server started', { port: config.PORT, environment: config.NODE_ENV });
});

// In development the worker shares the API process. In production, set
// RUN_WORKER_IN_PROCESS=false and run `npm run start:worker` separately so
// CPU-heavy ingestion never slows down API requests.
const worker = config.RUN_WORKER_IN_PROCESS ? createDocumentWorker() : null;

async function shutdown(signal: string) {
  logger.info('Shutting down', { signal });
  server.close();
  await worker?.close(); // let in-flight jobs finish
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
