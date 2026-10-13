import { Router } from 'express';
import * as conversations from '../controllers/conversation.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { apiLimiter, chatLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../lib/asyncHandler';
import { PERMISSIONS } from '../lib/permissions';
import {
  conversationParamsSchema,
  createConversationSchema,
  listConversationsSchema,
  sendMessageSchema,
} from '../validators/conversation.validator';

const router = Router();
router.use(authenticate, apiLimiter);

/**
 * @swagger
 * /conversations:
 *   get:
 *     summary: List conversations with last message and message count
 *     tags: [Conversations]
 *     responses:
 *       200: { description: Paginated conversations }
 *   post:
 *     summary: Start a conversation, optionally scoped to one document
 *     tags: [Conversations]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               documentId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Created }
 *       422: { description: Document not found }
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.CONVERSATIONS_READ),
  validate(listConversationsSchema),
  asyncHandler(conversations.listConversations),
);
router.post(
  '/',
  requirePermission(PERMISSIONS.CONVERSATIONS_CREATE),
  validate(createConversationSchema),
  asyncHandler(conversations.createConversation),
);

/**
 * @swagger
 * /conversations/{id}/messages:
 *   get:
 *     summary: Messages in a conversation, oldest first
 *     tags: [Conversations]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Messages, with citation metadata on answers }
 *   post:
 *     summary: Ask a question. Runs the RAG pipeline and returns an answer with citations.
 *     tags: [Conversations]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, example: What is the refund window? }
 *               documentId: { type: string, format: uuid }
 *     responses:
 *       201: { description: The question and the cited answer }
 *       429: { description: Too many questions }
 *       503: { description: AI provider unavailable (circuit open) }
 */
router.get(
  '/:id/messages',
  requirePermission(PERMISSIONS.CONVERSATIONS_READ),
  validate(conversationParamsSchema),
  asyncHandler(conversations.listMessages),
);
router.post(
  '/:id/messages',
  chatLimiter,
  requirePermission(PERMISSIONS.CONVERSATIONS_CREATE),
  validate(sendMessageSchema),
  asyncHandler(conversations.sendMessage),
);

export default router;
