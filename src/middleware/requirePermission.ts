import { Request, Response, NextFunction } from 'express';
import { hasPermission, Permission } from '../lib/permissions';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';

// 401 = not logged in. 403 = logged in, but not allowed.
export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasPermission(req.user.tier, permission)) return next(new ForbiddenError());
    next();
  };
}
