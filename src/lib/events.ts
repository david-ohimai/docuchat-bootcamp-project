import { EventEmitter } from 'events';

// One application-wide emitter for fast, best-effort side effects
// (audit logs, usage tracking, cache invalidation). Anything slow or
// that must be retried belongs in a BullMQ queue instead.
export const appEvents = new EventEmitter();
appEvents.setMaxListeners(20);

export const EVENTS = {
  USER_REGISTERED: 'auth:user-registered',
  USER_LOGGED_IN: 'auth:user-logged-in',
  LOGIN_FAILED: 'auth:login-failed',

  DOC_CREATED: 'doc:created',
  DOC_PROCESSED: 'doc:processed',
  DOC_DELETED: 'doc:deleted',

  EMBEDDING_GENERATED: 'ai:embedding-generated',
  CHAT_COMPLETED: 'ai:chat-completed',
  PROMPT_INJECTION_SUSPECTED: 'security:prompt-injection-suspected',
} as const;
