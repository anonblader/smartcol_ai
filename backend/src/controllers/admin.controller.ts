/**
 * Admin Controller
 *
 * Team-wide workload overview, risk management, and email notifications.
 */

import { Request, Response } from 'express';
import { db } from '../services/database.client';
import { getTeamOverview, getTeamRisks } from '../services/admin.service';
import { sendRiskAcknowledgementEmail } from '../services/email.service';
import { logger } from '../config/monitoring.config';
import { User } from '../types';

/**
 * GET /api/admin/team-overview
 * Workload summary for all users — for the admin dashboard.
 */
export async function teamOverview(_req: Request, res: Response): Promise<void> {
  try {
    const users = await getTeamOverview();
    res.json({ users });
  } catch (err) {
    logger.error('Team overview failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to load team overview' });
  }
}

/**
 * GET /api/admin/team-risks
 * All risk alerts across all users.
 * Query: ?status=active|acknowledged|resolved
 */
export async function teamRisks(req: Request, res: Response): Promise<void> {
  try {
    const { status } = req.query;
    const alerts = await getTeamRisks();

    // Filter by status if provided
    const filtered = status
      ? alerts.filter((a: any) => a.status === status)
      : alerts;

    res.json({ alerts: filtered });
  } catch (err) {
    logger.error('Team risks failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to load team risks' });
  }
}

/**
 * POST /api/admin/risks/:id/acknowledge
 * Admin acknowledges a risk on behalf of a user + sends email to that user.
 */
export async function adminAcknowledgeRisk(req: Request, res: Response): Promise<void> {
  try {
    const adminUserId = req.session.user_id!;
    const alertId     = req.params.id ?? '';

    // Get the alert + risk owner details
    const alert = await db.queryOne<{
      id: string;
      user_id: string;
      title: string;
      description: string;
      recommendation: string;
      severity: string;
      status: string;
    }>(
      `SELECT ra.id, ra.user_id, ra.title, ra.description, ra.recommendation, ra.severity, ra.status
       FROM risk_alerts ra
       WHERE ra.id = $1`,
      [alertId]
    );

    if (!alert) {
      res.status(404).json({ error: 'NotFound', message: 'Risk alert not found' });
      return;
    }

    if (alert.status !== 'active') {
      res.status(400).json({ error: 'InvalidState', message: 'Alert is not in active state' });
      return;
    }

    // Acknowledge the alert
    await db.query(
      `UPDATE risk_alerts
       SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [alertId]
    );

    // Get the admin's display name
    const adminUser = await db.queryOne<User>('SELECT display_name, email FROM users WHERE id = $1', [adminUserId]);

    // Get the risk owner's details
    const riskOwner = await db.queryOne<User>('SELECT email, display_name FROM users WHERE id = $1', [alert.user_id]);

    // Send email notification to the risk owner
    if (riskOwner) {
      await sendRiskAcknowledgementEmail({
        toEmail:         riskOwner.email,
        toName:          riskOwner.display_name || riskOwner.email,
        adminName:       adminUser?.display_name || 'Your Manager',
        riskTitle:       alert.title,
        riskDescription: alert.description || '',
        recommendation:  alert.recommendation || '',
        severity:        alert.severity,
      });
    }

    logger.info('Admin acknowledged risk and sent notification', {
      adminUserId,
      alertId,
      riskOwner: riskOwner?.email,
    });

    res.json({
      success: true,
      message: 'Risk acknowledged and notification sent to user',
      emailSent: !!riskOwner,
    });
  } catch (err) {
    logger.error('Admin acknowledge failed', { error: err });
    res.status(500).json({ error: 'InternalServerError', message: 'Failed to acknowledge risk' });
  }
}
