import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { appEvents, EVENTS } from '../lib/events';
import { cacheGet, cacheSet, contentHash, CACHE_TTL } from '../lib/cache';
import { embeddingCacheHits } from '../lib/metrics';
import { openaiRequest } from '../lib/http/openai.breaker';

export const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100; // OpenAI accepts up to 2048 inputs; stay well under
const PRICE_PER_MILLION_TOKENS = 0.02; // text-embedding-3-small

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[];
  usage?: { total_tokens: number };
}

// Who to bill an embedding call to (for UsageLog and cost tracking).
export interface UsageContext {
  userId: string;
  documentId?: string;
  correlationId?: string;
}

const cacheKey = (text: string) => `embed:${config.EMBEDDING_MODEL}:${contentHash(text)}`;

/** Embeds texts in batches, preserving input order. */
export async function generateEmbeddings(texts: string[], usage: UsageContext): Promise<number[][]> {
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openaiRequest<EmbeddingResponse>('/embeddings', {
      input: batch,
      model: config.EMBEDDING_MODEL,
    });

    // The API does not guarantee response order matches input order.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embeddings, got ${item.embedding.length}`);
      }
      all.push(item.embedding);
    }

    const tokensUsed = response.usage?.total_tokens ?? 0;
    appEvents.emit(EVENTS.EMBEDDING_GENERATED, {
      ...usage,
      model: config.EMBEDDING_MODEL,
      tokensUsed,
      costUsd: (tokensUsed / 1_000_000) * PRICE_PER_MILLION_TOKENS,
      inputs: batch.length,
    });
  }

  return all;
}

/** Same text + same model = same vector, so cache by content hash and never pay twice. */
export async function generateEmbeddingCached(text: string, usage: UsageContext): Promise<number[]> {
  const [embedding] = await generateEmbeddingsBatchCached([text], usage);
  return embedding;
}

export async function generateEmbeddingsBatchCached(texts: string[], usage: UsageContext): Promise<number[][]> {
  const results: (number[] | null)[] = await Promise.all(texts.map((t) => cacheGet<number[]>(cacheKey(t))));
  const missing = results.flatMap((r, index) => (r ? [] : [index]));

  embeddingCacheHits.inc({ result: 'hit' }, texts.length - missing.length);
  embeddingCacheHits.inc({ result: 'miss' }, missing.length);
  logger.debug('Embedding cache check', {
    correlationId: usage.correlationId,
    total: texts.length,
    cacheHits: texts.length - missing.length,
  });

  if (missing.length > 0) {
    const fresh = await generateEmbeddings(
      missing.map((i) => texts[i]),
      usage,
    );
    await Promise.all(
      missing.map((textIndex, k) => {
        results[textIndex] = fresh[k];
        return cacheSet(cacheKey(texts[textIndex]), fresh[k], CACHE_TTL.EMBEDDING);
      }),
    );
  }

  return results as number[][];
}

export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/** Prisma has no vector type, so embeddings are written with parameterised raw SQL. */
export async function storeChunkEmbeddingsBatch(chunks: { id: string; embedding: number[] }[]): Promise<void> {
  await prisma.$transaction(
    chunks.map(
      (chunk) => prisma.$executeRaw`
        UPDATE "Chunk" SET embedding = ${toVectorLiteral(chunk.embedding)}::vector WHERE id = ${chunk.id}
      `,
    ),
  );
}
