/**
 * Admin Middleware
 *
 * Restricts access to admin-only routes.
 * Checks if the session user's email is in the ADMIN_EMAILS list.
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../services/database.client';
import { config } from '../config/env';
import { User } from '../types';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.session.user_id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
    return;
  }

  const user = await db.queryOne<User>('SELECT email FROM users WHERE id = $1', [userId]);

  if (!user || !config.admin.emails.includes(user.email.toLowerCase())) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required',
      redirectTo: config.admin.frontendUrl,
    });
    return;
  }

  next();
}
