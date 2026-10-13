import { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

// Every success response uses the same envelope: { success, data, meta? }.
export function ok<T>(res: Response, data: T, status = 200, meta?: PageMeta) {
  return res.status(status).json(meta ? { success: true, data, meta } : { success: true, data });
}
