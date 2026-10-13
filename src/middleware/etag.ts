import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Fingerprints JSON responses; if the client already has this version, send 304 with no body.
export function conditionalGet() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = (body: unknown) => {
      const etag = `"${crypto.createHash('md5').update(JSON.stringify(body)).digest('hex')}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, no-cache'); // cache, but revalidate every time
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return res;
      }
      return originalJson(body);
    };

    next();
  };
}
