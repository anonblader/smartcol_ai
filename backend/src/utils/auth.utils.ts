/**
 * Shared authentication & authorization utilities.
 *
 * Extracted from individual controllers to eliminate duplication.
 */

import { Request } from 'express';
import { config } from '../config/env';
import { db } from '../services/database.client';

/**
 * Resolve which userId to query.
 * Session is REQUIRED — the ?userId= query param alone is not sufficient (prevents IDOR).
 *   - Unauthenticated → returns null
 *   - Authenticated   → returns ?userId if provided, otherwise the session user's own id
 */
export function resolveUserId(req: Request): string | null {
  const sessionUserId = req.session.user_id;
  if (!sessionUserId) return null;
  return (req.query.userId as string) || sessionUserId;
}

/**
 * Check whether an email address belongs to an admin user.
 */
export function isAdminEmail(email: string): boolean {
  return config.admin.emails.includes(email.toLowerCase());
}

/**
 * Check whether the current request comes from an admin session.
 * Looks up the session user's email and checks against the admin list.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const userId = req.session.user_id;
  if (!userId) return false;
  const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  return !!user && isAdminEmail(user.email);
}
