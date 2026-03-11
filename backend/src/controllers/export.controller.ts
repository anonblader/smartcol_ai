/**
 * Export Controller
 *
 * GET /api/analytics/export?format=csv   — downloads a CSV of daily/weekly/breakdown data
 * GET /api/analytics/export?format=pdf   — downloads a PDF analytics report
 *
 * When the session user is an admin, both formats include an additional
 * "Team Workload Overview" section with the top 5 heaviest-loaded engineers,
 * their accumulated off-day balances, and manager recommendations.
 */

import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { db } from '../services/database.client';
import { config } from '../config/env';
import { logger } from '../config/monitoring.config';

function resolveUserId(req: Request): string | null {
  const sessionUserId = req.session.user_id;
  if (!sessionUserId) return null;
  return (req.query.userId as string) || sessionUserId;
}

function toHrs(minutes: unknown): string {
  return (Number(minutes) / 60).toFixed(1);
}

/** Strips time and timezone from any date value PostgreSQL may return. */
function fmtDate(value: unknown): string {
  if (!value) return '';
  // Handles: Date objects, ISO strings (2026-03-01T00:00:00.000Z), PG strings (2026-03-01 00:00:00+00)
  const s = value instanceof Date ? value.toISOString() : String(value);
  return s.slice(0, 10); // always yields YYYY-MM-DD
}

/** Returns true if the session user is an admin. */
async function isAdmin(req: Request): Promise<boolean> {
  const userId = req.session.user_id;
  if (!userId) return false;
  const user = await db.queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
  return !!user && config.admin.emails.includes(user.email.toLowerCase());
}

// ── Manager recommendation engine ─────────────────────────────────────────────

interface TeamMember {
  id:                    string;
  display_name:          string;
  email:                 string;
  avg_daily_minutes:     number;
  total_overtime_minutes: number;
  high_load_days:        number;
  total_days:            number;
  // off-day balance
  earned:    number;
  used:      number;
  available: number;
  // risks & burnout
  active_risks:   string[];
  burnout_score:  number | null;
  burnout_level:  string | null;
}

function buildRecommendations(m: TeamMember): string[] {
  const recs: string[] = [];
  const avgDailyHrs = m.avg_daily_minutes / 60;
  const highLoadPct = m.total_days > 0 ? (m.high_load_days / m.total_days) * 100 : 0;

  // Burnout — highest priority
  if (m.burnout_score !== null && m.burnout_score >= 85) {
    recs.push(`URGENT: Burnout score is ${m.burnout_score}/100 (${m.burnout_level}). Immediate workload reduction and 1:1 check-in required.`);
  } else if (m.burnout_score !== null && m.burnout_score >= 70) {
    recs.push(`Burnout score is ${m.burnout_score}/100 (${m.burnout_level}). Schedule a welfare check-in and review upcoming sprint load.`);
  }

  // Average daily hours
  if (avgDailyHrs >= 11) {
    recs.push(`Averaging ${avgDailyHrs.toFixed(1)} hrs/day — redistribute tasks or reduce sprint scope to bring load below 9 hrs.`);
  } else if (avgDailyHrs >= 9.5) {
    recs.push(`Averaging ${avgDailyHrs.toFixed(1)} hrs/day — monitor closely and avoid adding new deliverables this sprint.`);
  }

  // High-load day frequency
  if (highLoadPct >= 60) {
    recs.push(`${Math.round(highLoadPct)}% of working days flagged as high load. Consider splitting responsibilities with another team member.`);
  }

  // Off-day entitlement
  if (m.available > 0) {
    recs.push(`Has ${m.available} earned off-day${m.available > 1 ? 's' : ''} available (${m.earned} earned, ${m.used} used). Approve time off to aid recovery.`);
  }

  // Active risks
  if (m.active_risks.includes('Meeting Overload')) {
    recs.push('Meeting Overload detected — audit recurring meetings and cancel or delegate non-essential ones.');
  }
  if (m.active_risks.includes('Low Focus Time')) {
    recs.push('Low Focus Time — block dedicated focus blocks on their calendar and decline non-critical meeting invites.');
  }
  if (m.active_risks.includes('Overlapping Deadlines')) {
    recs.push('Overlapping Deadlines — stagger delivery dates or negotiate extensions with stakeholders.');
  }
  if (m.active_risks.includes('Excessive Troubleshooting')) {
    recs.push('High ad-hoc troubleshooting load — assign a dedicated on-call rotation to distribute incident work.');
  }

  if (recs.length === 0) {
    recs.push('Workload is within acceptable range. Continue monitoring.');
  }

  return recs;
}

// ── Fetch top-5 team data ──────────────────────────────────────────────────────

