import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateEmbeddingCached, toVectorLiteral } from './embedding.service';

export interface SearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  score: number; // cosine similarity: higher = more relevant
}

/**
 * Semantic search over the user's own, active, fully processed documents.
 * Ownership is part of the SQL, so vector search can never leak another user's chunks.
 */
export async function semanticSearch(options: {
  query: string;
  userId: string;
  documentId?: string;
  topK?: number;
  minScore?: number;
  correlationId?: string;
}): Promise<SearchResult[]> {
  const { query, userId, documentId, topK = 10, minScore = 0.3, correlationId } = options;
  const start = Date.now();

  const queryEmbedding = await generateEmbeddingCached(query, { userId, correlationId });
  const vector = toVectorLiteral(queryEmbedding);
  const documentFilter = documentId ? Prisma.sql`AND d.id = ${documentId}` : Prisma.empty;

  // <=> is cosine distance (lower = closer); 1 - distance gives similarity.
  const rows = await prisma.$queryRaw<SearchResult[]>`
    SELECT
      c.id AS "chunkId",
      c."documentId",
      d.title AS "documentTitle",
      c.content,
      c.index AS "chunkIndex",
      c."tokenCount",
      (1 - (c.embedding <=> ${vector}::vector))::float AS score
    FROM "Chunk" c
    JOIN "Document" d ON d.id = c."documentId"
    WHERE d."userId" = ${userId}
      AND d."deletedAt" IS NULL
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
      ${documentFilter}
    ORDER BY c.embedding <=> ${vector}::vector
    LIMIT ${topK}
  `;

  // Without a floor, top-K always returns K rows, even when none are relevant.
  const results = rows.filter((r) => r.score >= minScore);

  logger.info('Semantic search completed', {
    correlationId,
    totalResults: rows.length,
    keptResults: results.length,
    topScore: results[0]?.score?.toFixed(4),
    durationMs: Date.now() - start,
  });

  return results;
}
