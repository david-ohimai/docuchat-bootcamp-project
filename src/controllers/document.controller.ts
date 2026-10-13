import { Request, Response } from 'express';
import * as documentService from '../services/document.service';
import { ok } from '../lib/response';

export async function listDocuments(req: Request, res: Response) {
  const { data, meta } = await documentService.listDocuments(req.user!.id, req.query as any);
  ok(res, data, 200, meta);
}

export async function getDocument(req: Request, res: Response) {
  ok(res, await documentService.getDocument(req.params.id, req.user!.id));
}

export async function createDocument(req: Request, res: Response) {
  const result = await documentService.createDocument({
    userId: req.user!.id,
    tier: req.user!.tier,
    title: req.body.title,
    content: req.body.content,
    filename: req.body.filename,
    file: req.file,
    correlationId: req.correlationId,
  });
  // 202 Accepted: the document exists, but processing happens in the background.
  ok(res, result, 202);
}

export async function deleteDocument(req: Request, res: Response) {
  await documentService.deleteDocument(req.params.id, req.user!.id);
  ok(res, { id: req.params.id, deleted: true });
}

export async function getProcessingStatus(req: Request, res: Response) {
  ok(res, await documentService.getProcessingStatus(req.params.id, req.user!.id));
}
