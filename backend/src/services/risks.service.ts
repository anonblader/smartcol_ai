/**
 * Risk Detection Service
 *
 * Analyses computed workload and calendar events to detect the 6 risk types
 * and upserts results into risk_alerts.
 */

import { db }     from './database.client';
import { logger } from '../config/monitoring.config';
import { triggerRiskDetectedAlert } from './email-alerts.service';

export interface RiskDetectionResult {
  success: boolean;
  alertsCreated: number;
  alertsUpdated: number;
  risksDetected: string[];
  error?: string;
}

// ── thresholds ────────────────────────────────────────────────────────────────
const HIGH_DAILY_MINUTES      = 600;   // 10 h/day
const BURNOUT_WEEKLY_MINUTES  = 3000;  // 50 h/week for 3+ consecutive weeks
const BURNOUT_WEEKS_REQUIRED  = 3;
const OVERLAP_WINDOW_DAYS     = 3;     // deadlines within N days
const OVERLAP_MIN_COUNT       = 2;
const EXCESSIVE_TROUBLESHOOT  = 480;   // 8 h/week ad-hoc
const LOW_FOCUS_MINUTES       = 300;   // < 5 h/week
const MEETING_OVERLOAD_MINS   = 1200;  // > 20 h/week
const MEETING_OVERLOAD_COUNT  = 25;    // or 25+ meetings

// task type IDs
const DEADLINE_TYPE_IDS        = [1, 3]; // Deadline, Project Milestone
const TROUBLESHOOT_TYPE_ID     = 2;
// const FOCUS_TYPE_ID         = 8;      // used via daily_workload.focus_minutes
// const MEETING_TYPE_IDS      = [4, 5]; // used via daily_workload.meeting_minutes

/**
 * Upsert a risk alert.
 *
 * Priority order when finding an existing alert to update:
 *   1. acknowledged — condition still active, keep status so user knows it's ongoing
 *   2. active       — just update metrics
 * If neither exists, insert a fresh active alert.
 */
