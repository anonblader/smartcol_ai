/**
 * Email Alerts Service
 *
 * Manages admin-configurable email alert settings and sends
 * templated emails (or console-logs them when SMTP is not configured).
 *
 * Alert types:
 *   risk_detected      — new risk created for an engineer
 *   risk_acknowledged  — admin acknowledges an engineer's risk
 *   risk_dismissed     — admin dismisses an engineer's risk
 *   burnout_warning    — ML burnout score exceeds 75/100
 *   high_workload_day  — daily work exceeds 10 h (600 min)
 *   weekly_digest      — (future) weekly summary digest
 */

import nodemailer       from 'nodemailer';
import { db }           from './database.client';
import { config }       from '../config/env';
import { logger }       from '../config/monitoring.config';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AlertSetting {
  id:             string;
  alert_key:      string;
  alert_name:     string;
  description:    string;
  category:       string;
  enabled:        boolean;
  last_triggered: string | null;
  trigger_count:  number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isSmtpConfigured(): boolean {
  return !!(config.email.user && config.email.pass);
}

async function getTransport() {
  return nodemailer.createTransport({
    host:   config.email.host,
    port:   config.email.port,
    secure: config.email.port === 465,
    auth:   { user: config.email.user, pass: config.email.pass },
  });
}

const SEV_COLOR: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#7c3aed',
};

function emailWrapper(body: string): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">SmartCol AI</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Workload Intelligence Platform</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
    ${body}
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;">
      This is an automated message from SmartCol AI. Do not reply to this email.
    </p>
  </div>
</div>`;
}

async function deliver(
  alertKey: string,
  toEmail:  string,
  toName:   string,
  subject:  string,
  html:     string,
  preview:  Record<string, string>,
): Promise<void> {
  if (!isSmtpConfigured()) {
    logger.info(`[EMAIL — console mode] ${alertKey}`, { to: toEmail, subject });
    console.log('\n📧 ─── EMAIL ALERT: ' + preview['type'] + ' ' + '─'.repeat(Math.max(0, 44 - (preview['type'] ?? '').length)));
    console.log(`   To:      ${toName} <${toEmail}>`);
    console.log(`   Subject: ${subject}`);
    Object.entries(preview).forEach(([k, v]) => {
      if (k !== 'type') console.log(`   ${k.padEnd(10)}: ${v}`);
    });
    console.log(`   Note:    Set EMAIL_USER + EMAIL_PASS in .env to send real emails`);
    console.log('─'.repeat(60) + '\n');
    return;
  }

  try {
    const transport = await getTransport();
    await transport.sendMail({
      from:    `"${config.email.fromName}" <${config.email.user}>`,
      to:      `"${toName}" <${toEmail}>`,
      subject,
      html,
    });
    logger.info(`Email sent: ${alertKey}`, { to: toEmail });
  } catch (err) {
    logger.error(`Email send failed: ${alertKey}`, {
      error: err instanceof Error ? err.message : String(err),
      to:    toEmail,
    });
  }
}

// ── Settings management ────────────────────────────────────────────────────────

export async function getAlertSettings(): Promise<AlertSetting[]> {
  return db.queryMany<AlertSetting>(
    `SELECT id, alert_key, alert_name, description, category,
            enabled, last_triggered, trigger_count
     FROM email_alert_settings
     ORDER BY category, alert_key`
  );
}

export async function updateAlertSetting(key: string, enabled: boolean): Promise<boolean> {
  const result = await db.query(
    `UPDATE email_alert_settings
     SET enabled = $1, updated_at = NOW()
     WHERE alert_key = $2`,
    [enabled, key]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isAlertEnabled(key: string): Promise<boolean> {
  const row = await db.queryOne<{ enabled: boolean }>(
    `SELECT enabled FROM email_alert_settings WHERE alert_key = $1`,
    [key]
  );
  return row?.enabled ?? false;
}

async function markTriggered(key: string): Promise<void> {
  await db.query(
    `UPDATE email_alert_settings
     SET last_triggered = NOW(), trigger_count = trigger_count + 1, updated_at = NOW()
     WHERE alert_key = $1`,
    [key]
  );
}

// ── Alert: Risk Detected ───────────────────────────────────────────────────────

export async function triggerRiskDetectedAlert(params: {
  toEmail:     string;
  toName:      string;
  riskTitle:   string;
  riskDesc:    string;
  severity:    string;
  recommendation: string;
}): Promise<void> {
  if (!(await isAlertEnabled('risk_detected'))) return;

  const colour = SEV_COLOR[params.severity] ?? '#6b7280';
  const subject = `[SmartCol AI] ⚠️ New ${params.severity.toUpperCase()} Risk: ${params.riskTitle}`;
  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      SmartCol AI has detected a new workload risk on your account that requires your attention.
    </p>
    <div style="border-left:4px solid ${colour};background:${colour}10;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
      <span style="background:${colour};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${params.severity}</span>
      <strong style="color:#1e293b;font-size:14px;display:block;margin:8px 0 4px;">${params.riskTitle}</strong>
      <p style="color:#475569;font-size:13px;margin:0;">${params.riskDesc}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;margin:0 0 16px;">
      <p style="color:#065f46;font-size:13px;font-weight:600;margin:0 0 6px;">💡 Recommendation</p>
      <p style="color:#065f46;font-size:13px;margin:0;">${params.recommendation}</p>
    </div>
    <p style="color:#64748b;font-size:13px;">Log in to SmartCol AI to view your full workload analysis and manage this alert.</p>
  `);

  await deliver('risk_detected', params.toEmail, params.toName, subject, html, {
    type:     'Risk Detected',
    Risk:     `[${params.severity.toUpperCase()}] ${params.riskTitle}`,
    Message:  params.riskDesc.slice(0, 80),
  });

  await markTriggered('risk_detected');
}

