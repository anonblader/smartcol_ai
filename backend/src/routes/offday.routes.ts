/**
 * Off-Day Recommendation Routes
 */

import { Router } from 'express';
import { generate, getPending, getAll, getBalance, accept, reject, getTeam } from '../controllers/offday.controller';

const router = Router();

router.post('/generate',     generate);   // generate for session user (or ?userId= for admin)
router.get('/balance',       getBalance); // entitlement balance
router.get('/pending',       getPending);  // pending recommendations
router.get('/all',           getAll);      // all recommendations (any status)
router.get('/team',          getTeam);     // admin: all users' pending recommendations
router.post('/:id/accept',   accept);
router.post('/:id/reject',   reject);

export default router;
