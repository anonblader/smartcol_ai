/**
 * Analytics Controller
 *
 * Handles workload analytics endpoints.
 */

import { Request, Response } from 'express';
import { computeWorkload } from '../services/analytics.service';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';

/**
 * Resolve which userId to use:
 * - If ?userId= is provided in the query, use that (allows viewing any user's analytics)
 * - Otherwise fall back to the session user
 * Returns null if neither is available.
 */
function resolveUserId(req: Request): string | null {
  return (req.query.userId as string) || req.session.user_id || null;
}

/**
 * GET /api/analytics/users-list
 * Returns all users for the analytics user selector dropdown
 */
export async function getUsersList(_req: Request, res: Response): Promise<void> {
  try {
    const users = await db.queryMany<{ id: string; display_name: string; email: string; is_test: boolean }>(
      `SELECT id, display_name, email,
              (email LIKE '%@smartcol-test.com') AS is_test
       FROM users
       ORDER BY (email LIKE '%@smartcol-test.com') ASC, display_name ASC`
    );
    res.json({ users });
  } catch (error) {
    logger.error('Get users list failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get users list' });
  }
}

/**
 * POST /api/analytics/compute
 * Compute and store workload metrics for the target user
 */
export async function computeUserWorkload(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    logger.info('Workload computation requested', { userId });
    const result = await computeWorkload(userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Workload computed successfully',
        stats: {
          daysProcessed: result.daysProcessed,
          weeksProcessed: result.weeksProcessed,
        },
      });
    } else {
      res.status(500).json({
        error: 'ComputeFailed',
        message: result.error || 'Failed to compute workload',
      });
    }
  } catch (error) {
    logger.error('Compute workload endpoint failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to compute workload' });
  }
}

/**
 * GET /api/analytics/daily
 * Get daily workload for a date range
 * Query params: startDate, endDate (ISO date strings, e.g. 2026-03-01)
 */
export async function getDailyWorkload(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const { startDate, endDate } = req.query;

    const rows = await db.queryMany(
      `SELECT *
       FROM daily_workload
       WHERE user_id = $1
         ${startDate ? 'AND date >= $2' : ''}
         ${endDate ? `AND date <= $${startDate ? 3 : 2}` : ''}
       ORDER BY date ASC`,
      [userId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
    );

    res.json({ daily: rows });
  } catch (error) {
    logger.error('Get daily workload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get daily workload' });
  }
}

/**
 * GET /api/analytics/weekly
 * Get weekly workload summary
 * Query params: weeks (number of recent weeks, default 4)
 */
export async function getWeeklyWorkload(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const weeks = Math.min(Number(req.query.weeks) || 4, 52);

    const rows = await db.queryMany(
      `SELECT *
       FROM weekly_workload
       WHERE user_id = $1
       ORDER BY week_start_date DESC
       LIMIT $2`,
      [userId, weeks]
    );

    res.json({ weekly: rows });
  } catch (error) {
    logger.error('Get weekly workload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get weekly workload' });
  }
}

/**
 * GET /api/analytics/time-breakdown
 * Get total minutes per task type across a date range
 */
export async function getTimeBreakdown(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const { startDate, endDate } = req.query;

    const rows = await db.queryMany<{
      task_type_name: string;
      task_type_id: number;
      color_code: string;
      total_minutes: number;
      event_count: number;
    }>(
      `SELECT
         tt.name        AS task_type_name,
         tt.id          AS task_type_id,
         tt.color_code,
         SUM(ce.duration_minutes) AS total_minutes,
         COUNT(ce.id)             AS event_count
       FROM calendar_events ce
       JOIN event_classifications ec ON ec.event_id = ce.id
       JOIN task_types tt ON tt.id = ec.task_type_id
       WHERE ce.user_id = $1
         AND ce.is_cancelled = false
         AND ce.is_all_day = false
         ${startDate ? 'AND ce.start_time >= $2' : ''}
         ${endDate ? `AND ce.start_time <= $${startDate ? 3 : 2}` : ''}
       GROUP BY tt.id, tt.name, tt.color_code
       ORDER BY total_minutes DESC`,
      [userId, ...(startDate ? [startDate] : []), ...(endDate ? [endDate] : [])]
    );

    const totalMinutes = rows.reduce((sum, r) => sum + Number(r.total_minutes), 0) || 1;

    const breakdown = rows.map((r) => ({
      taskTypeId: r.task_type_id,
      taskTypeName: r.task_type_name,
      colorCode: r.color_code,
      totalMinutes: Number(r.total_minutes),
      totalHours: +(Number(r.total_minutes) / 60).toFixed(1),
      eventCount: Number(r.event_count),
      percentage: +((Number(r.total_minutes) / totalMinutes) * 100).toFixed(1),
    }));

    res.json({ breakdown, totalMinutes });
  } catch (error) {
    logger.error('Get time breakdown failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get time breakdown' });
  }
}

