import client from 'prom-client';

// Default Node.js metrics: event loop lag, memory, CPU, GC.
client.collectDefaultMetrics({ prefix: 'docuchat_' });

export const httpRequestsTotal = new client.Counter({
  name: 'docuchat_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
});

export const httpRequestDuration = new client.Histogram({
  name: 'docuchat_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const documentsProcessed = new client.Counter({
  name: 'docuchat_documents_processed_total',
  help: 'Documents processed by the ingestion worker',
  labelNames: ['status'], // success | failed
});

export const cacheOperations = new client.Counter({
  name: 'docuchat_cache_operations_total',
  help: 'Cache lookups',
  labelNames: ['result'], // hit | miss
});

export const ingestionDuration = new client.Histogram({
  name: 'docuchat_ingestion_duration_seconds',
  help: 'Document ingestion duration',
  labelNames: ['format'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

export const chunksPerDocument = new client.Histogram({
  name: 'docuchat_chunks_per_document',
  help: 'Number of chunks generated per document',
  buckets: [5, 10, 25, 50, 100, 250, 500],
});

export const embeddingCacheHits = new client.Counter({
  name: 'docuchat_embedding_cache_total',
  help: 'Embedding lookups by result',
  labelNames: ['result'], // hit | miss
});

export const llmCostUsd = new client.Counter({
  name: 'docuchat_llm_cost_usd_total',
  help: 'Estimated LLM spend in USD',
  labelNames: ['kind', 'model'], // kind: chat | embedding
});

export const metricsRegistry = client.register;
