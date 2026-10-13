import { describe, it, expect, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { isRetryable, retryDelayMs, withRetry } from '../src/lib/http/retry';
import { validate } from '../src/middleware/validate';
import { normalizePath } from '../src/middleware/metricsMiddleware';
import { ValidationError } from '../src/lib/errors';
import { detectFormat, stripMarkdown, cleanExtractedText } from '../src/lib/documentExtractor';

function httpError(status?: number, headers: Record<string, string> = {}) {
  const err = new AxiosError('fail');
  if (status) {
    err.response = { status, headers, data: {}, statusText: '', config: { headers: new AxiosHeaders() } };
  }
  return err;
}

describe('retry policy', () => {
  it('retries timeouts, 408, 429 and 5xx but not other 4xx', () => {
    expect(isRetryable(httpError())).toBe(true);
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
    expect(isRetryable(httpError(400))).toBe(false);
    expect(isRetryable(httpError(401))).toBe(false);
  });

  it('honours Retry-After, else backs off exponentially', () => {
    expect(retryDelayMs(httpError(429, { 'retry-after': '3' }), 1, 1000)).toBe(3000);
    expect(retryDelayMs(httpError(503), 1, 1000)).toBe(1000);
    expect(retryDelayMs(httpError(503), 3, 1000)).toBe(4000);
  });

  it('gives up immediately on a permanent failure', async () => {
    const op = vi.fn().mockRejectedValue(httpError(400));
    await expect(withRetry(op, { baseDelayMs: 1 })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('succeeds after a transient failure', async () => {
    const op = vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValue('ok');
    await expect(withRetry(op, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe('validate middleware', () => {
  const schema = z.object({
    query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
    params: z.object({ id: z.string().uuid('Invalid ID') }),
  });

  it('coerces and writes back validated values', () => {
    const req = { body: {}, query: { page: '2' }, params: { id: '3f2a6c1e-8b7d-4c3a-9e1f-0a1b2c3d4e5f' } } as unknown as Request;
    const next = vi.fn();
    validate(schema)(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.query.page).toBe(2);
  });

  it('reports every invalid field at once, without the body/query prefix', () => {
    const req = { body: {}, query: { page: '0' }, params: { id: 'nope' } } as unknown as Request;
    const next = vi.fn();
    validate(schema)(req, {} as Response, next);
    const error = next.mock.calls[0][0] as ValidationError;
    expect(error).toBeInstanceOf(ValidationError);
    expect((error.details as { field: string }[]).map((d) => d.field).sort()).toEqual(['id', 'page']);
  });
});

describe('metrics path normalisation', () => {
  it('collapses IDs so each route is one time series', () => {
    expect(normalizePath('/api/v1/documents/3f2a6c1e-8b7d-4c3a-9e1f-0a1b2c3d4e5f')).toBe('/api/v1/documents/:id');
    expect(normalizePath('/items/42')).toBe('/items/:num');
  });
});

describe('document extraction', () => {
  it('detects formats by extension and rejects others', () => {
    expect(detectFormat('notes.MD')).toBe('markdown');
    expect(detectFormat('report.pdf')).toBe('pdf');
    expect(() => detectFormat('photo.png')).toThrow(/Unsupported/);
  });

  it('strips markdown syntax but keeps the words', () => {
    expect(stripMarkdown('# Title\n**Bold** and [a link](http://x.y)\n- item')).toBe('Title\nBold and a link\nitem');
  });

  it('collapses messy whitespace but keeps paragraph breaks', () => {
    expect(cleanExtractedText('a   b\r\n\r\n\r\n\r\nc')).toBe('a b\n\nc');
  });
});
