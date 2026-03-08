/**
 * Email Service
 *
 * Sends notification emails via SMTP (nodemailer).
 * Falls back to console logging when EMAIL_USER is not configured
 * so the app still works during development without SMTP credentials.
 */

import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../config/monitoring.config';

function isConfigured(): boolean {
  return !!(config.email.user && config.email.pass);
}

async function getTransport() {
  return nodemailer.createTransport({
    host:   config.email.host,
    port:   config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });
}

export interface RiskAckEmailParams {
  toEmail:         string;
  toName:          string;
  adminName:       string;
  riskTitle:       string;
  riskDescription: string;
  recommendation:  string;
  severity:        string;
}

export async function sendRiskAcknowledgementEmail(params: RiskAckEmailParams): Promise<void> {
  const sevColour: Record<string, string> = {
    low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#7c3aed',
  };
  const colour = sevColour[params.severity] || '#6b7280';

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1e293b;padding:24px 32px;border-radius:8px 8px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:20px;">SmartCol AI</h1>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">Workload Intelligence Platform</p>
      </div>

      <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
        <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hi <strong>${params.toName}</strong>,</p>

        <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
          Your manager <strong>${params.adminName}</strong> has reviewed and acknowledged a workload risk
          flagged on your account. This means they are aware of the situation and are monitoring it.
        </p>

        <div style="border-left:4px solid ${colour};background:${colour}10;padding:16px 20px;border-radius:0 6px 6px 0;margin:0 0 20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <span style="background:${colour};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;">${params.severity}</span>
            <strong style="color:#1e293b;font-size:14px;">${params.riskTitle}</strong>
          </div>
          <p style="color:#475569;font-size:13px;margin:0;">${params.riskDescription}</p>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px 20px;margin:0 0 24px;">
          <p style="color:#065f46;font-size:13px;font-weight:600;margin:0 0 6px;">💡 Recommendation</p>
          <p style="color:#065f46;font-size:13px;margin:0;">${params.recommendation}</p>
        </div>

        <p style="color:#64748b;font-size:13px;margin:0 0 4px;">
          You can view your full workload analysis and risk details by logging into SmartCol AI.
        </p>
        <p style="color:#94a3b8;font-size:12px;margin:0;">
          This is an automated message from SmartCol AI. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  `;

  if (!isConfigured()) {
    // Console-log mode — useful during development / demo without SMTP
    logger.info('[EMAIL — console mode] Risk acknowledgement notification', {
      to:          params.toEmail,
      subject:     `[SmartCol AI] ${params.adminName} has acknowledged your workload risk`,
      risk:        params.riskTitle,
      severity:    params.severity,
      adminName:   params.adminName,
    });
    console.log('\n📧 ─── EMAIL (console mode) ───────────────────────────────');
    console.log(`   To:      ${params.toName} <${params.toEmail}>`);
    console.log(`   Subject: [SmartCol AI] ${params.adminName} has acknowledged your workload risk`);
    console.log(`   Risk:    [${params.severity.toUpperCase()}] ${params.riskTitle}`);
    console.log(`   Note:    Set EMAIL_USER + EMAIL_PASS in .env to send real emails`);
    console.log('───────────────────────────────────────────────────────────\n');
    return;
  }

  try {
    const transport = await getTransport();
    await transport.sendMail({
      from:    `"${config.email.fromName}" <${config.email.user}>`,
      to:      `"${params.toName}" <${params.toEmail}>`,
      subject: `[SmartCol AI] ${params.adminName} has acknowledged your workload risk`,
      html,
    });
    logger.info('Risk acknowledgement email sent', { to: params.toEmail, risk: params.riskTitle });
  } catch (err) {
    logger.error('Failed to send email', {
      error: err instanceof Error ? err.message : 'Unknown error',
      to: params.toEmail,
    });
    // Non-fatal — don't throw, just log
  }
}