// ── Alert: Risk Acknowledged ───────────────────────────────────────────────────

export async function triggerRiskAcknowledgedAlert(params: {
  toEmail:     string;
  toName:      string;
  adminName:   string;
  riskTitle:   string;
  riskDesc:    string;
  recommendation: string;
  severity:    string;
}): Promise<void> {
  if (!(await isAlertEnabled('risk_acknowledged'))) return;

  const colour  = SEV_COLOR[params.severity] ?? '#6b7280';
  const subject = `[SmartCol AI] ${params.adminName} has acknowledged your workload risk`;
  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your manager <strong>${params.adminName}</strong> has reviewed and acknowledged a workload risk
      flagged on your account. They are aware of the situation and monitoring it.
    </p>
    <div style="border-left:4px solid ${colour};background:${colour}10;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
      <span style="background:${colour};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${params.severity}</span>
      <strong style="color:#1e293b;font-size:14px;display:block;margin:8px 0 4px;">${params.riskTitle}</strong>
      <p style="color:#475569;font-size:13px;margin:0;">${params.riskDesc}</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;margin:0 0 16px;">
      <p style="color:#065f46;font-size:13px;font-weight:600;margin:0 0 6px;">💡 Recommendation</p>
      <p style="color:#065f46;font-size:13px;margin:0;">${params.recommendation}</p>
    </div>
  `);

  await deliver('risk_acknowledged', params.toEmail, params.toName, subject, html, {
    type:      'Risk Acknowledged',
    Manager:   params.adminName,
    Risk:      `[${params.severity.toUpperCase()}] ${params.riskTitle}`,
  });

  await markTriggered('risk_acknowledged');
}

// ── Alert: Risk Dismissed ──────────────────────────────────────────────────────

export async function triggerRiskDismissedAlert(params: {
  toEmail:   string;
  toName:    string;
  adminName: string;
  riskTitle: string;
  severity:  string;
}): Promise<void> {
  if (!(await isAlertEnabled('risk_dismissed'))) return;

  const colour  = SEV_COLOR[params.severity] ?? '#6b7280';
  const subject = `[SmartCol AI] ${params.adminName} has dismissed your workload risk alert`;
  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your manager <strong>${params.adminName}</strong> has dismissed the following workload risk alert.
      No further action is required from your side for this item.
    </p>
    <div style="border-left:4px solid ${colour};background:${colour}10;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
      <span style="background:${colour};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${params.severity}</span>
      <strong style="color:#1e293b;font-size:14px;display:block;margin:8px 0 4px;">${params.riskTitle}</strong>
    </div>
    <p style="color:#64748b;font-size:13px;">Continue logging in to SmartCol AI to keep track of your workload health.</p>
  `);

  await deliver('risk_dismissed', params.toEmail, params.toName, subject, html, {
    type:    'Risk Dismissed',
    Manager: params.adminName,
    Risk:    `[${params.severity.toUpperCase()}] ${params.riskTitle}`,
  });

  await markTriggered('risk_dismissed');
}

// ── Alert: Burnout Score Warning ───────────────────────────────────────────────

