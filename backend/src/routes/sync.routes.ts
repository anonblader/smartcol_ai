/**
 * Sync Routes
 *
 * API endpoints for calendar synchronization.
 */

import { Router } from 'express';
import {
  syncUserCalendar,
  syncAllCalendars,
  getSyncStatus,
  getCalendarEvents,
  syncMockCalendar,
} from '../controllers/sync.controller';

const router = Router();

/**
 * POST /api/sync/calendar
 * Trigger calendar sync for authenticated user
 *
 * Request body:
 * - startDate (optional): ISO 8601 date string
 * - endDate (optional): ISO 8601 date string
 * - fullSync (optional): boolean - if true, ignores delta link and does full sync
 */
router.post('/calendar', syncUserCalendar);

/**
 * POST /api/sync/mock
 * Trigger mock calendar sync with sample data (for demo purposes)
 *
 * This endpoint is used when Microsoft Graph API access is unavailable
 * due to tenant restrictions or permissions issues.
 */
router.post('/mock', syncMockCalendar);

/**
 * POST /api/sync/all
 * Trigger calendar sync for all users (admin only)
 */
router.post('/all', syncAllCalendars);

/**
 * GET /api/sync/status
 * Get sync status and history for authenticated user
 */
router.get('/status', getSyncStatus);

/**
 * GET /api/sync/events
 * Get calendar events for authenticated user
 *
 * Query parameters:
 * - startDate (optional): ISO 8601 date string
 * - endDate (optional): ISO 8601 date string
 * - limit (optional): number - max events to return (default 100)
 * - offset (optional): number - pagination offset (default 0)
 */
router.get('/events', getCalendarEvents);

export default router;
