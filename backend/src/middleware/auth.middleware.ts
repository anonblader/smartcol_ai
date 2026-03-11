/**
 * Auth Middleware
 *
 * Centralised session-based authentication guard.
 * Apply this to any route group that requires a logged-in user.
 *
 * Usage in app.ts:
 *   import { requireAuth } from './middleware/auth.middleware';
 *   app.use('/api/sync', requireAuth, syncRoutes);
 */

import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user_id) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    return;
  }
  next();
}
