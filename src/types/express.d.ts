// Request properties added by our middleware.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; tier: string };
      correlationId?: string;
    }
  }
}

export {};
