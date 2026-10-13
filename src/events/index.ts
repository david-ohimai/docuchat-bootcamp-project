import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { appEvents, EVENTS } from '../lib/events';
import { llmCostUsd } from '../lib/metrics';

/**
 * Side-effect listeners. Each one catches its own errors: a failed audit log
 * must never break a registration or an upload.
 * Import this module once at startup (app.ts and worker.ts do).
 */

type Listener = (data: any) => PromiseLike<unknown> | void;

function on(event: string, name: string, handler: Listener) {
  appEvents.on(event, async (data) => {
    try {
      await handler(data);
    } catch (error) {
      logger.error('Event listener failed', { event, listener: name, error: (error as Error).message });
    }
  });
}

function usage(userId: string, action: string, extra: { tokens?: number; costUsd?: number; metadata?: unknown } = {}) {
  return prisma.usageLog.create({
    data: {
      userId,
      action,
      tokens: extra.tokens ?? 0,
      costUsd: extra.costUsd ?? 0,
      metadata: extra.metadata ? JSON.stringify(extra.metadata) : null,
    },
  });
}

// Auth
on(EVENTS.USER_REGISTERED, 'signup-log', (u) => usage(u.id, 'signup', { metadata: { tier: u.tier } }));
on(EVENTS.USER_REGISTERED, 'welcome-conversation', (u) =>
  prisma.conversation.create({ data: { userId: u.id, title: 'Welcome to DocuChat' } }).then(() => undefined),
);
on(EVENTS.USER_LOGGED_IN, 'login-log', (d) => usage(d.userId, 'login', { metadata: { deviceInfo: d.deviceInfo } }));
on(EVENTS.LOGIN_FAILED, 'failed-login-warning', (d) => {
  logger.warn('Failed login attempt', { email: d.email, deviceInfo: d.deviceInfo });
});

// Documents
on(EVENTS.DOC_CREATED, 'document-created-log', (d) =>
  usage(d.userId, 'document_created', { metadata: { documentId: d.documentId, title: d.title, fileSizeBytes: d.fileSizeBytes } }),
);
on(EVENTS.DOC_DELETED, 'document-deleted-log', (d) =>
  usage(d.deletedBy, 'document_deleted', { metadata: { documentId: d.documentId } }),
);
on(EVENTS.DOC_PROCESSED, 'ingestion-log', (d) =>
  usage(d.userId, 'document_ingested', {
    metadata: { documentId: d.documentId, chunkCount: d.chunkCount, durationMs: d.durationMs, format: d.format, pageCount: d.pageCount },
  }),
);

// AI spend
on(EVENTS.EMBEDDING_GENERATED, 'embedding-usage', (d) => {
  llmCostUsd.inc({ kind: 'embedding', model: d.model }, d.costUsd);
  return usage(d.userId, 'embedding', {
    tokens: d.tokensUsed,
    costUsd: d.costUsd,
    metadata: { model: d.model, documentId: d.documentId, inputs: d.inputs },
  });
});
on(EVENTS.CHAT_COMPLETED, 'chat-usage', (d) => {
  llmCostUsd.inc({ kind: 'chat', model: d.model }, d.costUsd);
  return usage(d.userId, 'chat', {
    tokens: d.promptTokens + d.completionTokens,
    costUsd: d.costUsd,
    metadata: { model: d.model, conversationId: d.conversationId },
  });
});

// Security
on(EVENTS.PROMPT_INJECTION_SUSPECTED, 'injection-log', (d) =>
  usage(d.userId, 'prompt_injection_suspected', { metadata: { conversationId: d.conversationId } }),
);
