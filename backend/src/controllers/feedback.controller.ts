/**
 * Feedback Controller — Active Learning
 * Handles classification correction submissions and feedback stats.
 */

import { Request, Response } from 'express';
import {
  submitCorrection,
  getFeedbackStats,
  getClassifiedEvents,
} from '../services/feedback.service';
import { logger } from '../config/monitoring.config';

/** POST /api/feedback/correct — submit a classification correction */
export async function correct(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { eventId, correctedTypeId } = req.body as { eventId: string; correctedTypeId: number };
    if (!eventId || !correctedTypeId) {
      res.status(400).json({ error: 'BadRequest', message: 'eventId and correctedTypeId are required' });
      return;
    }

    const result = await submitCorrection(userId, eventId, Number(correctedTypeId));
    if (!result.success) {
      res.status(400).json({ error: 'BadRequest', message: result.message });
      return;
    }
    res.json(result);
  } catch (err) {
    logger.error('Feedback correct endpoint failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}

/** GET /api/feedback/stats — feedback statistics for the session user */
export async function stats(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    const data = await getFeedbackStats(userId);
    res.json(data);
  } catch (err) {
    logger.error('Feedback stats endpoint failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}

/** GET /api/feedback/events — classified events list with correction state */
export async function events(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const userId = (req.query.userId as string) || sessionUserId;

    const limit  = Math.min(Number(req.query.limit) || 50, 200);
    const data   = await getClassifiedEvents(userId, limit);
    res.json({ events: data });
  } catch (err) {
    logger.error('Feedback events endpoint failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}
