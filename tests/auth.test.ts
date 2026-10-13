import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} from '../src/lib/tokens';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { authenticate } from '../src/middleware/authenticate';
import { UnauthorizedError } from '../src/lib/errors';

const user = { id: 'user-1', tier: 'pro' };

function runAuth(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as Request;
  const next = vi.fn();
  authenticate(req, {} as Response, next);
  return { req, error: next.mock.calls[0][0] };
}

describe('tokens', () => {
  it('round-trips an access token', () => {
    const payload = verifyAccessToken(generateAccessToken(user));
    expect(payload).toMatchObject({ sub: 'user-1', tier: 'pro', type: 'access' });
  });

  it('signs access and refresh tokens with different secrets', () => {
    expect(() => verifyAccessToken(generateRefreshToken(user))).toThrow();
    expect(() => verifyRefreshToken(generateAccessToken(user))).toThrow();
  });

  it('issues a unique refresh token every time, even within the same second', () => {
    const a = generateRefreshToken(user);
    const b = generateRefreshToken(user);
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Correct1horse');
    expect(hash).not.toContain('Correct1horse');
    expect(await verifyPassword('Correct1horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('authenticate middleware', () => {
  it('attaches the user for a valid access token', () => {
    const { req, error } = runAuth(`Bearer ${generateAccessToken(user)}`);
    expect(error).toBeUndefined();
    expect(req.user).toEqual({ id: 'user-1', tier: 'pro' });
  });

  it('rejects a missing token', () => {
    const { error } = runAuth();
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.message).toBe('No token provided');
  });

  it('rejects a refresh token used as an access token', () => {
    const { error } = runAuth(`Bearer ${generateRefreshToken(user)}`);
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a tampered token', () => {
    const token = generateAccessToken(user);
    const { error } = runAuth(`Bearer ${token.slice(0, -2)}xx`);
    expect(error.message).toBe('Invalid token');
  });
});
