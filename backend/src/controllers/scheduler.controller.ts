/**
 * Scheduler Controller
 * Handles HTTP requests for background job management.
 */

import { Request, Response } from 'express';
import {
  getSchedulerStatus,
  triggerJob,
  setJobEnabled,
} from '../services/scheduler.service';
import { logger } from '../config/monitoring.config';

/**
 * GET /api/scheduler/status
 * Returns current status of all background jobs.
 */
export async function getStatus(_req: Request, res: Response): Promise<void> {
  try {
    const status = getSchedulerStatus();
    res.json({ jobs: status });
  } catch (err) {
    logger.error('Get scheduler status failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get scheduler status' });
  }
}

/**
 * POST /api/scheduler/trigger
 * Manually trigger a job by key.
 * Body: { jobKey: 'analyticsPipeline' | 'calendarSync' }
 */
export async function trigger(req: Request, res: Response): Promise<void> {
  try {
    const { jobKey } = req.body as { jobKey: string };
    if (!jobKey) {
      res.status(400).json({ error: 'BadRequest', message: 'jobKey is required' });
      return;
    }
    const result = triggerJob(jobKey);
    if (!result.success) {
      res.status(409).json({ error: 'Conflict', message: result.message });
      return;
    }
    res.json({ success: true, message: result.message });
  } catch (err) {
    logger.error('Trigger job failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to trigger job' });
  }
}

/**
 * POST /api/scheduler/toggle
 * Enable or pause a scheduled job.
 * Body: { jobKey: string; enabled: boolean }
 */
export async function toggle(req: Request, res: Response): Promise<void> {
  try {
    const { jobKey, enabled } = req.body as { jobKey: string; enabled: boolean };
    if (!jobKey || enabled === undefined) {
      res.status(400).json({ error: 'BadRequest', message: 'jobKey and enabled are required' });
      return;
    }
    const result = setJobEnabled(jobKey, enabled);
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    logger.error('Toggle job failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to toggle job' });
  }
}
