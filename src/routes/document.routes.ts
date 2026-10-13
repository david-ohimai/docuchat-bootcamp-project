import { Router } from 'express';
import multer from 'multer';
import * as documents from '../controllers/document.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { sanitizeInput } from '../middleware/sanitize';
import { conditionalGet } from '../middleware/etag';
import { apiLimiter, uploadLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../lib/asyncHandler';
import { PERMISSIONS } from '../lib/permissions';
import { createDocumentSchema, documentParamsSchema, listDocumentsSchema } from '../validators/document.validator';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
});

const router = Router();

// Authenticate first so the limiter can key on the user and their tier.
router.use(authenticate, apiLimiter);

/**
 * @swagger
 * /documents:
 *   get:
 *     summary: List the user's documents
 *     tags: [Documents]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, processing, ready, failed] } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: sortBy, schema: { type: string, enum: [createdAt, title, chunkCount] } }
 *       - { in: query, name: sortOrder, schema: { type: string, enum: [asc, desc] } }
 *     responses:
 *       200: { description: Paginated list of documents }
 *       401: { description: Not authenticated }
 */
router.get(
  '/',
  requirePermission(PERMISSIONS.DOCUMENTS_READ),
  validate(listDocumentsSchema),
  asyncHandler(documents.listDocuments),
);

/**
 * @swagger
 * /documents:
 *   post:
 *     summary: Upload a document (.txt, .md or .pdf). Processing is asynchronous.
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, file]
 *             properties:
 *               title: { type: string }
 *               file: { type: string, format: binary }
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *               filename: { type: string, example: notes.md }
 *     responses:
 *       202: { description: "Accepted. Poll /documents/{id}/processing-status for progress." }
 *       403: { description: Document quota reached }
 *       422: { description: Unsupported file format }
 *       429: { description: Upload rate limit reached }
 */
router.post(
  '/',
  uploadLimiter,
  requirePermission(PERMISSIONS.DOCUMENTS_CREATE),
  upload.single('file'),
  sanitizeInput, // multipart fields only exist after multer runs
  validate(createDocumentSchema),
  asyncHandler(documents.createDocument),
);

/**
 * @swagger
 * /documents/{id}:
 *   get:
 *     summary: Get a document's metadata and status
 *     tags: [Documents]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: The document }
 *       304: { description: Not modified (ETag matched) }
 *       404: { description: Not found }
 */
router.get(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENTS_READ),
  validate(documentParamsSchema),
  conditionalGet(),
  asyncHandler(documents.getDocument),
);

/**
 * @swagger
 * /documents/{id}/processing-status:
 *   get:
 *     summary: Processing status and progress (0-100) of an upload
 *     tags: [Documents]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Status, error and progress }
 */
router.get(
  '/:id/processing-status',
  requirePermission(PERMISSIONS.DOCUMENTS_READ),
  validate(documentParamsSchema),
  asyncHandler(documents.getProcessingStatus),
);

/**
 * @swagger
 * /documents/{id}:
 *   delete:
 *     summary: Soft-delete a document
 *     tags: [Documents]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENTS_DELETE),
  validate(documentParamsSchema),
  asyncHandler(documents.deleteDocument),
);

export default router;
