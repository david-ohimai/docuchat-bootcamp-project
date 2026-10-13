import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokens';
import { UnauthorizedError } from '../lib/errors';

// Verifies the access token and attaches { id, tier } to req.user.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('No token provided'));
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    // A refresh token must never work as an access token.
    if (payload.type !== 'access') {
      return next(new UnauthorizedError('Invalid token type'));
    }
    req.user = { id: payload.sub, tier: payload.tier };
    next();
  } catch (error) {
    const expired = (error as Error).name === 'TokenExpiredError';
    next(new UnauthorizedError(expired ? 'Token expired' : 'Invalid token'));
  }
}
