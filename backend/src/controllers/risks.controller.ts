/**
 * Risks Controller
 */

import { Request, Response } from 'express';

function resolveUserId(req: Request): string | null {
  return (req.query.userId as string) || req.session.user_id || null;
}
import {
  detectRisks,
  getActiveAlerts,
  getAcknowledgedAlerts,
  acknowledgeAlert,
  dismissAlert,
} from '../services/risks.service';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';

export async function runDetection(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const result = await detectRisks(userId);
    if (result.success) {
      res.json({
        success: true,
        message: 'Risk detection completed',
        stats: {
          alertsCreated: result.alertsCreated,
          alertsUpdated: result.alertsUpdated,
          risksDetected: result.risksDetected,
        },
      });
    } else {
      res.status(500).json({ error: 'DetectionFailed', message: result.error });
    }
  } catch (error) {
    logger.error('Risk detection endpoint failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Risk detection failed' });
  }
}

export async function getAlerts(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ alerts: await getActiveAlerts(userId) });
  } catch (error) {
    logger.error('Get active alerts failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get alerts' });
  }
}

export async function getOngoingAlerts(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    res.json({ alerts: await getAcknowledgedAlerts(userId) });
  } catch (error) {
    logger.error('Get acknowledged alerts failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get ongoing alerts' });
  }
}

export async function getAlertHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const alerts = await db.queryMany(
      `SELECT ra.*, rt.name AS risk_type_name
       FROM risk_alerts ra
       JOIN risk_types rt ON rt.id = ra.risk_type_id
       WHERE ra.user_id = $1
       ORDER BY ra.detected_date DESC, ra.score DESC
       LIMIT 50`,
      [userId]
    );
    res.json({ alerts });
  } catch (error) {
    logger.error('Get alert history failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to get alert history' });
  }
}

export async function acknowledgeRisk(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const ok = await acknowledgeAlert(userId, req.params.id ?? '');
    if (ok) {
      res.json({ success: true, message: 'Alert acknowledged — marked as ongoing' });
    } else {
      res.status(404).json({ error: 'NotFound', message: 'Alert not found or already resolved' });
    }
  } catch (error) {
    logger.error('Acknowledge alert failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to acknowledge alert' });
  }
}

export async function dismissRisk(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const ok = await dismissAlert(userId, req.params.id ?? '');
    if (ok) {
      res.json({ success: true, message: 'Alert dismissed' });
    } else {
      res.status(404).json({ error: 'NotFound', message: 'Alert not found' });
    }
  } catch (error) {
    logger.error('Dismiss alert failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to dismiss alert' });
  }
}
