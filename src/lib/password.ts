import bcrypt from 'bcryptjs';

// bcrypt is deliberately slow; 12 rounds is roughly 250ms per hash.
const SALT_ROUNDS = 12;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

// bcrypt.compare is constant-time, so it is safe against timing attacks.
export function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
