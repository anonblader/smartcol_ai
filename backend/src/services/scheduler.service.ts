/**
 * Scheduler Service
 *
 * Manages three background jobs using node-cron:
 *
 * 1. Analytics Pipeline  (every 30 min)
 *    For every user that has calendar events:
 *    classify unclassified events → compute workload → detect risks → ML predictions
 *
 * 2. Calendar Sync       (every 2 hours)
 *    For every user with a valid, non-expired Graph OAuth token:
 *    sync calendar → full pipeline (classify → workload → risks → ML)
 *
 * 3. Weekly Digest       (Monday 08:00)
 *    Sends each user a weekly workload summary email with metrics,
 *    risk count, burnout score, and off-day balance.
 */

import cron, { ScheduledTask } from 'node-cron';
import { db }                    from './database.client';
import { classifyUserEvents }    from './event-classification.service';
import { computeWorkload }       from './analytics.service';
import { detectRisks }           from './risks.service';
import { runMLPredictions }      from './ml-prediction.service';
import { syncCalendarEvents }    from './calendar-sync.service';
import { sendWeeklyDigestAlert } from './email-alerts.service';
import { logger }                from '../config/monitoring.config';

// ── Job status tracking (in-memory) ───────────────────────────────────────────

export interface JobStatus {
  name:            string;
  schedule:        string;
  humanSchedule:   string;
  enabled:         boolean;
  running:         boolean;
  lastRun:         string | null;   // ISO string
  lastRunStatus:   'success' | 'partial' | 'failed' | 'never';
  lastRunDuration: number | null;   // ms
  usersProcessed:  number;
  usersSkipped:    number;
  errors:          string[];
  nextRun:         string | null;   // ISO string (estimated)
}

const jobs: Record<string, JobStatus> = {
  analyticsPipeline: {
    name:            'Analytics Pipeline',
    schedule:        '*/30 * * * *',
    humanSchedule:   'Every 30 minutes',
    enabled:         true,
    running:         false,
    lastRun:         null,
    lastRunStatus:   'never',
    lastRunDuration: null,
    usersProcessed:  0,
    usersSkipped:    0,
    errors:          [],
    nextRun:         null,
  },
  calendarSync: {
    name:            'Calendar Sync',
    schedule:        '0 */2 * * *',
    humanSchedule:   'Every 2 hours',
    enabled:         true,
    running:         false,
    lastRun:         null,
    lastRunStatus:   'never',
    lastRunDuration: null,
    usersProcessed:  0,
    usersSkipped:    0,
    errors:          [],
    nextRun:         null,
  },
  weeklyDigest: {
    name:            'Weekly Digest Email',
    schedule:        '0 8 * * 1',
    humanSchedule:   'Monday at 08:00',
    enabled:         true,
    running:         false,
    lastRun:         null,
    lastRunStatus:   'never',
    lastRunDuration: null,
    usersProcessed:  0,
    usersSkipped:    0,
    errors:          [],
    nextRun:         null,
  },
};

