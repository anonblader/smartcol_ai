/**
 * Analytics / Workload Service
 *
 * Computes daily and weekly workload metrics from classified calendar events
 * and persists them to daily_workload and weekly_workload tables.
 */

import { db }     from './database.client';
import { logger } from '../config/monitoring.config';
import { triggerHighWorkloadDayAlert } from './email-alerts.service';

export interface WorkloadComputeResult {
  success: boolean;
  daysProcessed: number;
  weeksProcessed: number;
  error?: string;
}

// Task type IDs that count as "work" time
const WORK_TASK_TYPE_IDS = [1, 2, 3, 4, 5, 6, 7, 8]; // excludes Break/Personal(9) and Out of Office(10)
const MEETING_TASK_TYPE_IDS = [4, 5]; // Routine Meeting, 1:1 Check-in
const FOCUS_TASK_TYPE_IDS = [8];      // Focus Time
const BREAK_TASK_TYPE_IDS = [9, 10];  // Break/Personal, Out of Office
const DEADLINE_TASK_TYPE_IDS = [1, 3]; // Deadline, Project Milestone

const STANDARD_MINUTES_PER_DAY = 8 * 60; // 480 min (8-hour day)

/**
 * Compute and store workload metrics for a user.
 * Processes all dates that have classified events.
 */
