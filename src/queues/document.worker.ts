import { Worker, Job } from 'bullmq';
import { redisConnection } from './connection';
import { DOCUMENT_QUEUE, DocumentJobData } from './document.queue';
import { deadLetterQueue } from './dead-letter.queue';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { appEvents, EVENTS } from '../lib/events';
import { cacheDel } from '../lib/cache';
import { detectFormat, extractText } from '../lib/documentExtractor';
import { chunkDocument } from '../lib/chunker';
import { documentsProcessed, ingestionDuration, chunksPerDocument } from '../lib/metrics';
import { generateEmbeddingsBatchCached, storeChunkEmbeddingsBatch } from '../services/embedding.service';
import { documentCacheKey } from '../services/document.service';

// Status changes must also clear the cached document, or clients polling
// GET /documents/:id would see "pending" until the cache expired.
async function setStatus(documentId: string, data: { status: string; chunkCount?: number; error?: string | null }) {
  await prisma.document.update({ where: { id: documentId }, data });
  await cacheDel(documentCacheKey(documentId));
}

/** extract → chunk → store chunks → embed → store vectors → mark ready */
export async function processDocument(job: Job<DocumentJobData>) {
  const { documentId, userId, correlationId } = job.data;
  const startTime = Date.now();
  const ctx = { correlationId, documentId, jobId: job.id, attempt: job.attemptsMade + 1 };

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || doc.deletedAt) {
    logger.warn('Document gone before processing; skipping', ctx);
    return { skipped: true };
  }

  await setStatus(documentId, { status: 'processing', error: null });
  logger.info('Document processing started', ctx);

  const format = detectFormat(doc.filename);
  const { text, pageCount } = await extractText(doc.content, format);
  await job.updateProgress(15);
  if (!text.trim()) throw new Error('No extractable text found (is the PDF a scanned image?)');

  const chunks = chunkDocument(text, { maxTokens: 500, overlapTokens: 50, minChunkTokens: 50 });
  await job.updateProgress(30);

  // Idempotent: a retry replaces chunks instead of duplicating them.
  await prisma.$transaction([
    prisma.chunk.deleteMany({ where: { documentId } }),
    prisma.chunk.createMany({
      data: chunks.map((c) => ({
        documentId,
        index: c.index,
        content: c.text,
        tokenCount: c.tokenEstimate,
        startChar: c.metadata.startChar,
        endChar: c.metadata.endChar,
      })),
    }),
  ]);
  await job.updateProgress(50);

  // The expensive, failure-prone step: retries, circuit breaker and cache all apply here.
  const embeddings = await generateEmbeddingsBatchCached(
    chunks.map((c) => c.text),
    { userId, documentId, correlationId },
  );
  await job.updateProgress(85);

  const stored = await prisma.chunk.findMany({
    where: { documentId },
    orderBy: { index: 'asc' },
    select: { id: true },
  });
  await storeChunkEmbeddingsBatch(stored.map((c, i) => ({ id: c.id, embedding: embeddings[i] })));
  await job.updateProgress(95);

  await setStatus(documentId, { status: 'ready', chunkCount: chunks.length });
  await job.updateProgress(100);

  const durationMs = Date.now() - startTime;
  ingestionDuration.observe({ format }, durationMs / 1000);
  chunksPerDocument.observe(chunks.length);
  documentsProcessed.inc({ status: 'success' });

  appEvents.emit(EVENTS.DOC_PROCESSED, { documentId, userId, correlationId, chunkCount: chunks.length, durationMs, format, pageCount });
  logger.info('Document processing complete', { ...ctx, chunkCount: chunks.length, durationMs });

  return { success: true, chunks: chunks.length, durationMs };
}

export function createDocumentWorker() {
  const worker = new Worker<DocumentJobData>(DOCUMENT_QUEUE, processDocument, {
    connection: redisConnection,
    concurrency: 3,
  });

  worker.on('failed', async (job, error) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    logger.error('Document job failed', {
      jobId: job.id,
      documentId: job.data.documentId,
      attempt: job.attemptsMade,
      of: attempts,
      error: error.message,
    });

    // Only report "failed" to the user once every retry is used up.
    if (job.attemptsMade >= attempts) {
      documentsProcessed.inc({ status: 'failed' });
      await setStatus(job.data.documentId, { status: 'failed', error: error.message.slice(0, 500) }).catch(() => {});
      await deadLetterQueue.add('failed-document', {
        originalJobId: job.id,
        originalQueue: DOCUMENT_QUEUE,
        data: job.data,
        error: error.message,
        failedAt: new Date().toISOString(),
        attempts: job.attemptsMade,
      });
    }
  });

  // Without an 'error' listener, a Redis connection problem crashes the process.
  worker.on('error', (error) => logger.error('Worker error', { error: error.message }));

  logger.info('Document worker started', { queue: DOCUMENT_QUEUE, concurrency: 3 });
  return worker;
}
