/**
 * Risks Routes
 */

import { Router } from 'express';
import {
  runDetection,
  getAlerts,
  getOngoingAlerts,
  getAlertHistory,
  acknowledgeRisk,
  dismissRisk,
} from '../controllers/risks.controller';

const router = Router();

router.post('/detect', runDetection);
router.get('/active', getAlerts);
router.get('/ongoing', getOngoingAlerts);       // acknowledged alerts
router.get('/history', getAlertHistory);
router.post('/:id/acknowledge', acknowledgeRisk);
router.post('/:id/dismiss', dismissRisk);       // force-close (replaces resolve)

export default router;
