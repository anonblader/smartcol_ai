/**
 * Export Controller
 *
 * GET /api/analytics/export?format=csv   — downloads a CSV of daily/weekly/breakdown data
 * GET /api/analytics/export?format=pdf   — downloads a PDF analytics report
 */

import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import { db } from '../services/database.client';
import { logger } from '../config/monitoring.config';

function resolveUserId(req: Request): string | null {
  const sessionUserId = req.session.user_id;
  if (!sessionUserId) return null;
  return (req.query.userId as string) || sessionUserId;
}

function toHrs(minutes: unknown): string {
  return (Number(minutes) / 60).toFixed(1);
}

export async function exportAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const userId = resolveUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', message: 'No active session' });
      return;
    }

    const format = ((req.query.format as string) || 'csv').toLowerCase();
    const today  = new Date().toISOString().split('T')[0];

    // ── Fetch data ────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    // CSV
    // ─────────────────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const lines: string[] = [
        'SmartCol AI — Workload Analytics Export',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'DAILY WORKLOAD (Last 30 Days)',
        'Date,Total (hrs),Work (hrs),Meetings (hrs),Focus (hrs),Overtime (hrs),Status',
        ...daily.map((r: any) =>
          [
            r.date,
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.meeting_minutes),
            toHrs(r.focus_minutes),
            toHrs(r.overtime_minutes),
            r.has_high_workload ? 'High Load' : 'Normal',
          ].join(','),
        ),
        '',
        'WEEKLY SUMMARY (Last 8 Weeks)',
        'Week Start,Total (hrs),Work (hrs),Overtime (hrs),Events,Meetings',
        ...weekly.map((r: any) =>
          [
            String(r.week_start_date ?? '').split('T')[0] ?? '',
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
      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('SmartCol AI — Workload Analytics', { align: 'center' });
      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // ── Helper: section header ──
      const sectionHeader = (title: string) => {
        doc.fontSize(13).font('Helvetica-Bold').text(title);
        doc.moveDown(0.4);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke();
        doc.moveDown(0.5);
      };

      // ── Helper: simple row ──
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

      // ── Weekly summary ──
      sectionHeader('Weekly Summary (Last 8 Weeks)');
      const wCols  = [110, 70, 70, 70, 55, 65];
      row(['Week Start', 'Total hrs', 'Work hrs', 'Overtime', 'Events', 'Meetings'], wCols, true);
      for (const r of weekly as any[]) {
        row(
          [
            String(r.week_start_date ?? '').split('T')[0] ?? '',
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.overtime_minutes),
            String(r.total_events ?? 0),
            String(r.meeting_count ?? 0),
          ],
          wCols,
        );
      }
      doc.moveDown(1.5);

      // ── Daily workload ──
      sectionHeader('Daily Workload (Last 30 Days)');
      const dCols = [90, 65, 65, 70, 65, 70, 70];
      row(['Date', 'Total hrs', 'Work hrs', 'Meetings', 'Focus', 'Overtime', 'Status'], dCols, true);
      for (const r of daily as any[]) {
        row(
          [
            String(r.date ?? '').split('T')[0] ?? '',
            toHrs(r.total_minutes),
            toHrs(r.work_minutes),
            toHrs(r.meeting_minutes),
            toHrs(r.focus_minutes),
            toHrs(r.overtime_minutes),
            r.has_high_workload ? 'High Load' : 'Normal',
          ],
          dCols,
        );
      }
      doc.moveDown(1.5);

      // ── Time breakdown ──
      sectionHeader('Time Breakdown by Task Type');
      const bCols = [220, 100, 100];
      row(['Task Type', 'Total hrs', 'Event Count'], bCols, true);
      for (const r of breakdown as any[]) {
        row([String(r.task_type_name), toHrs(r.total_minutes), String(r.event_count)], bCols);
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
