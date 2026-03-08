/**
 * Off-Day Recommendation Service
 *
 * Entitlement rules:
 *   • +1 off-day for each WEEKDAY where work_minutes ≥ 720 (standard 8h + 4h extra)
 *   • +1 off-day for each WEEKEND DAY (Sat/Sun) where work_minutes > 0
 *   • Balance = earned − accepted recommendations
 *   • Recommendations are capped at the available balance
 *   • Once balance reaches 0, no recommendations are shown
 *
 * Scoring formula (0–100, higher = better day to take off):
 *   Priority Score =
 *     (100 − WorkloadScore)   × 0.40   ← lighter workload
 *     (100 − DeadlineCount×20) × 0.30  ← fewer nearby deadlines
 *     (100 − MeetingCount×10)  × 0.20  ← fewer meetings
 *     (100 − DaysInFuture/30×20) × 0.10 ← sooner is more actionable
 */

import { db } from './database.client';
import { logger } from '../config/monitoring.config';

// Standard working minutes per day (8 h) + minimum overtime to qualify (4 h)
const STANDARD_MINUTES    = 8 * 60;   // 480 min
const OVERTIME_THRESHOLD  = 4 * 60;   // 240 min — must work AT LEAST this much extra
const ENTITLEMENT_TRIGGER = STANDARD_MINUTES + OVERTIME_THRESHOLD; // 720 min = 12 h

export interface OffDayBalance {
  earned:        number;
  used:          number;
  available:     number;
  overtimeDays:  number;   // weekdays with ≥12h
  weekendDays:   number;   // weekend days with any work
}

export interface OffDayResult {
  success: boolean;
  recommendationsGenerated: number;
  topDates: string[];
  balance: OffDayBalance;
  error?: string;
}

// ── Entitlement calculation ───────────────────────────────────────────────────

/**
 * Calculate how many off-days a user has earned and how many are still available.
 */
