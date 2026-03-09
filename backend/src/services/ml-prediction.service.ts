/**
 * ML Prediction Service
 *
 * Orchestrates workload prediction and burnout scoring:
 * 1. Reads historical workload from daily_workload / weekly_workload
 * 2. Calls the Python ML service (/predict/workload, /score/burnout)
 * 3. Persists results to workload_predictions and burnout_scores
 */

import { db }     from './database.client';
import { logger } from '../config/monitoring.config';
import { predictWorkload, scoreBurnout } from './ml-prediction.client';
import { triggerBurnoutWarningAlert }    from './email-alerts.service';

export interface MLPredictionResult {
  success: boolean;
  workloadPredictions: number;
  burnoutScore?: number;
  burnoutLevel?: string;
  error?: string;
}

/**
 * Run both ML models for a user and persist results to DB.
 * Called automatically at the end of each mock/real sync pipeline.
 */
export async function runMLPredictions(userId: string): Promise<MLPredictionResult> {
  const result: MLPredictionResult = { success: false, workloadPredictions: 0 };

  try {
    logger.info('Running ML predictions', { userId });

    // ── 1. Workload Prediction ─────────────────────────────────────────────────

    const dailyRows = await db.queryMany<{
      date: string | Date;
      work_minutes: number;
      meeting_minutes: number;
      focus_minutes: number;
      deadline_count: number;
    }>(
      `SELECT date, work_minutes, meeting_minutes, focus_minutes, deadline_count
       FROM daily_workload
       WHERE user_id = $1
       ORDER BY date ASC`,
      [userId]
    );

    if (dailyRows.length > 0) {
      const historicalDaily = dailyRows.map((r) => ({
        date: r.date instanceof Date
          ? r.date.toISOString().split('T')[0]!
          : String(r.date).split('T')[0]!,
        work_minutes:    Number(r.work_minutes),
        meeting_minutes: Number(r.meeting_minutes),
        focus_minutes:   Number(r.focus_minutes),
        deadline_count:  Number(r.deadline_count),
      }));

      const predResp = await predictWorkload(historicalDaily);

      if (predResp.predictions?.length > 0) {
        // Replace existing predictions for this user
        await db.query('DELETE FROM workload_predictions WHERE user_id = $1', [userId]);

        for (const pred of predResp.predictions) {
          await db.query(
            `INSERT INTO workload_predictions
               (user_id, predicted_date, predicted_minutes, predicted_hours,
                confidence, load_level, trend, model_version)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              userId,
              pred.date,
              pred.predicted_minutes,
              pred.predicted_hours,
              pred.confidence,
              pred.load_level,
              pred.trend,
              predResp.model_version || 'rf-workload-v1.0',
            ]
          );
        }

        result.workloadPredictions = predResp.predictions.length;
      }
    }

    // ── 2. Burnout Scoring ─────────────────────────────────────────────────────
    // Aggregate weekly metrics from daily_workload (has meeting_minutes/focus_minutes)
    // weekly_workload only stores total/work/overtime — not meeting or focus breakdowns.

    const weeklyRows = await db.queryMany<{
      week_start_date: string;
      work_minutes: number;
      overtime_minutes: number;
      meeting_minutes: number;
      focus_minutes: number;
      meeting_count: number;
    }>(
      `SELECT date_trunc('week', date)::date::text AS week_start_date,
              SUM(work_minutes)     AS work_minutes,
              SUM(overtime_minutes) AS overtime_minutes,
              SUM(meeting_minutes)  AS meeting_minutes,
              SUM(focus_minutes)    AS focus_minutes,
              SUM(meeting_count)    AS meeting_count
       FROM daily_workload
       WHERE user_id = $1
       GROUP BY date_trunc('week', date)
       ORDER BY week_start_date ASC`,
      [userId]
    );

    if (weeklyRows.length > 0) {
      const weeklyMetrics = weeklyRows.map((r) => ({
        week_start_date: String(r.week_start_date).split('T')[0]!,
        work_minutes:     Number(r.work_minutes),
        overtime_minutes: Number(r.overtime_minutes),
        meeting_minutes:  Number(r.meeting_minutes),
        focus_minutes:    Number(r.focus_minutes),
        meeting_count:    Number(r.meeting_count),
      }));

      const scoreResp = await scoreBurnout(weeklyMetrics);

      await db.query(
        `INSERT INTO burnout_scores
           (user_id, score_date, score, level, trend,
            contributing_factors, confidence, probabilities,
            metrics_summary, model_version)
         VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, score_date) DO UPDATE SET
           score                = EXCLUDED.score,
           level                = EXCLUDED.level,
           trend                = EXCLUDED.trend,
           contributing_factors = EXCLUDED.contributing_factors,
           confidence           = EXCLUDED.confidence,
           probabilities        = EXCLUDED.probabilities,
           metrics_summary      = EXCLUDED.metrics_summary,
           model_version        = EXCLUDED.model_version,
           updated_at           = NOW()`,
        [
          userId,
          scoreResp.score,
          scoreResp.level,
          scoreResp.trend,
          JSON.stringify(scoreResp.contributing_factors),
          scoreResp.confidence,
          JSON.stringify(scoreResp.probabilities),
          JSON.stringify(scoreResp.metrics_summary),
          scoreResp.model_version || 'gbm-burnout-v1.0',
        ]
      );

      result.burnoutScore = scoreResp.score;
      result.burnoutLevel = scoreResp.level;

      // Fire burnout warning email if score > 75 (non-blocking)
      if (scoreResp.score > 75) {
        const user = await db.queryOne<{ email: string; display_name: string }>(
          'SELECT email, display_name FROM users WHERE id = $1', [userId]
        );
        if (user) {
          triggerBurnoutWarningAlert({
            toEmail: user.email,
            toName:  user.display_name || user.email,
            score:   scoreResp.score,
            level:   scoreResp.level,
            factors: scoreResp.contributing_factors as string[],
          }).catch(() => {});
        }
      }
    }

    result.success = true;
    logger.info('ML predictions complete', { userId, ...result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('ML predictions failed', { userId, error });
    result.error = error;
    return result;
  }
}

/** Return stored 5-day workload forecast for a user. */
export async function getWorkloadForecast(userId: string): Promise<unknown[]> {
  return db.queryMany(
    `SELECT predicted_date, predicted_minutes, predicted_hours,
            confidence, load_level, trend, model_version, generated_at
     FROM workload_predictions
     WHERE user_id = $1
     ORDER BY predicted_date ASC`,
    [userId]
  );
}

/** Return the most-recent burnout score row for a user. */
export async function getLatestBurnoutScore(userId: string): Promise<unknown | null> {
  const row = await db.queryOne(
    `SELECT score, level, trend, contributing_factors, confidence,
            probabilities, metrics_summary, model_version, score_date
     FROM burnout_scores
     WHERE user_id = $1
     ORDER BY score_date DESC
     LIMIT 1`,
    [userId]
  );
  return row ?? null;
}