async function fetchTop5Team(): Promise<TeamMember[]> {
  // Top 5 real users by avg daily workload (last 30 days)
  const top5 = await db.queryMany<{
    id: string; display_name: string; email: string;
    avg_daily_minutes: string; total_overtime_minutes: string;
    high_load_days: string; total_days: string;
  }>(
    `SELECT u.id, u.display_name, u.email,
            AVG(dw.total_minutes)     AS avg_daily_minutes,
            SUM(dw.overtime_minutes)  AS total_overtime_minutes,
            COUNT(CASE WHEN dw.has_high_workload THEN 1 END) AS high_load_days,
            COUNT(dw.date)            AS total_days
     FROM daily_workload dw
     JOIN users u ON u.id = dw.user_id
     WHERE dw.date >= CURRENT_DATE - INTERVAL '30 days'
       AND u.email NOT LIKE '%@smartcol-test.com'
     GROUP BY u.id, u.display_name, u.email
     HAVING COUNT(dw.date) > 0
     ORDER BY avg_daily_minutes DESC
     LIMIT 5`,
    [],
  );

  if (top5.length === 0) return [];

  // Fetch off-day balance + active risks + burnout for each user in parallel
  const members = await Promise.all(
    top5.map(async (u) => {
      const [balanceRow, activeRisks, burnoutRow] = await Promise.all([
        // Off-day balance
        db.queryOne<{ overtime_days: string; weekend_days: string; used: string }>(
          `SELECT
             COUNT(CASE WHEN EXTRACT(ISODOW FROM date) BETWEEN 1 AND 5
                          AND work_minutes >= 720 THEN 1 END) AS overtime_days,
             COUNT(CASE WHEN EXTRACT(ISODOW FROM date) IN (6,7)
                          AND work_minutes > 0 THEN 1 END) AS weekend_days,
             (SELECT COUNT(*) FROM offday_recommendations
              WHERE user_id = $1 AND status = 'accepted') AS used
           FROM daily_workload
           WHERE user_id = $1`,
          [u.id],
        ),
        // Active risk types
        db.queryMany<{ risk_type_name: string }>(
          `SELECT rt.name AS risk_type_name
           FROM risk_alerts ra
           JOIN risk_types rt ON rt.id = ra.risk_type_id
           WHERE ra.user_id = $1 AND ra.status IN ('active', 'acknowledged')`,
          [u.id],
        ),
        // Latest burnout score
        db.queryOne<{ score: string; level: string }>(
          `SELECT score, level FROM burnout_scores
           WHERE user_id = $1
           ORDER BY score_date DESC LIMIT 1`,
          [u.id],
        ),
      ]);

      const overtimeDays = Number(balanceRow?.overtime_days ?? 0);
      const weekendDays  = Number(balanceRow?.weekend_days  ?? 0);
      const earned       = overtimeDays + weekendDays;
      const used         = Number(balanceRow?.used          ?? 0);

      return {
        id:                     u.id,
        display_name:           u.display_name,
        email:                  u.email,
        avg_daily_minutes:      Number(u.avg_daily_minutes),
        total_overtime_minutes: Number(u.total_overtime_minutes),
        high_load_days:         Number(u.high_load_days),
        total_days:             Number(u.total_days),
        earned,
        used,
        available: Math.max(0, earned - used),
        active_risks:   activeRisks.map((r) => r.risk_type_name),
        burnout_score:  burnoutRow ? Number(burnoutRow.score) : null,
        burnout_level:  burnoutRow?.level ?? null,
      } as TeamMember;
    }),
  );

  return members;
}

// ── Main export handler ────────────────────────────────────────────────────────