/**
 * GET /api/analytics/heatmap
 * Get daily total minutes for heatmap display (last N days)
 * Query params: days (default 30)
 */
export async function getHeatmap(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const days = Math.min(Number(req.query.days) || 30, 365);

    const rows = await db.queryMany<{
      date: string;
      total_minutes: number;
      work_minutes: number;
      meeting_count: number;
      has_high_workload: boolean;
    }>(
      `SELECT date, total_minutes, work_minutes, meeting_count, has_high_workload
       FROM daily_workload
       WHERE user_id = $1
         AND date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY date ASC`,
      [userId]
    );

    res.json({ heatmap: rows, days });
  } catch (error) {
    logger.error('Get heatmap failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get heatmap' });
  }
}

/**
 * GET /api/analytics/dashboard
 * Single endpoint returning all key metrics for the dashboard
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    // Current week start (Monday)
    const now = new Date();
    const dayOfWeek = now.getUTCDay() || 7;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const [currentWeek, recentDaily, timeBreakdown, upcomingEvents] = await Promise.all([
      // Current week summary
      db.queryOne<{
        total_minutes: number;
        work_minutes: number;
        overtime_minutes: number;
        total_events: number;
        meeting_count: number;
      }>(
        `SELECT total_minutes, work_minutes, overtime_minutes, total_events, meeting_count
         FROM weekly_workload
         WHERE user_id = $1 AND week_start_date = $2`,
        [userId, weekStartStr]
      ),

      // Last 7 days daily breakdown
      db.queryMany(
        `SELECT date, total_minutes, work_minutes, meeting_count, overtime_minutes, has_high_workload
         FROM daily_workload
         WHERE user_id = $1
           AND date >= CURRENT_DATE - INTERVAL '6 days'
         ORDER BY date ASC`,
        [userId]
      ),

      // Time breakdown by task type (all time)
      db.queryMany<{
        task_type_name: string;
        color_code: string;
        total_minutes: number;
        event_count: number;
      }>(
        `SELECT tt.name AS task_type_name, tt.color_code,
                SUM(ce.duration_minutes) AS total_minutes,
                COUNT(ce.id) AS event_count
         FROM calendar_events ce
         JOIN event_classifications ec ON ec.event_id = ce.id
         JOIN task_types tt ON tt.id = ec.task_type_id
         WHERE ce.user_id = $1 AND ce.is_cancelled = false AND ce.is_all_day = false
         GROUP BY tt.id, tt.name, tt.color_code
         ORDER BY total_minutes DESC`,
        [userId]
      ),

      // Upcoming events (next 7 days)
      db.queryMany(
        `SELECT ce.subject, ce.start_time, ce.end_time, ce.duration_minutes,
                ce.location, tt.name AS task_type, tt.color_code
         FROM calendar_events ce
         JOIN event_classifications ec ON ec.event_id = ce.id
         JOIN task_types tt ON tt.id = ec.task_type_id
         WHERE ce.user_id = $1
           AND ce.is_cancelled = false
           AND ce.start_time >= NOW()
           AND ce.start_time <= NOW() + INTERVAL '7 days'
         ORDER BY ce.start_time ASC
         LIMIT 10`,
        [userId]
      ),
    ]);

    const totalMins = timeBreakdown.reduce((s, r) => s + Number(r.total_minutes), 0) || 1;

    res.json({
      currentWeek: currentWeek
        ? {
            totalHours: +(Number(currentWeek.total_minutes) / 60).toFixed(1),
            workHours: +(Number(currentWeek.work_minutes) / 60).toFixed(1),
            overtimeHours: +(Number(currentWeek.overtime_minutes) / 60).toFixed(1),
            totalEvents: currentWeek.total_events,
            meetingCount: currentWeek.meeting_count,
            weekStart: weekStartStr,
          }
        : null,
      recentDaily,
      timeBreakdown: timeBreakdown.map((r) => ({
        taskTypeName: r.task_type_name,
        colorCode: r.color_code,
        totalMinutes: Number(r.total_minutes),
        totalHours: +(Number(r.total_minutes) / 60).toFixed(1),
        eventCount: Number(r.event_count),
        percentage: +((Number(r.total_minutes) / totalMins) * 100).toFixed(1),
      })),
      upcomingEvents,
    });
  } catch (error) {
    logger.error('Get dashboard failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get dashboard' });
  }
}
