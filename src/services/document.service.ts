import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { appEvents, EVENTS } from '../lib/events';
import { cacheDel, cacheGetOrSet, CACHE_TTL } from '../lib/cache';
import { detectFormat } from '../lib/documentExtractor';
import { DOCUMENT_QUOTA, Tier } from '../lib/permissions';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { documentQueue, documentJobId, queueDocumentForProcessing } from '../queues/document.queue';

// Never return the raw content in API responses: it can be megabytes of base64.
const documentSelect = {
  id: true,
  userId: true,
  title: true,
  filename: true,
  mimeType: true,
  fileSizeBytes: true,
  status: true,
  chunkCount: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

export type DocumentSummary = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;

export const documentCacheKey = (documentId: string) => `doc:${documentId}`;

export interface ListDocumentsOptions {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy?: 'createdAt' | 'title' | 'chunkCount';
  sortOrder?: 'asc' | 'desc';
}

export async function listDocuments(userId: string, options: ListDocumentsOptions) {
  const { page, limit, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = options;

  const where: Prisma.DocumentWhereInput = {
    userId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { filename: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // List and count in parallel.
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      select: documentSelect,
    }),
    prisma.document.count({ where }),
  ]);

  return { data: documents, meta: { page, limit, total } };
}

export async function getDocument(documentId: string, userId: string): Promise<DocumentSummary> {
  const doc = await cacheGetOrSet(documentCacheKey(documentId), CACHE_TTL.DOCUMENT, () =>
    prisma.document.findFirst({ where: { id: documentId, deletedAt: null }, select: documentSelect }),
  );
  // Someone else's document looks exactly like a missing one.
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  return doc;
}

export async function createDocument(input: {
  userId: string;
  tier: string;
  title: string;
  correlationId?: string;
  file?: { originalname: string; mimetype: string; buffer: Buffer };
  content?: string;
  filename?: string;
}) {
  const quota = DOCUMENT_QUOTA[input.tier as Tier] ?? DOCUMENT_QUOTA.free;
  const owned = await prisma.document.count({ where: { userId: input.userId, deletedAt: null } });
  if (owned >= quota) {
    throw new ForbiddenError(`Your ${input.tier} plan allows ${quota} documents. Delete one or upgrade.`);
  }

  let filename: string;
  let content: string;
  let size: number;

  if (input.file) {
    filename = input.file.originalname;
    // Validate the extension now so the user gets a 422 instead of a failed job later.
    const format = detectFormat(filename);
    content = format === 'pdf' ? input.file.buffer.toString('base64') : input.file.buffer.toString('utf-8');
    size = input.file.buffer.length;
  } else if (input.content) {
    filename = input.filename ?? `${slugify(input.title)}.txt`;
    detectFormat(filename);
    content = input.content;
    size = Buffer.byteLength(content, 'utf-8');
  } else {
    throw new ValidationError('Request validation failed', [{ field: 'file', message: 'Upload a file or send content' }]);
  }

  const doc = await prisma.document.create({
    data: {
      userId: input.userId,
      title: input.title,
      filename,
      mimeType: input.file?.mimetype ?? 'text/plain',
      content,
      fileSizeBytes: size,
      status: 'pending',
    },
    select: documentSelect,
  });

  const jobId = await queueDocumentForProcessing(doc.id, input.userId, input.correlationId);

  appEvents.emit(EVENTS.DOC_CREATED, {
    userId: input.userId,
    documentId: doc.id,
    title: doc.title,
    fileSizeBytes: size,
  });

  return { document: doc, jobId };
}

/** Soft delete: the row stays for audit/restore, but every query filters it out. */
export async function deleteDocument(documentId: string, userId: string) {
  const { count } = await prisma.document.updateMany({
    where: { id: documentId, userId, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: userId },
  });
  if (count === 0) throw new NotFoundError('Document not found');

  await cacheDel(documentCacheKey(documentId));
  appEvents.emit(EVENTS.DOC_DELETED, { documentId, deletedBy: userId });
}

export async function getProcessingStatus(documentId: string, userId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: { status: true, error: true, chunkCount: true },
  });
  if (!doc) throw new NotFoundError('Document not found');

  const job = await documentQueue.getJob(documentJobId(documentId));
  const progress = job && !(await job.isCompleted()) ? job.progress : null;

  return { ...doc, progress };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'document'
  );
}