/** Estimate the next run time by adding the interval to now. */
function estimateNextRun(schedule: string): string {
  const now = new Date();
  // Simple estimation based on common patterns
  if (schedule.startsWith('*/')) {
    const mins = parseInt(schedule.split(' ')[0]!.replace('*/', ''), 10);
    return new Date(now.getTime() + mins * 60 * 1000).toISOString();
  }
  if (schedule === '0 */2 * * *') {
    return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  }
  if (schedule === '0 8 * * 1') {
    // Next Monday 08:00
    const next = new Date(now);
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
    next.setUTCDate(now.getUTCDate() + daysUntilMonday);
    next.setUTCHours(8, 0, 0, 0);
    return next.toISOString();
  }
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

// ── Job implementations ────────────────────────────────────────────────────────

/**
 * Analytics Pipeline Job
 * Re-classifies unclassified events and refreshes workload / risk / ML data
 * for every user that has at least one calendar event.
 */
async function runAnalyticsPipeline(): Promise<void> {
  const status = jobs['analyticsPipeline']!;
  if (status.running) {
    logger.warn('[Scheduler] Analytics pipeline already running — skipping');
    return;
  }

  status.running       = true;
  status.errors        = [];
  status.usersProcessed = 0;
  status.usersSkipped  = 0;
  const start          = Date.now();
  logger.info('[Scheduler] Analytics pipeline started');

  try {
    // Fetch users that have at least one non-cancelled calendar event
    const users = await db.queryMany<{ id: string; display_name: string }>(
      `SELECT DISTINCT u.id, u.display_name
       FROM users u
       JOIN calendar_events ce ON ce.user_id = u.id
       WHERE ce.is_cancelled = false
       ORDER BY u.display_name`
    );

    if (users.length === 0) {
      logger.info('[Scheduler] No users with events — pipeline skipped');
      status.lastRunStatus = 'success';
    } else {
      for (const user of users) {
        try {
          await classifyUserEvents(user.id);
          await computeWorkload(user.id);
          await detectRisks(user.id);
          await runMLPredictions(user.id);
          status.usersProcessed++;
          logger.debug(`[Scheduler] Pipeline complete for ${user.display_name}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[Scheduler] Pipeline failed for ${user.display_name}`, { error: msg });
          status.errors.push(`${user.display_name}: ${msg}`);
          status.usersSkipped++;
        }
      }
      status.lastRunStatus = status.errors.length === 0 ? 'success'
        : status.usersProcessed > 0 ? 'partial' : 'failed';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Scheduler] Analytics pipeline error', { error: msg });
    status.errors.push(msg);
    status.lastRunStatus = 'failed';
  } finally {
    status.running         = false;
    status.lastRun         = new Date().toISOString();
    status.lastRunDuration = Date.now() - start;
    status.nextRun         = estimateNextRun(status.schedule);
    logger.info('[Scheduler] Analytics pipeline finished', {
      usersProcessed: status.usersProcessed,
      usersSkipped:   status.usersSkipped,
      durationMs:     status.lastRunDuration,
      status:         status.lastRunStatus,
    });
  }
}

/**
 * Calendar Sync Job
 * For each user with a valid (non-expired) Graph token, syncs their calendar
 * from Microsoft Graph, then runs the full analytics pipeline.
 */
async function runCalendarSync(): Promise<void> {
  const status = jobs['calendarSync']!;
  if (status.running) {
    logger.warn('[Scheduler] Calendar sync already running — skipping');
    return;
  }

  status.running        = true;
  status.errors         = [];
  status.usersProcessed = 0;
  status.usersSkipped   = 0;
  const start           = Date.now();
  logger.info('[Scheduler] Calendar sync started');

  try {
    // Fetch users with unexpired Graph tokens
    const users = await db.queryMany<{ id: string; display_name: string }>(
      `SELECT u.id, u.display_name
       FROM users u
       JOIN oauth_tokens ot ON ot.user_id = u.id
       WHERE ot.expires_at > NOW() + INTERVAL '5 minutes'
       ORDER BY u.display_name`
    );

    if (users.length === 0) {
      logger.info('[Scheduler] No users with valid Graph tokens — sync skipped');
      status.lastRunStatus = 'success';
    } else {
      for (const user of users) {
        try {
          const syncResult = await syncCalendarEvents(user.id);
          if (syncResult.success) {
            await classifyUserEvents(user.id);
            await computeWorkload(user.id);
            await detectRisks(user.id);
            await runMLPredictions(user.id);
            status.usersProcessed++;
            logger.debug(`[Scheduler] Sync + pipeline complete for ${user.display_name}`);
          } else {
            throw new Error(syncResult.error || 'Sync failed');
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[Scheduler] Sync failed for ${user.display_name}`, { error: msg });
          status.errors.push(`${user.display_name}: ${msg}`);
          status.usersSkipped++;
        }
      }
      status.lastRunStatus = status.errors.length === 0 ? 'success'
        : status.usersProcessed > 0 ? 'partial' : 'failed';
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Scheduler] Calendar sync error', { error: msg });
    status.errors.push(msg);
    status.lastRunStatus = 'failed';
  } finally {
    status.running         = false;
    status.lastRun         = new Date().toISOString();
    status.lastRunDuration = Date.now() - start;
    status.nextRun         = estimateNextRun(status.schedule);
    logger.info('[Scheduler] Calendar sync finished', {
      usersProcessed: status.usersProcessed,
      usersSkipped:   status.usersSkipped,
      durationMs:     status.lastRunDuration,
      status:         status.lastRunStatus,
    });
  }
}

// ── Weekly Digest Job ─────────────────────────────────────────────────────────

/**
 * Weekly Digest Job — Monday 08:00
 * Sends each user a summary of their previous week's workload,
 * risk count, burnout score, and off-day balance.
 */
async function runWeeklyDigest(): Promise<void> {
  const status = jobs['weeklyDigest']!;
  if (status.running) {
    logger.warn('[Scheduler] Weekly digest already running — skipping');
    return;
  }

  status.running        = true;
  status.errors         = [];
  status.usersProcessed = 0;
  status.usersSkipped   = 0;
  const start           = Date.now();
  logger.info('[Scheduler] Weekly digest started');

  try {
    // ISO week start for the PREVIOUS week (Mon–Sun)
    const now       = new Date();
    const dayOfWeek = now.getUTCDay() || 7;             // 1=Mon … 7=Sun
    const thisMonday = new Date(now);
    thisMonday.setUTCDate(now.getUTCDate() - dayOfWeek + 1);
    thisMonday.setUTCHours(0, 0, 0, 0);

    const lastMonday = new Date(thisMonday);
    lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);

    const weekStart = lastMonday.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
    const weekEnd   = lastSunday.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' });
    const weekStartStr = lastMonday.toISOString().split('T')[0]!;

    // Fetch all users
    const users = await db.queryMany<{ id: string; email: string; display_name: string }>(
      `SELECT id, email, display_name FROM users WHERE is_active = true ORDER BY display_name`
    );

    for (const user of users) {
      try {
        // Last week's workload
        const weekly = await db.queryOne<{
          work_minutes: number; overtime_minutes: number;
          meeting_minutes: number; total_events: number;
        }>(
          `SELECT work_minutes, overtime_minutes, meeting_minutes, total_events
           FROM weekly_workload
           WHERE user_id = $1 AND week_start_date = $2`,
          [user.id, weekStartStr]
        );

        // Skip users with no data for last week
        if (!weekly || Number(weekly.work_minutes) === 0) {
          status.usersSkipped++;
          continue;
        }

        // Focus minutes — aggregate from daily_workload for the week
        const focusRow = await db.queryOne<{ focus_minutes: number }>(
          `SELECT COALESCE(SUM(focus_minutes), 0) AS focus_minutes
           FROM daily_workload
           WHERE user_id = $1 AND date >= $2 AND date < $3`,
          [user.id, weekStartStr, weekStartStr.replace(/\d{4}-\d{2}-\d{2}/, thisMonday.toISOString().split('T')[0]!)]
        );

        // Active risks
        const risks = await db.queryMany<{ title: string }>(
          `SELECT ra.title FROM risk_alerts ra
           WHERE ra.user_id = $1 AND ra.status IN ('active','acknowledged')
           ORDER BY ra.score DESC LIMIT 5`,
          [user.id]
        );

        // Latest burnout score
        const burnout = await db.queryOne<{ score: number; level: string }>(
          `SELECT score, level FROM burnout_scores
           WHERE user_id = $1 ORDER BY score_date DESC LIMIT 1`,
          [user.id]
        );

        // Off-day balance
        const earned = await db.queryOne<{ earned: number; used: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'accepted') AS used,
             (SELECT COUNT(*) FROM offday_recommendations
              WHERE user_id = $1 AND status != 'expired') AS earned
           FROM offday_recommendations WHERE user_id = $1`,
          [user.id]
        );
        const balance = Math.max(0, Number(earned?.earned ?? 0) - Number(earned?.used ?? 0));

        await sendWeeklyDigestAlert({
          toEmail:       user.email,
          toName:        user.display_name || user.email,
          weekStart,
          weekEnd,
          workHours:     Number(weekly.work_minutes) / 60,
          overtimeHours: Number(weekly.overtime_minutes) / 60,
          meetingHours:  Number(weekly.meeting_minutes) / 60,
          focusHours:    Number(focusRow?.focus_minutes ?? 0) / 60,
          activeRisks:   risks.length,
          riskNames:     risks.map(r => r.title),
          burnoutScore:  burnout ? Number(burnout.score) : null,
          burnoutLevel:  burnout?.level ?? null,
          offDayBalance: balance,
        });

        status.usersProcessed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[Scheduler] Weekly digest failed for ${user.display_name}`, { error: msg });
        status.errors.push(`${user.display_name}: ${msg}`);
        status.usersSkipped++;
      }
    }

    status.lastRunStatus = status.errors.length === 0 ? 'success'
      : status.usersProcessed > 0 ? 'partial' : 'failed';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[Scheduler] Weekly digest error', { error: msg });
    status.errors.push(msg);
    status.lastRunStatus = 'failed';
  } finally {
    status.running         = false;
    status.lastRun         = new Date().toISOString();
    status.lastRunDuration = Date.now() - start;
    status.nextRun         = estimateNextRun(status.schedule);
    logger.info('[Scheduler] Weekly digest finished', {
      usersProcessed: status.usersProcessed,
      usersSkipped:   status.usersSkipped,
      durationMs:     status.lastRunDuration,
      status:         status.lastRunStatus,
    });
  }
}

// ── Scheduler lifecycle ────────────────────────────────────────────────────────

let taskPipeline: ScheduledTask | null  = null;
let taskCalSync:  ScheduledTask | null  = null;
let taskDigest:   ScheduledTask | null  = null;

/** Start all three scheduled jobs. Called once from server.ts on startup. */
export function startScheduler(): void {
  logger.info('[Scheduler] Starting background jobs');

  // Analytics pipeline — every 30 minutes
  taskPipeline = cron.schedule('*/30 * * * *', () => {
    if (jobs['analyticsPipeline']!.enabled) {
      runAnalyticsPipeline().catch((err) =>
        logger.error('[Scheduler] Unhandled pipeline error', { error: err })
      );
    }
  });

  // Calendar sync — every 2 hours
  taskCalSync = cron.schedule('0 */2 * * *', () => {
    if (jobs['calendarSync']!.enabled) {
      runCalendarSync().catch((err) =>
        logger.error('[Scheduler] Unhandled sync error', { error: err })
      );
    }
  });

  // Weekly digest — Monday 08:00
  taskDigest = cron.schedule('0 8 * * 1', () => {
    if (jobs['weeklyDigest']!.enabled) {
      runWeeklyDigest().catch((err) =>
        logger.error('[Scheduler] Unhandled digest error', { error: err })
      );
    }
  });

  // Set initial next-run estimates
  jobs['analyticsPipeline']!.nextRun = estimateNextRun('*/30 * * * *');
  jobs['calendarSync']!.nextRun      = estimateNextRun('0 */2 * * *');
  jobs['weeklyDigest']!.nextRun      = estimateNextRun('0 8 * * 1');

  logger.info('[Scheduler] Background jobs registered', {
    analyticsPipeline: jobs['analyticsPipeline']!.schedule,
    calendarSync:      jobs['calendarSync']!.schedule,
    weeklyDigest:      jobs['weeklyDigest']!.schedule,
  });
}

/** Stop all scheduled jobs. Called during graceful shutdown. */
export function stopScheduler(): void {
  taskPipeline?.stop();
  taskCalSync?.stop();
  taskDigest?.stop();
  logger.info('[Scheduler] Background jobs stopped');
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function getSchedulerStatus(): Record<string, JobStatus> {
  return jobs;
}

export function triggerJob(jobKey: string): { success: boolean; message: string } {
  if (jobKey === 'analyticsPipeline') {
    if (jobs['analyticsPipeline']!.running) return { success: false, message: 'Job already running' };
    runAnalyticsPipeline().catch(() => {});
    return { success: true, message: 'Analytics pipeline triggered' };
  }
  if (jobKey === 'calendarSync') {
    if (jobs['calendarSync']!.running) return { success: false, message: 'Job already running' };
    runCalendarSync().catch(() => {});
    return { success: true, message: 'Calendar sync triggered' };
  }
  if (jobKey === 'weeklyDigest') {
    if (jobs['weeklyDigest']!.running) return { success: false, message: 'Job already running' };
    runWeeklyDigest().catch(() => {});
    return { success: true, message: 'Weekly digest triggered' };
  }
  return { success: false, message: `Unknown job: ${jobKey}` };
}

export function setJobEnabled(jobKey: string, enabled: boolean): { success: boolean; message: string } {
  const job = jobs[jobKey];
  if (!job) return { success: false, message: `Unknown job: ${jobKey}` };
  job.enabled = enabled;
  logger.info(`[Scheduler] Job "${job.name}" ${enabled ? 'enabled' : 'paused'}`);
  return { success: true, message: `Job ${enabled ? 'enabled' : 'paused'}` };
}
