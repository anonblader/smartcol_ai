/**
 * Sync Controller
 *
 * Handles calendar synchronization endpoints.
 */

import { Request, Response } from 'express';
import { syncCalendarEvents, syncAllUsers } from '../services/calendar-sync.service';
import { syncMockCalendarEvents } from '../services/mock-calendar-sync.service';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';
import { SyncHistory } from '../types';

/**
 * POST /api/sync/calendar
 * Trigger calendar sync for authenticated user
 */
export async function syncUserCalendar(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session',
      });
      return;
    }

    const { startDate, endDate, fullSync } = req.body;

    logger.info('Manual calendar sync requested', { userId });

    const result = await syncCalendarEvents(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      useDeltaSync: !fullSync,
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Calendar sync completed successfully',
        stats: {
          eventsAdded: result.eventsAdded,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          totalProcessed: result.totalProcessed,
        },
      });
    } else {
      res.status(500).json({
        error: 'SyncFailed',
        message: result.error || 'Calendar sync failed',
        stats: {
          eventsAdded: result.eventsAdded,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          totalProcessed: result.totalProcessed,
        },
      });
    }
  } catch (error) {
    logger.error('Sync endpoint failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to sync calendar',
    });
  }
}

/**
 * POST /api/sync/all
 * Trigger calendar sync for all users (admin only)
 */
export async function syncAllCalendars(_req: Request, res: Response): Promise<void> {
  try {
    // TODO: Add admin authentication check
    logger.info('Sync all users requested');

    const result = await syncAllUsers();

    res.json({
      success: true,
      message: 'Sync completed for all users',
      stats: {
        totalUsers: result.totalUsers,
        successful: result.successful,
        failed: result.failed,
      },
      results: result.results.map((r) => ({
        userId: r.userId,
        success: r.result.success,
        stats: {
          eventsAdded: r.result.eventsAdded,
          eventsUpdated: r.result.eventsUpdated,
          eventsDeleted: r.result.eventsDeleted,
          totalProcessed: r.result.totalProcessed,
        },
        error: r.result.error,
      })),
    });
  } catch (error) {
    logger.error('Sync all endpoint failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to sync calendars',
    });
  }
}

/**
 * GET /api/sync/status
 * Get sync status and history for authenticated user
 */
export async function getSyncStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session',
      });
      return;
    }

    // Get recent sync logs
    const syncLogs = await db.queryMany<SyncHistory>(
      `SELECT *
       FROM sync_history
       WHERE user_id = $1 AND sync_type = 'calendar'
       ORDER BY started_at DESC
       LIMIT 10`,
      [userId]
    );

    // Get event counts
    const stats = await db.queryOne<{
      total_events: number;
      upcoming_events: number;
      past_events: number;
    }>(
      `SELECT
         COUNT(*) as total_events,
         COUNT(*) FILTER (WHERE start_time > NOW()) as upcoming_events,
         COUNT(*) FILTER (WHERE start_time < NOW()) as past_events
       FROM calendar_events
       WHERE user_id = $1 AND is_cancelled = false`,
      [userId]
    );

    const lastSync = syncLogs[0] || null;

    res.json({
      lastSync: lastSync
        ? {
            startedAt: lastSync.started_at,
            completedAt: lastSync.completed_at,
            status: lastSync.status,
            eventsFetched: lastSync.events_fetched,
            eventsCreated: lastSync.events_created,
            eventsUpdated: lastSync.events_updated,
            eventsDeleted: lastSync.events_deleted,
            error: lastSync.error_message,
          }
        : null,
      stats: {
        totalEvents: stats?.total_events || 0,
        upcomingEvents: stats?.upcoming_events || 0,
        pastEvents: stats?.past_events || 0,
      },
      recentSyncs: syncLogs.map((log) => ({
        startedAt: log.started_at,
        completedAt: log.completed_at,
        status: log.status,
        eventsFetched: log.events_fetched,
        eventsCreated: log.events_created,
        eventsUpdated: log.events_updated,
        eventsDeleted: log.events_deleted,
        error: log.error_message,
      })),
    });
  } catch (error) {
    logger.error('Failed to get sync status', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to get sync status',
    });
  }
}

/**
 * GET /api/sync/events
 * Get calendar events for authenticated user
 */
export async function getCalendarEvents(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session',
      });
      return;
    }

    const { startDate, endDate, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT *
      FROM calendar_events
      WHERE user_id = $1 AND is_cancelled = false
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND start_time >= $${paramIndex}`;
      params.push(new Date(startDate as string));
      paramIndex++;
    }

    if (endDate) {
      query += ` AND start_time <= $${paramIndex}`;
      params.push(new Date(endDate as string));
      paramIndex++;
    }

    query += ` ORDER BY start_time ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Number(limit), Number(offset));

    const events = await db.queryMany(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as total
      FROM calendar_events
      WHERE user_id = $1 AND is_cancelled = false
    `;
    const countParams: any[] = [userId];
    let countParamIndex = 2;

    if (startDate) {
      countQuery += ` AND start_time >= $${countParamIndex}`;
      countParams.push(new Date(startDate as string));
      countParamIndex++;
    }

    if (endDate) {
      countQuery += ` AND start_time <= $${countParamIndex}`;
      countParams.push(new Date(endDate as string));
    }

    const countResult = await db.queryOne<{ total: number }>(countQuery, countParams);

    res.json({
      events,
      pagination: {
        total: countResult?.total || 0,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: (countResult?.total || 0) > Number(offset) + Number(limit),
      },
    });
  } catch (error) {
    logger.error('Failed to get calendar events', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to get calendar events',
    });
  }
}

/**
 * POST /api/sync/mock
 * Trigger mock calendar sync with sample data (for demo purposes)
 */
export async function syncMockCalendar(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;

    if (!userId) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No active session',
      });
      return;
    }

    logger.info('Mock calendar sync requested', { userId });

    const result = await syncMockCalendarEvents(userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Mock calendar sync completed successfully',
        stats: {
          eventsAdded: result.eventsAdded,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          totalProcessed: result.totalProcessed,
        },
        note: 'This was a mock sync with sample data for demonstration purposes',
      });
    } else {
      res.status(500).json({
        error: 'SyncFailed',
        message: result.error || 'Mock calendar sync failed',
        stats: {
          eventsAdded: result.eventsAdded,
          eventsUpdated: result.eventsUpdated,
          eventsDeleted: result.eventsDeleted,
          totalProcessed: result.totalProcessed,
        },
      });
    }
  } catch (error) {
    logger.error('Mock sync endpoint failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to sync mock calendar',
    });
  }
}
