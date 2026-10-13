import { Request, Response } from 'express';
import * as conversationService from '../services/conversation.service';
import { ok } from '../lib/response';

export async function listConversations(req: Request, res: Response) {
  const { data, meta } = await conversationService.listConversations(req.user!.id, req.query as any);
  ok(res, data, 200, meta);
}

export async function createConversation(req: Request, res: Response) {
  ok(res, await conversationService.createConversation(req.user!.id, req.body), 201);
}

export async function listMessages(req: Request, res: Response) {
  ok(res, await conversationService.listMessages(req.params.id, req.user!.id));
}

export async function sendMessage(req: Request, res: Response) {
  const result = await conversationService.sendMessage({
    conversationId: req.params.id,
    userId: req.user!.id,
    content: req.body.content,
    documentId: req.body.documentId,
    correlationId: req.correlationId,
  });
  ok(res, result, 201);
}
