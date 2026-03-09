/**
 * ML Prediction Controller
 *
 * Handles HTTP requests for workload forecasting and burnout scoring.
 */

import { Request, Response } from 'express';
import {
  runMLPredictions,
  getWorkloadForecast,
  getLatestBurnoutScore,
} from '../services/ml-prediction.service';
import { logger } from '../config/monitoring.config';

/**
 * POST /api/ml/predict
 * Run ML workload prediction + burnout scoring for the session user.
 */
export async function runPredictions(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const result = await runMLPredictions(userId);
    res.json({
      success:             result.success,
      workloadPredictions: result.workloadPredictions,
      burnoutScore:        result.burnoutScore,
      burnoutLevel:        result.burnoutLevel,
      error:               result.error,
    });
  } catch (err) {
    logger.error('ML predict endpoint failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to run ML predictions' });
  }
}

/**
 * GET /api/ml/workload-forecast
 * Return stored workload forecast for the session user.
 * Admins may pass ?userId= to view another user's forecast.
 * Auto-generates predictions on first fetch if none exist.
 */
export async function getWorkloadForecastHandler(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const userId   = (req.query.userId as string) || sessionUserId;
    let   forecast = await getWorkloadForecast(userId);

    // Auto-generate if no predictions stored yet (e.g. user has data but hasn't re-synced)
    if (forecast.length === 0) {
      logger.info('No forecast found — auto-generating ML predictions', { userId });
      await runMLPredictions(userId);
      forecast = await getWorkloadForecast(userId);
    }

    res.json({ forecast });
  } catch (err) {
    logger.error('Get workload forecast failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get workload forecast' });
  }
}

/**
 * GET /api/ml/burnout-score
 * Return latest burnout score for the session user.
 * Admins may pass ?userId= to view another user's score.
 * Auto-generates score on first fetch if none exists.
 */
export async function getBurnoutScoreHandler(req: Request, res: Response): Promise<void> {
  try {
    const sessionUserId = req.session.user_id;
    if (!sessionUserId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const userId = (req.query.userId as string) || sessionUserId;
    let   score  = await getLatestBurnoutScore(userId);

    // Auto-generate if no score stored yet
    if (!score) {
      logger.info('No burnout score found — auto-generating ML score', { userId });
      await runMLPredictions(userId);
      score = await getLatestBurnoutScore(userId);
    }

    res.json({ burnoutScore: score });
  } catch (err) {
    logger.error('Get burnout score failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get burnout score' });
  }
}
