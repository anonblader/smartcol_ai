/**
 * Analytics Routes
 */

import { Router } from 'express';
import {
  getUsersList,
  computeUserWorkload,
  getDailyWorkload,
  getWeeklyWorkload,
  getTimeBreakdown,
  getHeatmap,
  getDashboard,
} from '../controllers/analytics.controller';

const router = Router();

// GET /api/analytics/users-list — list all users for the selector dropdown
router.get('/users-list', getUsersList);

// POST /api/analytics/compute — compute & store workload from classified events
router.post('/compute', computeUserWorkload);

// GET /api/analytics/dashboard — all key metrics in one call
router.get('/dashboard', getDashboard);

// GET /api/analytics/daily — daily workload (query: startDate, endDate)
router.get('/daily', getDailyWorkload);

// GET /api/analytics/weekly — weekly summaries (query: weeks)
router.get('/weekly', getWeeklyWorkload);

// GET /api/analytics/time-breakdown — minutes per task type
router.get('/time-breakdown', getTimeBreakdown);

// GET /api/analytics/heatmap — daily totals for heatmap (query: days)
router.get('/heatmap', getHeatmap);

export default router;
