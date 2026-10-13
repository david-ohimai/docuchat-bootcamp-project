import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

// Strip tokens, API keys and passwords before anything reaches logs.
export function scrubSensitiveData(text: string): string {
  return [
    /Bearer [A-Za-z0-9\-._~+/]+=*/g,
    /sk-[A-Za-z0-9_-]{20,}/g,
    /password["']?\s*[:=]\s*["']?[^"'\s,}]+/gi,
    /postgres(ql)?:\/\/[^\s"']+/gi,
  ].reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), text);
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}

// Registered last. Operational errors keep their status and message;
// anything else is a bug and the client only sees a generic 500.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  if (err instanceof MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } });
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    path: req.path,
    error: scrubSensitiveData(error.message),
    stack: error.stack ? scrubSensitiveData(error.stack) : undefined,
  });

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', correlationId: req.correlationId },
  });
}