export async function computeWorkload(userId: string): Promise<WorkloadComputeResult> {
  const result: WorkloadComputeResult = {
    success: false,
    daysProcessed: 0,
    weeksProcessed: 0,
  };

  try {
    logger.info('Computing workload', { userId });

    // Get all classified, non-cancelled events for user
    const events = await db.queryMany<{
      id: string;
      subject: string;
      start_time: Date;
      end_time: Date;
      duration_minutes: number;
      is_all_day: boolean;
      task_type_id: number;
      task_type_name: string;
    }>(
      `SELECT
         ce.id,
         ce.subject,
         ce.start_time,
         ce.end_time,
         ce.duration_minutes,
         ce.is_all_day,
         ec.task_type_id,
         tt.name AS task_type_name
       FROM calendar_events ce
       JOIN event_classifications ec ON ec.event_id = ce.id
       JOIN task_types tt ON tt.id = ec.task_type_id
       WHERE ce.user_id = $1
         AND ce.is_cancelled = false
       ORDER BY ce.start_time ASC`,
      [userId]
    );

    if (events.length === 0) {
      logger.info('No classified events to compute workload from', { userId });
      result.success = true;
      return result;
    }

    // Group events by date (using local date string YYYY-MM-DD)
    const byDate = new Map<string, typeof events>();
    for (const event of events) {
      const date = new Date(event.start_time).toISOString().split('T')[0] as string;
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(event);
    }

    // -------------------------------------------------------------------------
    // Compute and upsert daily_workload for each date
    // -------------------------------------------------------------------------
    for (const [date, dayEvents] of byDate) {
      const taskTypeBreakdown: Record<string, number> = {};
      let totalMinutes = 0;
      let workMinutes = 0;
      let meetingMinutes = 0;
      let focusMinutes = 0;
      let breakMinutes = 0;
      let meetingCount = 0;
      let deadlineCount = 0;

      for (const event of dayEvents) {
        const mins = event.is_all_day ? 0 : (event.duration_minutes || 0);
        totalMinutes += mins;

        // Task type breakdown
        const typeName = event.task_type_name;
        taskTypeBreakdown[typeName] = (taskTypeBreakdown[typeName] || 0) + mins;

        if (WORK_TASK_TYPE_IDS.includes(event.task_type_id)) workMinutes += mins;
        if (MEETING_TASK_TYPE_IDS.includes(event.task_type_id)) {
          meetingMinutes += mins;
          meetingCount++;
        }
        if (FOCUS_TASK_TYPE_IDS.includes(event.task_type_id)) focusMinutes += mins;
        if (BREAK_TASK_TYPE_IDS.includes(event.task_type_id)) breakMinutes += mins;
        if (DEADLINE_TASK_TYPE_IDS.includes(event.task_type_id)) deadlineCount++;
      }

      const overtimeMinutes = Math.max(0, workMinutes - STANDARD_MINUTES_PER_DAY);
      const hasHighWorkload = workMinutes > STANDARD_MINUTES_PER_DAY * 1.25; // >10h
      const hasOverlappingDeadlines = deadlineCount > 1;

      await db.query(
        `INSERT INTO daily_workload (
           user_id, date, total_minutes, work_minutes, meeting_minutes,
           focus_minutes, break_minutes, total_events, meeting_count,
           deadline_count, standard_minutes, overtime_minutes,
           task_type_breakdown, project_breakdown,
           has_high_workload, has_overlapping_deadlines
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (user_id, date) DO UPDATE SET
           total_minutes             = EXCLUDED.total_minutes,
           work_minutes              = EXCLUDED.work_minutes,
           meeting_minutes           = EXCLUDED.meeting_minutes,
           focus_minutes             = EXCLUDED.focus_minutes,
           break_minutes             = EXCLUDED.break_minutes,
           total_events              = EXCLUDED.total_events,
           meeting_count             = EXCLUDED.meeting_count,
           deadline_count            = EXCLUDED.deadline_count,
           standard_minutes          = EXCLUDED.standard_minutes,
           overtime_minutes          = EXCLUDED.overtime_minutes,
           task_type_breakdown       = EXCLUDED.task_type_breakdown,
           project_breakdown         = EXCLUDED.project_breakdown,
           has_high_workload         = EXCLUDED.has_high_workload,
           has_overlapping_deadlines = EXCLUDED.has_overlapping_deadlines,
           updated_at                = NOW()`,
        [
          userId,
          date,
          totalMinutes,
          workMinutes,
          meetingMinutes,
          focusMinutes,
          breakMinutes,
          dayEvents.length,
          meetingCount,
          deadlineCount,
          STANDARD_MINUTES_PER_DAY,
          overtimeMinutes,
          JSON.stringify(taskTypeBreakdown),
          JSON.stringify({}), // project breakdown (no project categories yet)
          hasHighWorkload,
          hasOverlappingDeadlines,
        ]
      );

      result.daysProcessed++;

      // Fire high workload day email if work > 10h (non-blocking, best-effort)
      if (workMinutes > STANDARD_MINUTES_PER_DAY * 1.25) {
        db.queryOne<{ email: string; display_name: string }>(
          'SELECT email, display_name FROM users WHERE id = $1', [userId]
        ).then(user => {
          if (user) {
            triggerHighWorkloadDayAlert({
              toEmail:     user.email,
              toName:      user.display_name || user.email,
              date,
              workMinutes,
              overtime:    overtimeMinutes,
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    // -------------------------------------------------------------------------
    // Compute and upsert weekly_workload
    // -------------------------------------------------------------------------
    const weekMap = new Map<string, { weekStart: string; year: number; weekNum: number; dates: string[] }>();

    for (const date of byDate.keys()) {
      const d = new Date(date);
      // ISO week: Monday as week start
      const dayOfWeek = d.getUTCDay() || 7; // 1=Mon, 7=Sun
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - dayOfWeek + 1);
      const weekStartStr = weekStart.toISOString().split('T')[0] as string;

      // ISO week number
      const jan4 = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 4));
      const weekNum = Math.ceil(((weekStart.getTime() - jan4.getTime()) / 86400000 + jan4.getUTCDay() + 1) / 7);

      if (!weekMap.has(weekStartStr)) {
        weekMap.set(weekStartStr, {
          weekStart: weekStartStr,
          year: weekStart.getUTCFullYear(),
          weekNum,
          dates: [],
        });
      }
      weekMap.get(weekStartStr)!.dates.push(date);
    }

    for (const [weekStart, weekInfo] of weekMap) {
      // Aggregate daily_workload rows for this week
      const dailyRows = await db.queryMany<{
        date: string;
        total_minutes: number;
        work_minutes: number;
        overtime_minutes: number;
        total_events: number;
        meeting_count: number;
        task_type_breakdown: Record<string, number>;
      }>(
        `SELECT date, total_minutes, work_minutes, overtime_minutes,
                total_events, meeting_count, task_type_breakdown
         FROM daily_workload
         WHERE user_id = $1
           AND date >= $2
           AND date < ($2::date + INTERVAL '7 days')`,
        [userId, weekStart]
      );

      let totalMinutes = 0;
      let workMinutes = 0;
      let overtimeMinutes = 0;
      let totalEvents = 0;
      let meetingCount = 0;
      const taskTypeBreakdown: Record<string, number> = {};
      const dailyBreakdown: Record<string, object> = {};

      for (const row of dailyRows) {
        totalMinutes += row.total_minutes;
        workMinutes += row.work_minutes;
        overtimeMinutes += row.overtime_minutes;
        totalEvents += row.total_events;
        meetingCount += row.meeting_count;

        // Merge task type breakdown
        const breakdown = typeof row.task_type_breakdown === 'string'
          ? JSON.parse(row.task_type_breakdown)
          : row.task_type_breakdown || {};
        for (const [type, mins] of Object.entries(breakdown)) {
          taskTypeBreakdown[type] = (taskTypeBreakdown[type] || 0) + (mins as number);
        }

        dailyBreakdown[row.date] = {
          total_minutes: row.total_minutes,
          work_minutes: row.work_minutes,
          meeting_count: row.meeting_count,
          overtime_minutes: row.overtime_minutes,
        };
      }

      await db.query(
        `INSERT INTO weekly_workload (
           user_id, week_start_date, year, week_number,
           total_minutes, work_minutes, overtime_minutes,
           total_events, meeting_count,
           task_type_breakdown, daily_breakdown
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, week_start_date) DO UPDATE SET
           total_minutes        = EXCLUDED.total_minutes,
           work_minutes         = EXCLUDED.work_minutes,
           overtime_minutes     = EXCLUDED.overtime_minutes,
           total_events         = EXCLUDED.total_events,
           meeting_count        = EXCLUDED.meeting_count,
           task_type_breakdown  = EXCLUDED.task_type_breakdown,
           daily_breakdown      = EXCLUDED.daily_breakdown,
           updated_at           = NOW()`,
        [
          userId,
          weekStart,
          weekInfo.year,
          weekInfo.weekNum,
          totalMinutes,
          workMinutes,
          overtimeMinutes,
          totalEvents,
          meetingCount,
          JSON.stringify(taskTypeBreakdown),
          JSON.stringify(dailyBreakdown),
        ]
      );

      result.weeksProcessed++;
    }

    result.success = true;
    logger.info('Workload computation complete', { userId, ...result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Workload computation failed', { userId, error });
    result.error = error;
    return result;
  }
}