export async function triggerBurnoutWarningAlert(params: {
  toEmail:  string;
  toName:   string;
  score:    number;
  level:    string;
  factors:  string[];
}): Promise<void> {
  if (!(await isAlertEnabled('burnout_warning'))) return;

  const subject = `[SmartCol AI] 🔥 Burnout Risk Score: ${params.score}/100 — ${params.level.toUpperCase()}`;
  const factorList = params.factors
    .map(f => `<li style="color:#475569;font-size:13px;margin-bottom:4px;">${f}</li>`)
    .join('');

  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Your SmartCol AI burnout risk score has risen to a concerning level. Please review your workload and
      consider speaking with your manager.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:0 0 20px;text-align:center;">
      <p style="color:#991b1b;font-size:48px;font-weight:800;margin:0;line-height:1;">${params.score}</p>
      <p style="color:#991b1b;font-size:14px;font-weight:700;margin:4px 0 0;text-transform:uppercase;">out of 100 — ${params.level}</p>
    </div>
    <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0 0 8px;">Contributing factors:</p>
    <ul style="margin:0 0 20px;padding-left:20px;">${factorList}</ul>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:16px 20px;">
      <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 4px;">💡 What you can do</p>
      <p style="color:#92400e;font-size:13px;margin:0;">
        Block focus time in your calendar, reduce meeting commitments, and talk to your manager
        about workload redistribution. Use the Off-Day Recommendations in SmartCol AI to plan rest.
      </p>
    </div>
  `);

  await deliver('burnout_warning', params.toEmail, params.toName, subject, html, {
    type:    'Burnout Warning',
    Score:   `${params.score}/100 (${params.level})`,
    Factors: params.factors.slice(0, 2).join('; '),
  });

  await markTriggered('burnout_warning');
}

// ── Alert: High Workload Day ───────────────────────────────────────────────────

export async function triggerHighWorkloadDayAlert(params: {
  toEmail:      string;
  toName:       string;
  date:         string;
  workMinutes:  number;
  overtime:     number;
}): Promise<void> {
  if (!(await isAlertEnabled('high_workload_day'))) return;

  const hours    = (params.workMinutes / 60).toFixed(1);
  const overtimeH = (params.overtime / 60).toFixed(1);
  const subject  = `[SmartCol AI] ⏱️ High Workload Day: ${hours}h on ${params.date}`;
  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      SmartCol AI detected an exceptionally long working day on your calendar.
      Consistently working beyond standard hours increases burnout risk.
    </p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:20px;margin:0 0 20px;">
      <p style="color:#92400e;font-size:13px;font-weight:600;margin:0 0 8px;">📅 ${params.date}</p>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        <div>
          <p style="color:#92400e;font-size:32px;font-weight:800;margin:0;">${hours}h</p>
          <p style="color:#92400e;font-size:12px;margin:2px 0 0;">total work time</p>
        </div>
        <div>
          <p style="color:#ef4444;font-size:32px;font-weight:800;margin:0;">${overtimeH}h</p>
          <p style="color:#ef4444;font-size:12px;margin:2px 0 0;">overtime (beyond 8h)</p>
        </div>
      </div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;">
      <p style="color:#065f46;font-size:13px;font-weight:600;margin:0 0 4px;">💡 Tip</p>
      <p style="color:#065f46;font-size:13px;margin:0;">
        Consider using SmartCol AI's Off-Day Recommendations to plan compensatory rest.
        Sustained high workload days are tracked toward your off-day entitlement.
      </p>
    </div>
  `);

  await deliver('high_workload_day', params.toEmail, params.toName, subject, html, {
    type:     'High Workload Day',
    Date:     params.date,
    Hours:    `${hours}h (${overtimeH}h overtime)`,
  });

  await markTriggered('high_workload_day');
}

// ── Alert: Weekly Digest ──────────────────────────────────────────────────────

export interface WeeklyDigestParams {
  toEmail:        string;
  toName:         string;
  weekStart:      string;   // e.g. "Mar 3"
  weekEnd:        string;   // e.g. "Mar 9, 2026"
  workHours:      number;
  overtimeHours:  number;
  meetingHours:   number;
  focusHours:     number;
  activeRisks:    number;
  riskNames:      string[];
  burnoutScore:   number | null;
  burnoutLevel:   string | null;
  offDayBalance:  number;
}

