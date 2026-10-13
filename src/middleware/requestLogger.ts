import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';

// Gives every request a correlation ID that appears on every log line it produces,
// is returned to the client, and is passed on to queue jobs.
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const incoming = req.headers['x-correlation-id'];
  const correlationId =
    typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  const startTime = Date.now();
  logger.http('Request received', { correlationId, method: req.method, path: req.path });

  res.on('finish', () => {
    const logData = {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startTime,
      userId: req.user?.id,
    };
    if (res.statusCode >= 500) logger.error('Request failed', logData);
    else if (res.statusCode >= 400) logger.warn('Request client error', logData);
    else logger.info('Request completed', logData);
  });

  next();
}
