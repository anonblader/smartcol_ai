/**
 * Notification Settings Controller
 * Admin-only: manage email alert toggles and send test emails.
 */

import { Request, Response } from 'express';
import {
  getAlertSettings,
  updateAlertSetting,
  sendTestAlert,
} from '../services/email-alerts.service';
import { db }     from '../services/database.client';
import { logger } from '../config/monitoring.config';

/** GET /api/notifications/settings — return all alert settings */
export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getAlertSettings();
    res.json({ settings });
  } catch (err) {
    logger.error('Get notification settings failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}

/** POST /api/notifications/settings — toggle one alert on/off */
export async function updateSetting(req: Request, res: Response): Promise<void> {
  try {
    const { alertKey, enabled } = req.body as { alertKey: string; enabled: boolean };
    if (!alertKey || enabled === undefined) {
      res.status(400).json({ error: 'BadRequest', message: 'alertKey and enabled are required' });
      return;
    }
    const ok = await updateAlertSetting(alertKey, enabled);
    if (!ok) {
      res.status(404).json({ error: 'NotFound', message: `Alert key '${alertKey}' not found` });
      return;
    }
    res.json({ success: true, alertKey, enabled });
  } catch (err) {
    logger.error('Update notification setting failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}

/** POST /api/notifications/test — send a test email to the session user */
export async function testEmail(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.session.user_id;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await db.queryOne<{ email: string; display_name: string }>(
      'SELECT email, display_name FROM users WHERE id = $1',
      [userId]
    );
    if (!user) { res.status(404).json({ error: 'NotFound' }); return; }

    await sendTestAlert(user.email, user.display_name || user.email);
    res.json({ success: true, message: `Test email sent to ${user.email}` });
  } catch (err) {
    logger.error('Test email failed', { error: err });
    res.status(500).json({ error: 'InternalServerError' });
  }
}
