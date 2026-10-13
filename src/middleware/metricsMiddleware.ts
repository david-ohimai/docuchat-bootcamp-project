import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal } from '../lib/metrics';

// /documents/3f2a...-uuid becomes /documents/:id. Without this, every ID creates
// a new time series (cardinality explosion).
export function normalizePath(path: string): string {
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+/g, '/:num');
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    // Read the route after the handler ran, when req.route is known.
    const path = normalizePath(req.baseUrl + (req.route?.path ?? req.path));
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestsTotal.inc({ method: req.method, path, status_code: String(res.statusCode) });
    httpRequestDuration.observe({ method: req.method, path }, seconds);
  });

  next();
}
