import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from './config';

export interface TokenPayload {
  sub: string; // user id
  tier: string;
  type: 'access' | 'refresh';
  jti?: string;
}

interface TokenUser {
  id: string;
  tier: string;
}

export function generateAccessToken(user: TokenUser): string {
  return jwt.sign({ sub: user.id, tier: user.tier, type: 'access' }, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(user: TokenUser): string {
  // jti makes every refresh token unique, even two issued in the same second
  // (otherwise their SHA-256 hashes would collide on the unique index).
  return jwt.sign(
    { sub: user.id, tier: user.tier, type: 'refresh', jti: crypto.randomUUID() },
    config.JWT_REFRESH_SECRET,
    { expiresIn: `${config.REFRESH_TOKEN_TTL_DAYS}d` as SignOptions['expiresIn'] },
  );
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenPayload;
}

// Refresh tokens are stored hashed, so a database leak does not leak usable tokens.
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
