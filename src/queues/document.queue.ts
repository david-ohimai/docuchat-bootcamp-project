import { Queue } from 'bullmq';
import { redisConnection } from './connection';

export const DOCUMENT_QUEUE = 'document-processing';

export interface DocumentJobData {
  documentId: string;
  userId: string;
  correlationId?: string;
  queuedAt: number;
}

export const documentQueue = new Queue<DocumentJobData>(DOCUMENT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

// One job per document, so its status can be looked up by ID instead of
// scanning every waiting and active job.
export function documentJobId(documentId: string): string {
  return `doc-${documentId}`;
}

export async function queueDocumentForProcessing(
  documentId: string,
  userId: string,
  correlationId?: string,
): Promise<string | undefined> {
  const job = await documentQueue.add(
    'process-document',
    { documentId, userId, correlationId, queuedAt: Date.now() },
    { jobId: documentJobId(documentId) },
  );
  return job.id;
}
