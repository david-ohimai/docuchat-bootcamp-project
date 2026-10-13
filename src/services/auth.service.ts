import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshTokenExpiry,
} from '../lib/tokens';
import { appEvents, EVENTS } from '../lib/events';
import { ConflictError, UnauthorizedError } from '../lib/errors';

const publicUser = (u: { id: string; email: string; tier: string }) => ({ id: u.id, email: u.email, tier: u.tier });

async function issueTokens(user: { id: string; tier: string }, deviceInfo?: string) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: hashToken(refreshToken), // store the hash, never the raw token
      deviceInfo: deviceInfo?.slice(0, 255),
      expiresAt: refreshTokenExpiry(),
    },
  });
  return { accessToken, refreshToken };
}

export async function register(data: { email: string; password: string }) {
  const email = data.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new ConflictError('Email already registered');
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(data.password) },
  });

  // Side effects (signup log, welcome conversation) run in listeners; registration doesn't wait.
  appEvents.emit(EVENTS.USER_REGISTERED, publicUser(user));
  return publicUser(user);
}

export async function login(data: { email: string; password: string; deviceInfo?: string }) {
  const email = data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for unknown email and wrong password: no account enumeration.
  const valid = user?.isActive ? await verifyPassword(data.password, user.passwordHash) : false;
  if (!user || !valid) {
    appEvents.emit(EVENTS.LOGIN_FAILED, { email, deviceInfo: data.deviceInfo });
    throw new UnauthorizedError('Invalid credentials');
  }

  const tokens = await issueTokens(user, data.deviceInfo);
  appEvents.emit(EVENTS.USER_LOGGED_IN, { userId: user.id, deviceInfo: data.deviceInfo });
  return { ...tokens, user: publicUser(user) };
}

/** Refresh-token rotation: each refresh token works exactly once. */
export async function refresh(rawRefreshToken: string, deviceInfo?: string) {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token');
  }
  if (payload.type !== 'refresh') throw new UnauthorizedError('Invalid token type');

  // deleteMany is atomic: if two requests race with the same token, only one deletes it.
  const { count } = await prisma.refreshToken.deleteMany({
    where: { token: hashToken(rawRefreshToken), expiresAt: { gt: new Date() } },
  });
  if (count === 0) throw new UnauthorizedError('Refresh token expired or revoked');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw new UnauthorizedError('User not found or inactive');

  return issueTokens(user, deviceInfo);
}

export async function logout(rawRefreshToken: string) {
  // Idempotent: logging out with an unknown token is not an error.
  await prisma.refreshToken.deleteMany({ where: { token: hashToken(rawRefreshToken) } });
}