export async function exportAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const format   = ((req.query.format as string) || 'csv').toLowerCase();
    const now      = new Date();
    const today    = now.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const adminView = await isAdmin(req);

    // ── Resolve viewed user's display name ───────────────────────────────────
    const userInfo = await db.queryOne<{ display_name: string }>(
      'SELECT display_name FROM users WHERE id = $1',
      [userId],
    );
    const viewedName = userInfo?.display_name ?? 'Unknown';

    // ── Fetch personal analytics ──────────────────────────────────────────────
    const [daily, weekly, breakdown] = await Promise.all([
      db.queryMany(
        `SELECT date, total_minutes, work_minutes, meeting_minutes, focus_minutes,
                overtime_minutes, has_high_workload
         FROM daily_workload
         WHERE user_id = $1
         ORDER BY date DESC LIMIT 30`,
        [userId],
      ),
      db.queryMany(
        `SELECT week_start_date, total_minutes, work_minutes, overtime_minutes,
                total_events, meeting_count
         FROM weekly_workload
         WHERE user_id = $1
         ORDER BY week_start_date DESC LIMIT 8`,
        [userId],
      ),
      db.queryMany(
        `SELECT tt.name AS task_type_name,
                SUM(ce.duration_minutes) AS total_minutes,
                COUNT(ce.id)             AS event_count
         FROM calendar_events ce
         JOIN event_classifications ec ON ec.event_id = ce.id
         JOIN task_types tt ON tt.id = ec.task_type_id
         WHERE ce.user_id = $1
           AND ce.is_cancelled = false
           AND ce.is_all_day   = false
         GROUP BY tt.name
         ORDER BY total_minutes DESC`,
        [userId],
      ),
    ]);

    // ── Fetch team data for admins ────────────────────────────────────────────
    const teamMembers = adminView ? await fetchTop5Team() : [];

    // ─────────────────────────────────────────────────────────────────────────
    // CSV
    // ─────────────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const lines: string[] = [
        'SmartCol AI — Workload Analytics Export',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        `DAILY WORKLOAD — Individual: ${viewedName} (Last 30 Days)`,
        'User,View,Date,Total (hrs),Work (hrs),Meetings (hrs),Focus (hrs),Overtime (hrs),Status',
        ...daily.map((r: any) =>
          [
            `"${viewedName}"`,
            'Individual',
            fmtDate(r.date),
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.meeting_minutes),
            toHrs(r.focus_minutes),
            toHrs(r.overtime_minutes),
            r.has_high_workload ? 'High Load' : 'Normal',
          ].join(','),
        ),
        '',
        `WEEKLY SUMMARY — Individual: ${viewedName} (Last 8 Weeks)`,
        'User,View,Week Start,Total (hrs),Work (hrs),Overtime (hrs),Events,Meetings',
        ...weekly.map((r: any) =>
          [
            `"${viewedName}"`,
            'Individual',
            fmtDate(r.week_start_date),
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.overtime_minutes),
            r.total_events ?? 0,
            r.meeting_count ?? 0,
          ].join(','),
        ),
        '',
        'TIME BREAKDOWN BY TASK TYPE',
        'Task Type,Total (hrs),Event Count',
        ...breakdown.map((r: any) =>
          [`"${r.task_type_name}"`, toHrs(r.total_minutes), r.event_count].join(','),
        ),
      ];

      // Admin: append team overview section
      if (adminView && teamMembers.length > 0) {
        lines.push('', '', 'TEAM WORKLOAD OVERVIEW — TOP 5 HEAVIEST LOADED ENGINEERS (Last 30 Days)');
        lines.push('Name,Email,Avg Daily (hrs),High Load Days,Overtime (hrs),Off-Days Earned,Off-Days Used,Off-Days Available,Active Risks,Burnout Score');
        for (const m of teamMembers) {
          lines.push([
            `"${m.display_name}"`,
            m.email,
            toHrs(m.avg_daily_minutes),
            m.high_load_days,
            toHrs(m.total_overtime_minutes),
            m.earned,
            m.used,
            m.available,
            `"${m.active_risks.join('; ')}"`,
            m.burnout_score !== null ? m.burnout_score : 'N/A',
          ].join(','));
        }
        lines.push('', 'MANAGER RECOMMENDATIONS');
        lines.push('Name,Recommendation');
        for (const m of teamMembers) {
          const recs = buildRecommendations(m);
          for (const rec of recs) {
            lines.push([`"${m.display_name}"`, `"${rec}"`].join(','));
          }
        }
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="smartcol-analytics-${today}.csv"`);
      res.send(lines.join('\n'));
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PDF
    // ─────────────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="smartcol-analytics-${today}.pdf"`);

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      doc.pipe(res);

      // ── Title ──
      doc.fontSize(20).font('Helvetica-Bold').text('SmartCol AI — Workload Analytics', { align: 'center' });
      doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // ── Helpers ──
      const sectionHeader = (title: string) => {
        // Always pin to x=50 — row() leaves the cursor at the last column's x
        doc.fontSize(13).font('Helvetica-Bold').text(title, 50, doc.y);
        doc.moveDown(0.4);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.5);
      };

      const row = (cols: string[], widths: number[], bold = false) => {
        const y = doc.y;
        let x   = 50;
        doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica');
        cols.forEach((col, i) => {
          doc.text(col, x, y, { width: widths[i]!, lineBreak: false });
          x += widths[i]!;
        });
        doc.moveDown(0.5);
      };

      const ensureSpace = (needed = 60) => {
        if (doc.y > 750 - needed) doc.addPage();
      };

      // ── Weekly summary ──
      sectionHeader('Weekly Summary (Last 8 Weeks)');
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text(`Individual — ${viewedName}`, 50, doc.y);
      doc.fillColor('#000000').moveDown(0.5);
      const wCols = [115, 60, 65, 65, 60, 55, 55];
      row(['User', 'View', 'Week Start', 'Total hrs', 'Work hrs', 'Overtime', 'Meetings'], wCols, true);
      for (const r of weekly as any[]) {
        ensureSpace();
        row(
          [
            viewedName,
            'Individual',
            fmtDate(r.week_start_date),
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.overtime_minutes),
            String(r.meeting_count ?? 0),
          ],
          wCols,
        );
      }
      doc.moveDown(1.5);

      // ── Daily workload ──
      ensureSpace(80);
      sectionHeader('Daily Workload (Last 30 Days)');
      doc.fontSize(9).font('Helvetica').fillColor('#64748b')
        .text(`Individual — ${viewedName}`, 50, doc.y);
      doc.fillColor('#000000').moveDown(0.5);
      const dCols = [100, 60, 60, 55, 60, 55, 60, 55];
      row(['User', 'View', 'Date', 'Total hrs', 'Work hrs', 'Meetings', 'Focus', 'Overtime'], dCols, true);
      for (const r of daily as any[]) {
        ensureSpace();
        row(
          [
            viewedName,
            'Individual',
            fmtDate(r.date),
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.meeting_minutes),
            toHrs(r.focus_minutes),
            toHrs(r.overtime_minutes),
          ],
          dCols,
        );
      }
      doc.moveDown(1.5);

      // ── Time breakdown ──
      ensureSpace(80);
      sectionHeader('Time Breakdown by Task Type');
      const bCols = [220, 100, 100];
      row(['Task Type', 'Total hrs', 'Event Count'], bCols, true);
      for (const r of breakdown as any[]) {
        ensureSpace();
        row([String(r.task_type_name), toHrs(r.total_minutes), String(r.event_count)], bCols);
      }

      // ── Team Workload Overview (admin only) ──────────────────────────────────
      if (adminView && teamMembers.length > 0) {
        doc.addPage();

        doc.fontSize(16).font('Helvetica-Bold').text('Team Workload Overview', { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#64748b')
          .text('Top 5 heaviest-loaded engineers — last 30 days', { align: 'center' });
        doc.fillColor('#000000').moveDown(1.5);

        for (const m of teamMembers) {
          ensureSpace(120);

          // ── Member header ──
          doc.fontSize(11).font('Helvetica-Bold').text(m.display_name, 50, doc.y, { continued: true });
          doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(`  ${m.email}`);
          doc.fillColor('#000000');
          doc.moveDown(0.4);

          // ── Stats row ──
          const statCols  = [100, 90, 95, 95, 80, 80];
          row(['Avg Daily', 'High-Load Days', 'Overtime Total', 'Off-Days Avail.', 'Active Risks', 'Burnout'], statCols, true);
          row(
            [
              `${toHrs(m.avg_daily_minutes)} hrs`,
              `${m.high_load_days} / ${m.total_days} days`,
              `${toHrs(m.total_overtime_minutes)} hrs`,
              `${m.available} (${m.earned} earned)`,
              m.active_risks.length > 0 ? String(m.active_risks.length) : 'None',
              m.burnout_score !== null ? `${m.burnout_score} — ${m.burnout_level}` : 'N/A',
            ],
            statCols,
          );

          // Active risks list (compact)
          if (m.active_risks.length > 0) {
            doc.fontSize(8).font('Helvetica').fillColor('#dc2626')
              .text(`Active alerts: ${m.active_risks.join(', ')}`, 50, doc.y);
            doc.fillColor('#000000');
            doc.moveDown(0.4);
          }

          // ── Recommendations ──
          doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e40af').text('Manager Recommendations:', 50, doc.y);
          doc.fillColor('#000000');
          doc.moveDown(0.3);

          const recs = buildRecommendations(m);
          for (const rec of recs) {
            ensureSpace(20);
            doc.fontSize(8.5).font('Helvetica').text(`• ${rec}`, 60, doc.y, { width: 480 });
            doc.moveDown(0.3);
          }

          // Divider between members
          doc.moveDown(0.5);
          doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.3).dash(3, { space: 3 }).stroke();
          doc.undash().moveDown(0.8);
        }

        // Footer note
        ensureSpace(40);
        doc.fontSize(8).font('Helvetica').fillColor('#64748b')
          .text(
            'Note: Recommendations are generated automatically based on workload metrics, risk detection, and ML burnout scoring. ' +
            'They are intended as starting points for managerial discussion, not prescriptive directives.',
            50, doc.y, { width: 495 },
          );
        doc.fillColor('#000000');
      }

      doc.end();
      return;
    }

    res.status(400).json({ error: 'BadRequest', message: 'Use ?format=csv or ?format=pdf' });
  } catch (error) {
    logger.error('Export analytics failed', { error });
    res.status(500).json({ error: 'InternalServerError', message: 'Export failed' });
  }
}
