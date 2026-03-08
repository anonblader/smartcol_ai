/**
 * Test Routes — development only
 */

import { Router, Request, Response } from 'express';
import {
  seedTestUsers,
  seedRandomUser,
  addRandomEventsToUser,
  getAllUsersWorkloadSummary,
  getUserRiskAlerts,
} from '../services/test-seed.service';
import { computeWorkload } from '../services/analytics.service';
import { detectRisks } from '../services/risks.service';
import { classifyUserEvents } from '../services/event-classification.service';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';

const router = Router();

// Seed the fixed 4-profile users
router.post('/seed-users', async (_req: Request, res: Response) => {
  try {
    const result = await seedTestUsers();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Seed failed' });
  }
});

// Add one random user
router.post('/add-random-user', async (_req: Request, res: Response) => {
  try {
    logger.info('Adding random test user');
    const result = await seedRandomUser();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Add random events to an existing user
router.post('/add-random-events/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    logger.info('Adding random events to user', { userId });
    const result = await addRandomEventsToUser(userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Delete a single test user (and all their data via cascade)
router.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await import('../services/database.client').then(({ db }) =>
      db.query('DELETE FROM users WHERE id = $1', [userId])
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Re-run full pipeline (classify → compute → detect) for all test users
router.post('/run-pipeline-all', async (_req: Request, res: Response) => {
  try {
    logger.info('Running pipeline for all test users');
    const testUsers = await db.queryMany<{ id: string; display_name: string }>(
      `SELECT id, display_name FROM users WHERE email LIKE '%@smartcol-test.com'`
    );
    const results = [];
    for (const user of testUsers) {
      const classification = await classifyUserEvents(user.id);
      const workload       = await computeWorkload(user.id);
      const risks          = await detectRisks(user.id);
      results.push({
        userId:      user.id,
        displayName: user.display_name,
        classified:  classification.classified,
        daysComputed: workload.daysProcessed,
        risksDetected: risks.risksDetected,
      });
    }
    res.json({ success: true, usersProcessed: testUsers.length, results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Pipeline failed' });
  }
});

// Re-run pipeline for a single user
router.post('/run-pipeline/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    const classification = await classifyUserEvents(userId);
    const workload       = await computeWorkload(userId);
    const risks          = await detectRisks(userId);
    res.json({
      success: true,
      classified:   classification.classified,
      daysComputed: workload.daysProcessed,
      risksDetected: risks.risksDetected,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Clear all test users
router.delete('/clear-test-users', async (_req: Request, res: Response) => {
  try {
    await db.query(`DELETE FROM users WHERE email LIKE '%@smartcol-test.com'`);
    res.json({ success: true, message: 'All test users cleared' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Test-users only list (no real users)
router.get('/test-users', async (_req: Request, res: Response) => {
  try {
    const summary = await getAllUsersWorkloadSummary();
    const testOnly = summary.filter((u: any) => u.is_test_user);
    const withRisks = await Promise.all(
      testOnly.map(async (u: any) => ({
        ...u,
        riskAlerts: await getUserRiskAlerts(u.id),
      }))
    );
    res.json({ users: withRisks });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

// Summary of all users
router.get('/users-summary', async (_req: Request, res: Response) => {
  try {
    const summary = await getAllUsersWorkloadSummary();
    const withRisks = await Promise.all(
      summary.map(async (u: any) => ({
        ...u,
        riskAlerts: await getUserRiskAlerts(u.id),
      }))
    );
    res.json({ users: withRisks });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' });
  }
});

export default router;
