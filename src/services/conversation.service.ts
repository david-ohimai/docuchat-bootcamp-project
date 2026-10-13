import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { appEvents, EVENTS } from '../lib/events';
import { NotFoundError, UnprocessableError } from '../lib/errors';
import { detectPromptInjection } from '../lib/promptSanitizer';
import { NO_CONTEXT_ANSWER } from '../config/prompts';
import { semanticSearch } from './search.service';
import { assembleContext, generateRAGResponse, ChatMessage } from './rag.service';

export async function listConversations(userId: string, options: { page: number; limit: number }) {
  const { page, limit } = options;

  // Latest message and message count in the same query: no N+1.
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where: { userId } }),
  ]);

  return {
    data: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      documentId: c.documentId,
      messageCount: c._count.messages,
      lastMessage: c.messages[0] ?? null,
      updatedAt: c.updatedAt,
    })),
    meta: { page, limit, total },
  };
}

async function assertDocumentUsable(documentId: string, userId: string) {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, userId, deletedAt: null },
    select: { id: true },
  });
  // Valid JSON, but it points at nothing this user owns: 422, not 400.
  if (!doc) throw new UnprocessableError('Document not found');
}

export async function createConversation(userId: string, data: { title?: string; documentId?: string }) {
  if (data.documentId) await assertDocumentUsable(data.documentId, userId);
  return prisma.conversation.create({
    data: { userId, title: data.title ?? 'New conversation', documentId: data.documentId },
  });
}

async function getOwnedConversation(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new NotFoundError('Conversation not found');
  return conversation;
}

export async function listMessages(conversationId: string, userId: string) {
  await getOwnedConversation(conversationId, userId);
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });
  return messages.map((m) => ({ ...m, metadata: m.metadata ? JSON.parse(m.metadata) : null }));
}

/**
 * Ask a question in a conversation: retrieve → augment → generate → save.
 * The OpenAI calls run OUTSIDE the database transaction. A transaction that
 * waits several seconds on an external API holds a connection the whole time.
 */
export async function sendMessage(data: {
  conversationId: string;
  userId: string;
  content: string;
  documentId?: string;
  correlationId?: string;
}) {
  const conversation = await getOwnedConversation(data.conversationId, data.userId);
  const documentId = data.documentId ?? conversation.documentId ?? undefined;
  if (data.documentId) await assertDocumentUsable(data.documentId, data.userId);

  const injection = detectPromptInjection(data.content);
  if (injection.isSuspicious) {
    logger.warn('Possible prompt injection', { correlationId: data.correlationId, userId: data.userId });
    appEvents.emit(EVENTS.PROMPT_INJECTION_SUSPECTED, { userId: data.userId, conversationId: data.conversationId });
  }
  const question = injection.sanitized;

  // Recent history for follow-up questions (read before the new message is saved).
  const recent = await prisma.message.findMany({
    where: { conversationId: data.conversationId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { role: true, content: true },
  });
  const history = recent.reverse() as ChatMessage[];

  // 1. Retrieve
  const results = await semanticSearch({
    query: question,
    userId: data.userId,
    documentId,
    correlationId: data.correlationId,
  });

  // 2. Augment
  const context = assembleContext(results);

  // 3. Generate. Skip the LLM entirely when nothing relevant was found.
  const rag =
    context.chunks.length > 0
      ? await generateRAGResponse({
          question,
          context,
          history,
          userId: data.userId,
          conversationId: data.conversationId,
          correlationId: data.correlationId,
        })
      : { answer: NO_CONTEXT_ANSWER, citations: [], tokensUsed: { prompt: 0, completion: 0, total: 0 }, costUsd: 0, model: 'none' };

  // 4. Save both messages and touch the conversation atomically.
  // Explicit timestamps keep question-before-answer ordering even within one millisecond.
  const askedAt = new Date();
  const [userMessage, assistantMessage] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: data.conversationId, documentId, role: 'user', content: data.content, createdAt: askedAt },
    }),
    prisma.message.create({
      data: {
        conversationId: data.conversationId,
        documentId,
        createdAt: new Date(askedAt.getTime() + 1),
        role: 'assistant',
        content: rag.answer,
        promptTokens: rag.tokensUsed.prompt,
        completionTokens: rag.tokensUsed.completion,
        costUsd: rag.costUsd,
        metadata: JSON.stringify({ model: rag.model, citations: rag.citations, contextChunks: context.chunks.length }),
      },
    }),
    prisma.conversation.update({ where: { id: data.conversationId }, data: { updatedAt: new Date() } }),
  ]);

  return { userMessage, assistantMessage: { ...assistantMessage, citations: rag.citations } };
}
