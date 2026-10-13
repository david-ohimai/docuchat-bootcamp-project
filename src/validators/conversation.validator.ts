import { z } from 'zod';

export const listConversationsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

export const createConversationSchema = z.object({
  body: z.object({
    title: z.string().trim().max(200).optional(),
    documentId: z.string().uuid().optional(),
  }),
});

export const conversationParamsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
});

export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid conversation ID'),
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Message cannot be empty').max(10000, 'Message too long'),
    documentId: z.string().uuid().optional(),
  }),
});