export async function calculateOffDayBalance(userId: string): Promise<OffDayBalance> {
  // Weekdays with ≥ 12h work (ISODOW 1=Mon … 5=Fri)
  const overtimeResult = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM daily_workload
     WHERE user_id = $1
       AND EXTRACT(ISODOW FROM date) BETWEEN 1 AND 5
       AND work_minutes >= $2`,
    [userId, ENTITLEMENT_TRIGGER]
  );
  const overtimeDays = Number(overtimeResult?.count ?? 0);

  // Weekend days with any work (ISODOW 6=Sat, 7=Sun)
  const weekendResult = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM daily_workload
     WHERE user_id = $1
       AND EXTRACT(ISODOW FROM date) IN (6, 7)
       AND work_minutes > 0`,
    [userId]
  );
  const weekendDays = Number(weekendResult?.count ?? 0);

  const earned = overtimeDays + weekendDays;

  // Count accepted recommendations (= off-days already used)
  const usedResult = await db.queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM offday_recommendations
     WHERE user_id = $1 AND status = 'accepted'`,
    [userId]
  );
  const used = Number(usedResult?.count ?? 0);

  const available = Math.max(0, earned - used);

  return { earned, used, available, overtimeDays, weekendDays };
}

interface DayAnalysis {
  date: string;
  daysInFuture: number;
  totalMinutes: number;
  workMinutes: number;
  meetingCount: number;
  deadlineCount: number;
  hasEvents: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** ISO date string for a date offset by N days from today */
function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0] as string;
}

/** Check if a date string falls on a weekend (Sat/Sun) */
function isWeekend(dateStr: string): boolean {
  const dow = new Date(dateStr).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Build a human-readable reason string for the recommendation.
 */
function buildReason(day: DayAnalysis, score: number): string {
  const parts: string[] = [];

  if (!day.hasEvents) {
    parts.push('No events scheduled');
  } else {
    if (day.workMinutes === 0) {
      parts.push('No work events scheduled');
    } else if (day.workMinutes <= 60) {
      parts.push('Very light workload (<1h)');
    } else if (day.workMinutes <= 180) {
      parts.push('Light workload');
    }
    if (day.meetingCount === 0) {
      parts.push('no meetings');
    } else if (day.meetingCount === 1) {
      parts.push('only 1 meeting');
    }
    if (day.deadlineCount === 0) {
      parts.push('no nearby deadlines');
    }
  }

  if (score >= 80) parts.push('Excellent day for time off');
  else if (score >= 60) parts.push('Good day for time off');

  return parts.length > 0
    ? parts.join(', ').replace(/^./, (c) => c.toUpperCase())
    : `Priority score: ${score}`;
}

// ── scoring ───────────────────────────────────────────────────────────────────

function scoreDay(day: DayAnalysis): number {
  // Workload score: 0 = no work, 100 = 10h+ of work
  const workloadScore = Math.min(100, (day.workMinutes / 600) * 100);

  // Deadline score: each nearby deadline reduces score by 20 pts
  const deadlinePenalty = Math.min(100, day.deadlineCount * 20);

  // Meeting score: each meeting reduces score by 10 pts
  const meetingPenalty = Math.min(100, day.meetingCount * 10);

  // Recency score: days further in the future are slightly less useful
  const recencyPenalty = (day.daysInFuture / 30) * 20;

  const score =
    (100 - workloadScore)   * 0.40 +
    (100 - deadlinePenalty) * 0.30 +
    (100 - meetingPenalty)  * 0.20 +
    (100 - recencyPenalty)  * 0.10;

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ── main service ──────────────────────────────────────────────────────────────

/**
 * Generate off-day recommendations for a user.
 * Clears existing pending recommendations, analyses the next 30 days,
 * and stores the top 10 results.
 */
export async function generateRecommendations(userId: string): Promise<OffDayResult> {
  try {
    logger.info('Generating off-day recommendations', { userId });

    // Calculate entitlement balance first
    const balance = await calculateOffDayBalance(userId);

    if (balance.available === 0) {
      logger.info('No off-days available — skipping generation', { userId, balance });
      // Clear any stale pending recommendations
      await db.query(
        `DELETE FROM offday_recommendations WHERE user_id = $1 AND status = 'pending'`,
        [userId]
      );
      return {
        success: true,
        recommendationsGenerated: 0,
        topDates: [],
        balance,
      };
    }

    // Clear existing pending recommendations for this user
    await db.query(
      `DELETE FROM offday_recommendations WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    // Build list of upcoming working days (next 30 calendar days, Mon–Fri only)
    const workingDays: string[] = [];
    for (let i = 1; i <= 30; i++) {
      const date = dateOffset(i);
      if (!isWeekend(date)) workingDays.push(date);
    }

    if (workingDays.length === 0) {
      return { success: true, recommendationsGenerated: 0, topDates: [], balance };
    }

    const startDate = workingDays[0];
    const endDate   = workingDays[workingDays.length - 1];

    // ── Fetch existing workload data for the date range ──────────────────────
    const dailyRows = await db.queryMany<{
      date: string;
      work_minutes: number;
      meeting_count: number;
    }>(
      `SELECT date::text, work_minutes, meeting_count
       FROM daily_workload
       WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [userId, startDate, endDate]
    );

    const workloadByDate = new Map<string, { work_minutes: number; meeting_count: number }>();
    for (const row of dailyRows) {
      workloadByDate.set(row.date, row);
    }

    // ── Fetch deadline/milestone events in the range ─────────────────────────
    // Uses a ±3 day window around each working day
    const deadlineEvents = await db.queryMany<{ start_date: string; count: number }>(
      `SELECT DATE(ce.start_time)::text AS start_date, COUNT(*) AS count
       FROM calendar_events ce
       JOIN event_classifications ec ON ec.event_id = ce.id
       WHERE ce.user_id = $1
         AND ec.task_type_id IN (1, 3)        -- Deadline, Project Milestone
         AND ce.is_cancelled = false
         AND ce.start_time >= $2::date - INTERVAL '3 days'
         AND ce.start_time <= $3::date + INTERVAL '3 days'
       GROUP BY DATE(ce.start_time)`,
      [userId, startDate, endDate]
    );

    // Build deadline influence map — each deadline day affects ±3 surrounding days
    const deadlineInfluence = new Map<string, number>();
    for (const row of deadlineEvents) {
      for (let offset = -3; offset <= 3; offset++) {
        const d = new Date(row.start_date);
        d.setUTCDate(d.getUTCDate() + offset);
        const key = d.toISOString().split('T')[0] as string;
        deadlineInfluence.set(key, (deadlineInfluence.get(key) ?? 0) + Number(row.count));
      }
    }

    // ── Score each working day ───────────────────────────────────────────────
    const scored: Array<{ day: DayAnalysis; score: number }> = [];

    for (let i = 0; i < workingDays.length; i++) {
      const date = workingDays[i]!;
      const wl   = workloadByDate.get(date);

      const day: DayAnalysis = {
        date,
        daysInFuture:  i + 1,
        totalMinutes:  wl ? wl.work_minutes : 0,
        workMinutes:   wl ? wl.work_minutes : 0,
        meetingCount:  wl ? wl.meeting_count : 0,
        deadlineCount: deadlineInfluence.get(date) ?? 0,
        hasEvents:     !!wl && wl.work_minutes > 0,
      };

      scored.push({ day, score: scoreDay(day) });
    }

    // Sort descending by score — cap to available off-day balance (max 10)
    scored.sort((a, b) => b.score - a.score);
    const limit = Math.min(balance.available, 10);
    const top10 = scored.slice(0, limit);

    // ── Persist recommendations ──────────────────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // expire in 7 days

    for (const { day, score } of top10) {
      await db.query(
        `INSERT INTO offday_recommendations (
           user_id, recommended_date, priority_score,
           workload_score, deadline_count, meeting_count,
           days_in_future, reason, metrics, status,
           generated_at, expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NOW(),$10)`,
        [
          userId,
          day.date,
          score,
          Math.round((day.workMinutes / 600) * 100),
          day.deadlineCount,
          day.meetingCount,
          day.daysInFuture,
          buildReason(day, score),
          JSON.stringify({
            work_minutes:  day.workMinutes,
            meeting_count: day.meetingCount,
            deadline_count: day.deadlineCount,
            days_in_future: day.daysInFuture,
          }),
          expiresAt.toISOString(),
        ]
      );
    }

    const topDates = top10.map(({ day }) => day.date);
    logger.info('Off-day recommendations generated', { userId, count: top10.length, topDates, balance });

    return {
      success: true,
      recommendationsGenerated: top10.length,
      topDates,
      balance,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Off-day recommendation generation failed', { userId, error });
    return { success: false, recommendationsGenerated: 0, topDates: [], error, balance: { earned: 0, used: 0, available: 0, overtimeDays: 0, weekendDays: 0 } };
  }
}

/**
 * Get pending (unresponded) recommendations for a user.
 */
export async function getPendingRecommendations(userId: string) {
  return db.queryMany(
    `SELECT * FROM offday_recommendations
     WHERE user_id = $1 AND status = 'pending'
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY priority_score DESC`,
    [userId]
  );
}

/**
 * Get all recommendations for a user (any status).
 */
export async function getAllRecommendations(userId: string) {
  return db.queryMany(
    `SELECT * FROM offday_recommendations
     WHERE user_id = $1
     ORDER BY generated_at DESC, priority_score DESC
     LIMIT 30`,
    [userId]
  );
}

/**
 * Update the status of a recommendation (accepted / rejected).
 */
export async function respondToRecommendation(
  userId: string,
  recommendationId: string,
  response: 'accepted' | 'rejected'
): Promise<boolean> {
  const result = await db.query(
    `UPDATE offday_recommendations
     SET status = $1, user_response_at = NOW()
     WHERE id = $2 AND user_id = $3 AND status = 'pending'`,
    [response, recommendationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get all recommendations for all users (admin view).
 */
export async function getAllUsersRecommendations() {
  return db.queryMany(
    `SELECT r.*, u.display_name AS user_name, u.email AS user_email,
            (u.email LIKE '%@smartcol-test.com') AS is_test_user
     FROM offday_recommendations r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
       AND (r.expires_at IS NULL OR r.expires_at > NOW())
     ORDER BY r.priority_score DESC, r.recommended_date ASC
     LIMIT 50`
  );
}
