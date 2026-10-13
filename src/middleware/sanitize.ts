import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

const xssOptions = {
  whiteList: {}, // strip every HTML tag
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style'],
};

// Fields that must reach the service byte-for-byte:
// - password / refreshToken: escaping "<" would silently change the credential.
// - content: document text and questions. Escaping would corrupt documents and
//   embeddings; this JSON API never renders it as HTML, so clients escape on output.
const PASSTHROUGH_KEYS = new Set(['password', 'refreshToken', 'content']);

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return xss(value, xssOptions);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      clean[key] = PASSTHROUGH_KEYS.has(key) ? v : sanitizeValue(v);
    }
    return clean;
  }
  return value;
}

// Runs before validation, so Zod validates the cleaned data.
// Also mounted after multer on upload routes, because multipart fields
// are only parsed at that point.
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query) as Request['query'];
  if (req.params) req.params = sanitizeValue(req.params) as Request['params'];
  next();
}
