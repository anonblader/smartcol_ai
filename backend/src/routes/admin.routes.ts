/**
 * Admin Routes — protected by requireAdmin middleware
 */

import { Router } from 'express';
import { teamOverview, teamRisks, adminAcknowledgeRisk } from '../controllers/admin.controller';

const router = Router();

router.get('/team-overview', teamOverview);
router.get('/team-risks',    teamRisks);
router.post('/risks/:id/acknowledge', adminAcknowledgeRisk);

export default router;
