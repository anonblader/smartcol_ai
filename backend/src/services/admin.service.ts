/**
 * Admin Service
 *
 * Provides team-wide workload and risk data for admin users.
 */

import { db } from './database.client';

export async function getTeamOverview() {
  return db.queryMany(
    `SELECT
       u.id,
       u.email,
       u.display_name,
       (u.email LIKE '%@smartcol-test.com') AS is_test_user,
       COUNT(DISTINCT ce.id)                    AS total_events,
       COALESCE(SUM(dw.work_minutes), 0)        AS total_work_minutes,
       COALESCE(MAX(dw.work_minutes), 0)        AS peak_daily_minutes,
       COALESCE(SUM(dw.overtime_minutes), 0)    AS total_overtime_minutes,
       COALESCE(SUM(dw.meeting_minutes), 0)     AS total_meeting_minutes,
       COALESCE(SUM(dw.focus_minutes), 0)       AS total_focus_minutes,
       COUNT(DISTINCT ra.id) FILTER (WHERE ra.status = 'active')       AS active_risks,
       COUNT(DISTINCT ra.id) FILTER (WHERE ra.status = 'acknowledged') AS ongoing_risks
     FROM users u
     LEFT JOIN calendar_events ce  ON ce.user_id = u.id AND ce.is_cancelled = false
     LEFT JOIN daily_workload dw   ON dw.user_id = u.id
     LEFT JOIN risk_alerts ra      ON ra.user_id = u.id
     GROUP BY u.id, u.email, u.display_name
     ORDER BY (u.email LIKE '%@smartcol-test.com') ASC, total_work_minutes DESC`
  );
}

export async function getTeamRisks() {
  return db.queryMany(
    `SELECT
       ra.*,
       rt.name  AS risk_type_name,
       u.email  AS user_email,
       u.display_name AS user_name,
       (u.email LIKE '%@smartcol-test.com') AS is_test_user
     FROM risk_alerts ra
     JOIN risk_types rt ON rt.id = ra.risk_type_id
     JOIN users u       ON u.id  = ra.user_id
     ORDER BY
       CASE ra.status WHEN 'active' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
       ra.score DESC,
       ra.detected_date DESC`
  );
}

export async function getTeamRisksByStatus(status?: string) {
  const where = status ? `AND ra.status = '${status}'` : '';
  return db.queryMany(
    `SELECT
       ra.*,
       rt.name  AS risk_type_name,
       u.email  AS user_email,
       u.display_name AS user_name,
       (u.email LIKE '%@smartcol-test.com') AS is_test_user
     FROM risk_alerts ra
     JOIN risk_types rt ON rt.id = ra.risk_type_id
     JOIN users u       ON u.id  = ra.user_id
     WHERE 1=1 ${where}
     ORDER BY ra.score DESC, ra.detected_date DESC`
  );
}
