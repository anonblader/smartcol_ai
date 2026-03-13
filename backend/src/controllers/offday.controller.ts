/**
 * Off-Day Recommendation Controller
 */

import { Request, Response } from 'express';
import {
  generateRecommendations,
  getPendingRecommendations,
  getAllRecommendations,
  respondToRecommendation,
  getAllUsersRecommendations,
  calculateOffDayBalance,
} from '../services/offday.service';
import { logger } from '../config/monitoring.config';
import { db } from '../services/database.client';
import { User } from '../types';
import { isAdminEmail } from '../utils/auth.utils';

async function getSessionUser(req: Request) {
  const userId = req.session.user_id;
  if (!userId) return null;
  return db.queryOne<User>('SELECT * FROM users WHERE id = $1', [userId]);
}

/** POST /api/offday/generate — generate recommendations for session user */
export async function generate(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    logger.info('Generating off-day recommendations', { userId });
    const result = await generateRecommendations(userId);

    if (result.success) {
      res.json({
        success: true,
        message: `Generated ${result.recommendationsGenerated} recommendations`,
        topDates: result.topDates,
        count: result.recommendationsGenerated,
      });
    } else {
      res.status(500).json({ error: 'GenerationFailed', message: result.error });
    }
  } catch (err) {
    logger.error('Generate recommendations failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to generate recommendations' });
  }
}

/** GET /api/offday/pending — get pending recommendations */
export async function getPending(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    const recommendations = await getPendingRecommendations(userId);
    res.json({ recommendations });
  } catch (err) {
    logger.error('Get pending recommendations failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get recommendations' });
  }
}

/** GET /api/offday/all — get all recommendations (any status) */
export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    const recommendations = await getAllRecommendations(userId);
    res.json({ recommendations });
  } catch (err) {
    logger.error('Get all recommendations failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get recommendations' });
  }
}

/** POST /api/offday/:id/accept — accept a recommendation */
export async function accept(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const ok = await respondToRecommendation(userId, req.params.id ?? '', 'accepted');
    if (ok) {
      res.json({ success: true, message: 'Recommendation accepted — enjoy your day off!' });
    } else {
      res.status(404).json({ error: 'NotFound', message: 'Recommendation not found or already responded' });
    }
  } catch (err) {
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to accept' });
  }
}

/** POST /api/offday/:id/reject — reject a recommendation */
export async function reject(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const ok = await respondToRecommendation(userId, req.params.id ?? '', 'rejected');
    if (ok) {
      res.json({ success: true, message: 'Recommendation declined' });
    } else {
      res.status(404).json({ error: 'NotFound', message: 'Recommendation not found or already responded' });
    }
  } catch (err) {
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to reject' });
  }
}

/** GET /api/offday/balance — entitlement balance for session user (or ?userId= for admin) */
export async function getBalance(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    const balance = await calculateOffDayBalance(userId);
    res.json({ balance });
  } catch (err) {
    logger.error('Get off-day balance failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get balance' });
  }
}

/** GET /api/offday/team — admin view of all pending recommendations across all users */
export async function getTeam(req: Request, res: Response): Promise<void> {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser || !isAdminEmail(sessionUser.email)) {
      res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
      return;
    }

    const recommendations = await getAllUsersRecommendations();
    res.json({ recommendations });
  } catch (err) {
    logger.error('Get team recommendations failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get team recommendations' });
  }
}
