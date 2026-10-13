import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '../lib/errors';

/**
 * Validates body, query and params in one pass so the client sees every error at once,
 * then writes the parsed values back so Zod transforms and defaults are not lost.
 */
export function validate(schema: z.ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

    if (!result.success) {
      const details = result.error.errors.map((err) => ({
        field: err.path.slice(1).join('.'), // drop the body/query/params prefix
        message: err.message,
      }));
      return next(new ValidationError('Request validation failed', details));
    }

    const data = result.data as { body?: unknown; query?: unknown; params?: unknown };
    if (data.body !== undefined) req.body = data.body;
    if (data.query !== undefined) req.query = data.query as Request['query'];
    if (data.params !== undefined) req.params = data.params as Request['params'];
    next();
  };
}
