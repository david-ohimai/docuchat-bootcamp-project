// Tier-based permissions. Every tier can work with its own documents and
// conversations; only enterprise accounts can open the queue dashboard.
// (Rate limits and quotas differ per tier: see middleware/rateLimiter.ts.)

export type Tier = 'free' | 'pro' | 'enterprise';

export const PERMISSIONS = {
  DOCUMENTS_READ: 'documents:read',
  DOCUMENTS_CREATE: 'documents:create',
  DOCUMENTS_DELETE: 'documents:delete',
  CONVERSATIONS_READ: 'conversations:read',
  CONVERSATIONS_CREATE: 'conversations:create',
  ADMIN_QUEUES: 'admin:queues',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const BASE: Permission[] = [
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_CREATE,
  PERMISSIONS.DOCUMENTS_DELETE,
  PERMISSIONS.CONVERSATIONS_READ,
  PERMISSIONS.CONVERSATIONS_CREATE,
];

const TIER_PERMISSIONS: Record<Tier, ReadonlySet<Permission>> = {
  free: new Set(BASE),
  pro: new Set(BASE),
  enterprise: new Set([...BASE, PERMISSIONS.ADMIN_QUEUES]),
};

export function hasPermission(tier: string, permission: Permission): boolean {
  return TIER_PERMISSIONS[tier as Tier]?.has(permission) ?? false;
}

// Per-tier document quota (enforced on upload).
export const DOCUMENT_QUOTA: Record<Tier, number> = {
  free: 5,
  pro: 100,
  enterprise: Number.POSITIVE_INFINITY,
};