async function upsertAlert(alert: {
  userId: string;
  riskTypeId: number;
  severity: string;
  score: number;
  title: string;
  description: string;
  recommendation: string;
  startDate: string | null;
  endDate: string | null;
  metrics: Record<string, any>;
}): Promise<'created' | 'updated'> {
  // Check for an acknowledged OR active alert (acknowledged takes priority)
  const existing = await db.queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM risk_alerts
     WHERE user_id = $1 AND risk_type_id = $2 AND status IN ('active','acknowledged')
     ORDER BY CASE status WHEN 'acknowledged' THEN 0 ELSE 1 END, created_at DESC
     LIMIT 1`,
    [alert.userId, alert.riskTypeId]
  );

  if (existing) {
    // Preserve 'acknowledged' status — only update metrics/score so the user
    // can see it's still ongoing without losing their acknowledgement.
    await db.query(
      `UPDATE risk_alerts
       SET severity = $1, score = $2, title = $3, description = $4,
           recommendation = $5, start_date = $6, end_date = $7,
           metrics = $8, detected_date = CURRENT_DATE, updated_at = NOW()
       WHERE id = $9`,
      [
        alert.severity, alert.score, alert.title, alert.description,
        alert.recommendation, alert.startDate, alert.endDate,
        JSON.stringify(alert.metrics), existing.id,
      ]
    );
    return 'updated';
  }

  await db.query(
    `INSERT INTO risk_alerts
       (user_id, risk_type_id, severity, score, detected_date,
        start_date, end_date, title, description, recommendation, metrics, status)
     VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8,$9,$10,'active')`,
    [
      alert.userId, alert.riskTypeId, alert.severity, alert.score,
      alert.startDate, alert.endDate,
      alert.title, alert.description, alert.recommendation,
      JSON.stringify(alert.metrics),
    ]
  );
  return 'created';
}

/**
 * Auto-resolve any active OR acknowledged alerts for a risk type that is
 * no longer triggered. This is the only way acknowledged alerts get resolved —
 * the system does it automatically when the condition improves.
 */
async function resolveAlert(userId: string, riskTypeId: number): Promise<void> {
  await db.query(
    `UPDATE risk_alerts
     SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND risk_type_id = $2 AND status IN ('active','acknowledged')`,
    [userId, riskTypeId]
  );
}

// ── individual detectors ──────────────────────────────────────────────────────

async function detectHighDailyWorkload(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const days = await db.queryMany<{
    date: string;
    work_minutes: number;
  }>(
    `SELECT date, work_minutes FROM daily_workload
     WHERE user_id = $1 AND work_minutes > $2
     ORDER BY date ASC`,
    [userId, HIGH_DAILY_MINUTES]
  );

  if (!days.length) {
    await resolveAlert(userId, 1);
    return { triggered: false };
  }

  const maxMins = Math.max(...days.map((d) => d.work_minutes));
  const score = Math.min(100, Math.round((maxMins / HIGH_DAILY_MINUTES) * 80));
  const action = await upsertAlert({
    userId,
    riskTypeId: 1,
    severity: maxMins > 720 ? 'critical' : 'high',
    score,
    title: `High daily workload on ${days.length} day(s)`,
    description: `You worked more than 10 hours on ${days.length} day(s). Peak: ${(maxMins / 60).toFixed(1)}h.`,
    recommendation: 'Consider redistributing tasks and blocking focus time to avoid burnout.',
    startDate: days[0]?.date ?? null,
    endDate: days[days.length - 1]?.date ?? null,
    metrics: { days: days.length, peakMinutes: maxMins },
  });
  return { triggered: true, action };
}

async function detectBurnoutRisk(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const weeks = await db.queryMany<{
    week_start_date: string;
    work_minutes: number;
  }>(
    `SELECT week_start_date, work_minutes FROM weekly_workload
     WHERE user_id = $1
     ORDER BY week_start_date DESC
     LIMIT 10`,
    [userId]
  );

  // Count consecutive recent weeks over threshold
  let consecutive = 0;
  for (const w of weeks) {
    if (w.work_minutes > BURNOUT_WEEKLY_MINUTES) consecutive++;
    else break;
  }

  if (consecutive < BURNOUT_WEEKS_REQUIRED) {
    await resolveAlert(userId, 2);
    return { triggered: false };
  }

  const avgMins = weeks.slice(0, consecutive).reduce((s, w) => s + w.work_minutes, 0) / consecutive;
  const score = Math.min(100, Math.round((avgMins / BURNOUT_WEEKLY_MINUTES) * 90));
  const action = await upsertAlert({
    userId,
    riskTypeId: 2,
    severity: 'critical',
    score,
    title: `Burnout risk — ${consecutive} consecutive weeks over 50 h`,
    description: `You have averaged ${(avgMins / 60).toFixed(1)}h/week for ${consecutive} weeks in a row.`,
    recommendation: 'Take a day off soon. Block personal time and speak to your manager about workload.',
    startDate: weeks[consecutive - 1]?.week_start_date ?? null,
    endDate: weeks[0]?.week_start_date ?? null,
    metrics: { consecutiveWeeks: consecutive, avgMinutes: Math.round(avgMins) },
  });
  return { triggered: true, action };
}

async function detectOverlappingDeadlines(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const deadlines = await db.queryMany<{
    id: string;
    subject: string;
    start_time: Date;
  }>(
    `SELECT ce.id, ce.subject, ce.start_time
     FROM calendar_events ce
     JOIN event_classifications ec ON ec.event_id = ce.id
     WHERE ce.user_id = $1
       AND ec.task_type_id = ANY($2)
       AND ce.is_cancelled = false
       AND ce.start_time >= NOW()
     ORDER BY ce.start_time ASC`,
    [userId, DEADLINE_TYPE_IDS]
  );

  if (deadlines.length < OVERLAP_MIN_COUNT) {
    await resolveAlert(userId, 3);
    return { triggered: false };
  }

  // Sliding window — find any pair within OVERLAP_WINDOW_DAYS
  let clusterStart: Date | null = null;
  let clusterEnd: Date | null = null;
  let clusterCount = 0;
  const relatedIds: string[] = [];

  for (let i = 0; i < deadlines.length - 1; i++) {
    const curr = deadlines[i]!;
    const next = deadlines[i + 1]!;
    const a = new Date(curr.start_time);
    const b = new Date(next.start_time);
    const diffDays = (b.getTime() - a.getTime()) / 86400000;

    if (diffDays <= OVERLAP_WINDOW_DAYS) {
      if (!clusterStart) clusterStart = a;
      clusterEnd = b;
      clusterCount += 2;
      relatedIds.push(curr.id, next.id);
    }
  }

  if (!clusterStart) {
    await resolveAlert(userId, 3);
    return { triggered: false };
  }

  const score = Math.min(100, clusterCount * 20);
  const action = await upsertAlert({
    userId,
    riskTypeId: 3,
    severity: clusterCount >= 4 ? 'high' : 'medium',
    score,
    title: `${clusterCount} overlapping deadlines within ${OVERLAP_WINDOW_DAYS} days`,
    description: `Multiple deadlines/milestones are clustered between ${clusterStart.toDateString()} and ${clusterEnd!.toDateString()}.`,
    recommendation: 'Negotiate deadline extensions or delegate tasks to reduce peak pressure.',
    startDate: clusterStart.toISOString().split('T')[0] as string,
    endDate: clusterEnd!.toISOString().split('T')[0] as string,
    metrics: { count: clusterCount, windowDays: OVERLAP_WINDOW_DAYS },
  });
  return { triggered: true, action };
}

async function detectExcessiveTroubleshooting(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const result = await db.queryOne<{ total_minutes: number; week_start: string }>(
    `SELECT SUM(ce.duration_minutes) AS total_minutes,
            MIN(date_trunc('week', ce.start_time))::date::text AS week_start
     FROM calendar_events ce
     JOIN event_classifications ec ON ec.event_id = ce.id
     WHERE ce.user_id = $1
       AND ec.task_type_id = $2
       AND ce.is_cancelled = false
       AND ce.start_time >= date_trunc('week', NOW())`,
    [userId, TROUBLESHOOT_TYPE_ID]
  );

  const mins = Number(result?.total_minutes || 0);
  if (mins <= EXCESSIVE_TROUBLESHOOT) {
    await resolveAlert(userId, 4);
    return { triggered: false };
  }

  const score = Math.min(100, Math.round((mins / EXCESSIVE_TROUBLESHOOT) * 70));
  const action = await upsertAlert({
    userId,
    riskTypeId: 4,
    severity: mins > 960 ? 'high' : 'medium',
    score,
    title: `Excessive troubleshooting — ${(mins / 60).toFixed(1)}h this week`,
    description: `You spent ${(mins / 60).toFixed(1)}h on ad-hoc incidents this week (threshold: 8h).`,
    recommendation: 'Consider root-cause analysis sessions to reduce recurring incidents.',
    startDate: result?.week_start || null,
    endDate: null,
    metrics: { weeklyMinutes: mins },
  });
  return { triggered: true, action };
}

async function detectLowFocusTime(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const result = await db.queryOne<{ focus_minutes: number; work_minutes: number; week_start: string }>(
    `SELECT SUM(focus_minutes) AS focus_minutes,
            SUM(work_minutes)  AS work_minutes,
            MIN(date_trunc('week', NOW()))::date::text AS week_start
     FROM daily_workload
     WHERE user_id = $1
       AND date >= date_trunc('week', NOW())`,
    [userId]
  );

  const mins      = Number(result?.focus_minutes || 0);
  const workMins  = Number(result?.work_minutes  || 0);

  // No data yet — skip to avoid false positives on fresh syncs
  if (workMins === 0) {
    await resolveAlert(userId, 5);
    return { triggered: false };
  }

  if (mins >= LOW_FOCUS_MINUTES) {
    await resolveAlert(userId, 5);
    return { triggered: false };
  }

  // Score is higher the less focus time there is
  const score = Math.min(100, Math.round(((LOW_FOCUS_MINUTES - mins) / LOW_FOCUS_MINUTES) * 70));
  const action = await upsertAlert({
    userId,
    riskTypeId: 5,
    severity: mins === 0 ? 'medium' : 'low',
    score,
    title: `Low focus time — only ${(mins / 60).toFixed(1)}h this week`,
    description: `You have only ${(mins / 60).toFixed(1)}h of dedicated focus time this week (recommended: 5h+).`,
    recommendation: 'Block 2–3 hour focus slots in your calendar to protect deep work time.',
    startDate: result?.week_start || null,
    endDate: null,
    metrics: { weeklyFocusMinutes: mins, threshold: LOW_FOCUS_MINUTES },
  });
  return { triggered: true, action };
}

async function detectMeetingOverload(
  userId: string
): Promise<{ triggered: boolean; action?: 'created' | 'updated' }> {
  const result = await db.queryOne<{
    meeting_minutes: number;
    meeting_count: number;
    week_start: string;
  }>(
    `SELECT SUM(meeting_minutes) AS meeting_minutes,
            SUM(meeting_count)   AS meeting_count,
            MIN(date_trunc('week', NOW()))::date::text AS week_start
     FROM daily_workload
     WHERE user_id = $1
       AND date >= date_trunc('week', NOW())`,
    [userId]
  );

  const mins = Number(result?.meeting_minutes || 0);
  const count = Number(result?.meeting_count || 0);

  if (mins <= MEETING_OVERLOAD_MINS && count < MEETING_OVERLOAD_COUNT) {
    await resolveAlert(userId, 6);
    return { triggered: false };
  }

  const score = Math.min(100, Math.round(Math.max(
    (mins / MEETING_OVERLOAD_MINS) * 80,
    (count / MEETING_OVERLOAD_COUNT) * 80
  )));
  const action = await upsertAlert({
    userId,
    riskTypeId: 6,
    severity: mins > 1800 || count > 35 ? 'high' : 'medium',
    score,
    title: `Meeting overload — ${(mins / 60).toFixed(1)}h in ${count} meetings this week`,
    description: `${(mins / 60).toFixed(1)}h spent in meetings (threshold: 20h) across ${count} meetings.`,
    recommendation: 'Decline optional meetings and batch remaining ones to protect focused work time.',
    startDate: result?.week_start || null,
    endDate: null,
    metrics: { weeklyMeetingMinutes: mins, meetingCount: count },
  });
  return { triggered: true, action };
}

// ── main entry point ──────────────────────────────────────────────────────────

export async function detectRisks(userId: string): Promise<RiskDetectionResult> {
  const result: RiskDetectionResult = {
    success: false,
    alertsCreated: 0,
    alertsUpdated: 0,
    risksDetected: [],
  };

  try {
    logger.info('Running risk detection', { userId });

    const detectors = [
      { name: 'High Daily Workload',       fn: () => detectHighDailyWorkload(userId) },
      { name: 'Burnout Risk',              fn: () => detectBurnoutRisk(userId) },
      { name: 'Overlapping Deadlines',     fn: () => detectOverlappingDeadlines(userId) },
      { name: 'Excessive Troubleshooting', fn: () => detectExcessiveTroubleshooting(userId) },
      { name: 'Low Focus Time',            fn: () => detectLowFocusTime(userId) },
      { name: 'Meeting Overload',          fn: () => detectMeetingOverload(userId) },
    ];

    // Fetch user email once for email alerts
    const user = await db.queryOne<{ email: string; display_name: string }>(
      'SELECT email, display_name FROM users WHERE id = $1', [userId]
    );

    for (const { name, fn } of detectors) {
      const { triggered, action } = await fn();
      if (triggered) {
        result.risksDetected.push(name);
        if (action === 'created') {
          result.alertsCreated++;
          // Fire email alert for newly created risks (non-blocking)
          if (user) {
            const newAlert = await db.queryOne<{
              title: string; description: string; recommendation: string; severity: string;
            }>(
              `SELECT title, description, recommendation, severity
               FROM risk_alerts
               WHERE user_id = $1 AND status IN ('active','acknowledged')
               ORDER BY created_at DESC LIMIT 1`,
              [userId]
            );
            if (newAlert) {
              triggerRiskDetectedAlert({
                toEmail:        user.email,
                toName:         user.display_name || user.email,
                riskTitle:      newAlert.title,
                riskDesc:       newAlert.description || '',
                severity:       newAlert.severity,
                recommendation: newAlert.recommendation || '',
              }).catch(() => {});
            }
          }
        } else if (action === 'updated') {
          result.alertsUpdated++;
        }
      }
    }

    result.success = true;
    logger.info('Risk detection complete', { userId, ...result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Risk detection failed', { userId, error });
    result.error = error;
    return result;
  }
}

export async function getActiveAlerts(userId: string) {
  return db.queryMany(
    `SELECT ra.*, rt.name AS risk_type_name
     FROM risk_alerts ra
     JOIN risk_types rt ON rt.id = ra.risk_type_id
     WHERE ra.user_id = $1 AND ra.status = 'active'
     ORDER BY ra.score DESC, ra.detected_date DESC`,
    [userId]
  );
}

export async function getAcknowledgedAlerts(userId: string) {
  return db.queryMany(
    `SELECT ra.*, rt.name AS risk_type_name
     FROM risk_alerts ra
     JOIN risk_types rt ON rt.id = ra.risk_type_id
     WHERE ra.user_id = $1 AND ra.status = 'acknowledged'
     ORDER BY ra.score DESC, ra.acknowledged_at DESC`,
    [userId]
  );
}

export async function acknowledgeAlert(userId: string, alertId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE risk_alerts
     SET status = 'acknowledged', acknowledged_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'active'`,
    [alertId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Dismiss — force-closes an alert regardless of condition state.
 * Different from auto-resolve: the user is manually overriding.
 */
export async function dismissAlert(userId: string, alertId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE risk_alerts
     SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status IN ('active','acknowledged')`,
    [alertId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
