/**
 * Scheduler Routes
 * All endpoints require admin access (enforced by requireAdmin middleware in app.ts).
 */

import { Router } from 'express';
import { getStatus, trigger, toggle } from '../controllers/scheduler.controller';

const router = Router();

router.get('/status',  getStatus);
router.post('/trigger', trigger);
router.post('/toggle',  toggle);

export default router;