export async function sendWeeklyDigestAlert(params: WeeklyDigestParams): Promise<void> {
  if (!(await isAlertEnabled('weekly_digest'))) return;

  const subject = `[SmartCol AI] 📊 Your Weekly Workload Summary — ${params.weekStart} to ${params.weekEnd}`;

  // Colour helpers
  const workColor    = params.workHours > 50 ? '#ef4444' : params.workHours > 40 ? '#f59e0b' : '#10b981';
  const overtimeColor = params.overtimeHours > 0 ? '#ef4444' : '#94a3b8';
  const burnoutColor = !params.burnoutScore ? '#94a3b8'
    : params.burnoutScore >= 75 ? '#7c3aed'
    : params.burnoutScore >= 50 ? '#ef4444'
    : params.burnoutScore >= 25 ? '#f59e0b'
    : '#10b981';

  const riskSection = params.activeRisks > 0
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="color:#991b1b;font-size:13px;font-weight:700;margin:0 0 8px;">⚠️ ${params.activeRisks} Active Risk${params.activeRisks > 1 ? 's' : ''}</p>
        ${params.riskNames.map(r => `<p style="color:#7f1d1d;font-size:13px;margin:2px 0;">• ${r}</p>`).join('')}
        <p style="color:#991b1b;font-size:12px;margin:8px 0 0;">Log in to SmartCol AI to review and acknowledge these alerts.</p>
       </div>`
    : `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="color:#065f46;font-size:13px;font-weight:700;margin:0;">✅ No active risk alerts this week</p>
       </div>`;

  const burnoutSection = params.burnoutScore !== null
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px;display:flex;align-items:center;gap:16px;">
        <div style="text-align:center;min-width:64px;">
          <p style="color:${burnoutColor};font-size:36px;font-weight:800;margin:0;line-height:1;">${params.burnoutScore}</p>
          <p style="color:${burnoutColor};font-size:11px;font-weight:700;margin:2px 0 0;text-transform:uppercase;">/ 100</p>
        </div>
        <div>
          <p style="color:#1e293b;font-size:13px;font-weight:600;margin:0 0 2px;">Burnout Risk Score — ${(params.burnoutLevel ?? 'unknown').toUpperCase()}</p>
          <p style="color:#475569;font-size:12px;margin:0;">Based on your workload patterns from the last 4 weeks.</p>
        </div>
       </div>`
    : '';

  const offDaySection = params.offDayBalance > 0
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin:0 0 20px;">
        <p style="color:#065f46;font-size:13px;margin:0;">
          🏖️ You have <strong>${params.offDayBalance} off-day${params.offDayBalance > 1 ? 's' : ''}</strong> available.
          Use the Off-Day Recommendations in SmartCol AI to plan your rest.
        </p>
       </div>`
    : '';

  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 4px;">Hi <strong>${params.toName}</strong>,</p>
    <p style="color:#64748b;font-size:13px;margin:0 0 24px;">Here's your workload summary for the week of <strong>${params.weekStart} – ${params.weekEnd}</strong>.</p>

    <!-- Key metrics grid -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin:0 0 20px;">
      ${[
        { label: 'Work',     value: `${params.workHours.toFixed(1)}h`,    color: workColor },
        { label: 'Overtime', value: `${params.overtimeHours.toFixed(1)}h`, color: overtimeColor },
        { label: 'Meetings', value: `${params.meetingHours.toFixed(1)}h`,  color: '#f59e0b' },
        { label: 'Focus',    value: `${params.focusHours.toFixed(1)}h`,    color: '#6366f1' },
      ].map(m => `
        <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center;">
          <p style="color:${m.color};font-size:22px;font-weight:800;margin:0;line-height:1;">${m.value}</p>
          <p style="color:#64748b;font-size:11px;margin:4px 0 0;">${m.label}</p>
        </div>
      `).join('')}
    </div>

    ${riskSection}
    ${burnoutSection}
    ${offDaySection}

    <p style="color:#64748b;font-size:13px;margin:0;">
      View your full analytics, manage risk alerts, and plan your week at
      <a href="http://localhost:3000" style="color:#2563eb;">SmartCol AI</a>.
    </p>
  `);

  await deliver('weekly_digest', params.toEmail, params.toName, subject, html, {
    type:     'Weekly Digest',
    Week:     `${params.weekStart} – ${params.weekEnd}`,
    Work:     `${params.workHours.toFixed(1)}h (${params.overtimeHours.toFixed(1)}h OT)`,
    Risks:    params.activeRisks > 0 ? `${params.activeRisks} active` : 'none',
    Burnout:  params.burnoutScore !== null ? `${params.burnoutScore}/100 (${params.burnoutLevel})` : 'no score',
  });

  await markTriggered('weekly_digest');
}

// ── Test Alert ─────────────────────────────────────────────────────────────────

export async function sendTestAlert(toEmail: string, toName: string): Promise<void> {
  const subject = `[SmartCol AI] ✅ Email alert test — your notifications are working`;
  const html = emailWrapper(`
    <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${toName}</strong>,</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      This is a test email from SmartCol AI to confirm that your email notification settings are working correctly.
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:0 0 16px;">
      <p style="color:#065f46;font-size:24px;font-weight:800;margin:0;">✅ Email alerts are active</p>
      <p style="color:#065f46;font-size:13px;margin:8px 0 0;">
        Your SmartCol AI account is configured to receive email notifications.
        You can manage which alerts are enabled from the Settings page.
      </p>
    </div>
    <p style="color:#64748b;font-size:13px;">
      ${isSmtpConfigured()
        ? 'SMTP is configured — emails are being sent for real.'
        : 'SMTP is not yet configured — emails are shown in the server console (demo mode). Add EMAIL_USER and EMAIL_PASS to backend/.env to send real emails.'}
    </p>
  `);

  await deliver('test', toEmail, toName, subject, html, {
    type:   'Test Email',
    Status: isSmtpConfigured() ? 'SMTP configured — real email sent' : 'Console mode — no SMTP configured',
  });
}
