/**
 * Test Seed Service
 *
 * Creates 4 test users with different workload profiles for multi-user validation.
 * Bypasses OAuth — inserts data directly and runs the full pipeline per user.
 *
 * Profiles:
 *   1. Alex Rivera  — Balanced       (~7h/day)        → No risks
 *   2. Jamie Lim    — Underloaded    (~2h/day)         → Low Focus Time
 *   3. Morgan Cruz  — Overloaded     (~11h/day)        → High Daily Workload, Meeting Overload,
 *                                                         Overlapping Deadlines, Excessive Troubleshooting,
 *                                                         Low Focus Time, Burnout Risk
 *   4. Taylor Wong  — Meeting-heavy  (~8h/day, 6h mtg) → Meeting Overload, Low Focus Time
 */

import { db } from './database.client';
import { computeWorkload } from './analytics.service';
import { detectRisks } from './risks.service';
import { logger } from '../config/monitoring.config';

// ── types ─────────────────────────────────────────────────────────────────────

interface EventTemplate {
  subject: string;
  dayOfWeek: number;   // 0=Mon … 4=Fri
  startHour: number;
  startMin: number;
  durationMin: number;
  taskTypeId: number;
  isAllDay?: boolean;
}

interface UserProfile {
  email: string;
  displayName: string;
  timezone: string;
  weeklyEvents: EventTemplate[];           // repeated every week
  extraEvents?: (EventTemplate & { weekOffset: number })[]; // one-off events
}

export interface SeedResult {
  success: boolean;
  users: Array<{
    userId: string;
    email: string;
    displayName: string;
    eventsCreated: number;
    risks: string[];
  }>;
  error?: string;
}

// ── date helpers ──────────────────────────────────────────────────────────────

/**
 * Return a Date for the Monday of the week that contains "today", offset by weekOffset weeks.
 * weekOffset=0 → current week, -1 → last week, -2 → two weeks ago.
 */
function weekMonday(weekOffset = 0): Date {
  const today = new Date();
  const dow = today.getUTCDay() || 7;          // 1=Mon … 7=Sun
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - dow + 1 + weekOffset * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function eventDate(weekOffset: number, dayOfWeek: number, hour: number, minute: number): Date {
  const base = weekMonday(weekOffset);
  base.setUTCDate(base.getUTCDate() + dayOfWeek);
  base.setUTCHours(hour, minute, 0, 0);
  return base;
}

// ── profiles ──────────────────────────────────────────────────────────────────

// Task type IDs:
//  1=Deadline  2=Ad-hoc Troubleshooting  3=Project Milestone  4=Routine Meeting
//  5=1:1       6=Admin/Operational       7=Training/Learning  8=Focus Time
//  9=Break     10=Out of Office

const BALANCED: EventTemplate[] = [
  // Monday
  { subject: 'Daily Standup',          dayOfWeek: 0, startHour: 9,  startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Focus Time — Planning',  dayOfWeek: 0, startHour: 10, startMin: 0,  durationMin: 120, taskTypeId: 8 },
  { subject: 'Project Sync',           dayOfWeek: 0, startHour: 14, startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  // Tuesday
  { subject: 'Daily Standup',          dayOfWeek: 1, startHour: 9,  startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: '1:1 with Manager',       dayOfWeek: 1, startHour: 10, startMin: 0,  durationMin: 30,  taskTypeId: 5 },
  { subject: 'Training Session',       dayOfWeek: 1, startHour: 11, startMin: 0,  durationMin: 60,  taskTypeId: 7 },
  { subject: 'Focus Time — Dev Work',  dayOfWeek: 1, startHour: 14, startMin: 0,  durationMin: 90,  taskTypeId: 8 },
  // Wednesday
  { subject: 'Daily Standup',          dayOfWeek: 2, startHour: 9,  startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Sprint Planning',        dayOfWeek: 2, startHour: 10, startMin: 0,  durationMin: 90,  taskTypeId: 4 },
  { subject: 'Focus Time — Dev Work',  dayOfWeek: 2, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 8 },
  // Thursday
  { subject: 'Daily Standup',          dayOfWeek: 3, startHour: 9,  startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Code Review',            dayOfWeek: 3, startHour: 10, startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Focus Time — Dev Work',  dayOfWeek: 3, startHour: 14, startMin: 0,  durationMin: 90,  taskTypeId: 8 },
  // Friday
  { subject: 'Daily Standup',          dayOfWeek: 4, startHour: 9,  startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Team Retrospective',     dayOfWeek: 4, startHour: 10, startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Admin & Planning',       dayOfWeek: 4, startHour: 14, startMin: 0,  durationMin: 60,  taskTypeId: 6 },
];

const UNDERLOADED: EventTemplate[] = [
  // Only a handful of events across the whole week
  { subject: 'Weekly Team Standup',    dayOfWeek: 0, startHour: 10, startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Quick Project Check-in', dayOfWeek: 2, startHour: 14, startMin: 0,  durationMin: 30,  taskTypeId: 4 },
  { subject: 'Admin Tasks',            dayOfWeek: 4, startHour: 10, startMin: 0,  durationMin: 30,  taskTypeId: 6 },
];

const OVERLOADED: EventTemplate[] = [
  // Back-to-back meetings + overtime every day → ~11h/day
  // Monday
  { subject: 'Daily Standup',              dayOfWeek: 0, startHour: 8,  startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Sprint Review',              dayOfWeek: 0, startHour: 9,  startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Client Presentation',        dayOfWeek: 0, startHour: 11, startMin: 0,  durationMin: 90,  taskTypeId: 4 },
  { subject: 'Technical Architecture',     dayOfWeek: 0, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Code Review Session',        dayOfWeek: 0, startHour: 15, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Urgent Bug Fix',             dayOfWeek: 0, startHour: 17, startMin: 0,  durationMin: 240, taskTypeId: 2 },
  // Tuesday
  { subject: 'Daily Standup',              dayOfWeek: 1, startHour: 8,  startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Sprint Planning',            dayOfWeek: 1, startHour: 9,  startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Stakeholder Update',         dayOfWeek: 1, startHour: 11, startMin: 0,  durationMin: 90,  taskTypeId: 4 },
  { subject: 'Infra Review',               dayOfWeek: 1, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'PR Review',                  dayOfWeek: 1, startHour: 15, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Incident Response',          dayOfWeek: 1, startHour: 17, startMin: 0,  durationMin: 240, taskTypeId: 2 },
  // Wednesday
  { subject: 'Daily Standup',              dayOfWeek: 2, startHour: 8,  startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Cross-team Sync',            dayOfWeek: 2, startHour: 9,  startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Client Demo',                dayOfWeek: 2, startHour: 11, startMin: 0,  durationMin: 90,  taskTypeId: 3 },
  { subject: 'DB Migration Review',        dayOfWeek: 2, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Security Audit',             dayOfWeek: 2, startHour: 15, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Production Hotfix',          dayOfWeek: 2, startHour: 17, startMin: 0,  durationMin: 240, taskTypeId: 2 },
  // Thursday
  { subject: 'Daily Standup',              dayOfWeek: 3, startHour: 8,  startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'Release Planning',           dayOfWeek: 3, startHour: 9,  startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'QA Review Meeting',          dayOfWeek: 3, startHour: 11, startMin: 0,  durationMin: 90,  taskTypeId: 4 },
  { subject: 'Performance Review Prep',    dayOfWeek: 3, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 6 },
  { subject: 'API Integration Review',     dayOfWeek: 3, startHour: 15, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Emergency Deployment',       dayOfWeek: 3, startHour: 17, startMin: 0,  durationMin: 240, taskTypeId: 2 },
  // Friday
  { subject: 'Daily Standup',              dayOfWeek: 4, startHour: 8,  startMin: 0,  durationMin: 60,  taskTypeId: 4 },
  { subject: 'End-of-Sprint Review',       dayOfWeek: 4, startHour: 9,  startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'Vendor Call',                dayOfWeek: 4, startHour: 11, startMin: 0,  durationMin: 90,  taskTypeId: 4 },
  { subject: 'Lessons Learned',            dayOfWeek: 4, startHour: 13, startMin: 0,  durationMin: 120, taskTypeId: 4 },
  { subject: 'On-call Support',            dayOfWeek: 4, startHour: 15, startMin: 0,  durationMin: 120, taskTypeId: 2 },
  { subject: 'Late Deployment',            dayOfWeek: 4, startHour: 17, startMin: 0,  durationMin: 240, taskTypeId: 2 },
  // Saturday weekend work → automatic off-day entitlement
  { subject: 'Weekend Emergency Support',  dayOfWeek: 5, startHour: 9,  startMin: 0,  durationMin: 180, taskTypeId: 2 },
];

const MEETING_HEAVY: EventTemplate[] = [
  // 7 meetings/day, no focus time → meeting_count=35, meeting_minutes=1950
  // Each day: 30+60+60+60+60+60+60 = 390 min meetings
  ...[0, 1, 2, 3, 4].flatMap((dow): EventTemplate[] => [
    { subject: 'Daily Standup',       dayOfWeek: dow, startHour: 9,  startMin: 0,  durationMin: 30, taskTypeId: 4 },
    { subject: 'Team Sync',           dayOfWeek: dow, startHour: 9,  startMin: 30, durationMin: 60, taskTypeId: 4 },
    { subject: 'Project Review',      dayOfWeek: dow, startHour: 10, startMin: 30, durationMin: 60, taskTypeId: 4 },
    { subject: 'Client Update',       dayOfWeek: dow, startHour: 11, startMin: 30, durationMin: 60, taskTypeId: 4 },
    { subject: '1:1 with Manager',    dayOfWeek: dow, startHour: 13, startMin: 0,  durationMin: 60, taskTypeId: 5 },
    { subject: 'Sprint Ceremony',     dayOfWeek: dow, startHour: 14, startMin: 0,  durationMin: 60, taskTypeId: 4 },
    { subject: 'Cross-team Meeting',  dayOfWeek: dow, startHour: 15, startMin: 0,  durationMin: 60, taskTypeId: 4 },
  ]),
];

const PROFILES: UserProfile[] = [
  {
    email: 'alex.rivera@smartcol-test.com',
    displayName: 'Alex Rivera',
    timezone: 'Asia/Singapore',
    weeklyEvents: BALANCED,
    // One deadline per week — added per-week in seeding loop
  },
  {
    email: 'jamie.lim@smartcol-test.com',
    displayName: 'Jamie Lim',
    timezone: 'Asia/Singapore',
    weeklyEvents: UNDERLOADED,
  },
  {
    email: 'morgan.cruz@smartcol-test.com',
    displayName: 'Morgan Cruz',
    timezone: 'Asia/Singapore',
    weeklyEvents: OVERLOADED,
    // Overlapping deadlines added per-week
  },
  {
    email: 'taylor.wong@smartcol-test.com',
    displayName: 'Taylor Wong',
    timezone: 'Asia/Singapore',
    weeklyEvents: MEETING_HEAVY,
  },
];

// ── seeding ───────────────────────────────────────────────────────────────────

async function upsertUser(profile: UserProfile): Promise<string> {
  const existing = await db.queryOne<{ id: string }>(
    'SELECT id FROM users WHERE email = $1',
    [profile.email]
  );
  if (existing) return existing.id;

  const user = await db.queryOne<{ id: string }>(
    `INSERT INTO users (email, display_name, timezone)
     VALUES ($1, $2, $3) RETURNING id`,
    [profile.email, profile.displayName, profile.timezone]
  );
  return user!.id;
}

async function seedEventsForUser(
  userId: string,
  profile: UserProfile
): Promise<number> {
  let count = 0;

  // Seed 3 weeks: -2, -1, 0
  for (const weekOffset of [-2, -1, 0]) {
    for (const tpl of profile.weeklyEvents) {
      const start = eventDate(weekOffset, tpl.dayOfWeek, tpl.startHour, tpl.startMin);
      const end   = new Date(start.getTime() + tpl.durationMin * 60000);
      const graphId = `test-${userId}-w${weekOffset}-${tpl.dayOfWeek}-${tpl.startHour}${tpl.startMin}-${tpl.taskTypeId}`;

      const row = await db.queryOne<{ id: string }>(
        `INSERT INTO calendar_events (
           user_id, graph_event_id, graph_calendar_id,
           subject, start_time, end_time,
           is_all_day, is_recurring, is_cancelled,
           status, raw_data, synced_at
         ) VALUES ($1,$2,'test-calendar',$3,$4,$5,$6,false,false,'confirmed',$7,NOW())
         ON CONFLICT (user_id, graph_event_id) DO UPDATE
           SET subject=$3, start_time=$4, end_time=$5, updated_at=NOW()
         RETURNING id`,
        [
          userId, graphId, tpl.subject, start, end,
          tpl.isAllDay ?? false,
          JSON.stringify({ source: 'test-seed', profile: profile.displayName }),
        ]
      );

      if (row) {
        await db.query(
          `INSERT INTO event_classifications
             (event_id, user_id, task_type_id, confidence_score,
              classification_method, model_version)
           VALUES ($1,$2,$3,0.95,'rule_based','test-seed-v1')
           ON CONFLICT (event_id) DO UPDATE
             SET task_type_id=$3, updated_at=NOW()`,
          [row.id, userId, tpl.taskTypeId]
        );
        count++;
      }
    }

    // Alex: one deadline per week (Friday all-day)
    if (profile.displayName === 'Alex Rivera') {
      const friday = eventDate(weekOffset, 4, 0, 0);
      const graphId = `test-${userId}-w${weekOffset}-deadline`;
      const row = await db.queryOne<{ id: string }>(
        `INSERT INTO calendar_events (
           user_id, graph_event_id, graph_calendar_id,
           subject, start_time, end_time, is_all_day, is_recurring, is_cancelled,
           status, raw_data, synced_at
         ) VALUES ($1,$2,'test-calendar','Weekly Deliverable Due',$3,$3,true,false,false,'confirmed',$4,NOW())
         ON CONFLICT (user_id, graph_event_id) DO UPDATE SET updated_at=NOW()
         RETURNING id`,
        [userId, graphId, friday, JSON.stringify({ source: 'test-seed' })]
      );
      if (row) {
        await db.query(
          `INSERT INTO event_classifications (event_id, user_id, task_type_id, confidence_score, classification_method, model_version)
           VALUES ($1,$2,1,0.95,'rule_based','test-seed-v1')
           ON CONFLICT (event_id) DO UPDATE SET task_type_id=1, updated_at=NOW()`,
          [row.id, userId]
        );
        count++;
      }
    }

    // Morgan: 2 overlapping deadlines in current week (Mon + Wed = 2 days apart)
    if (profile.displayName === 'Morgan Cruz') {
      for (const [dow, label] of [[0, 'Phase Deadline'], [2, 'Release Deadline']] as const) {
        const day = eventDate(weekOffset, dow, 0, 0);
        const graphId = `test-${userId}-w${weekOffset}-deadline-${dow}`;
        const row = await db.queryOne<{ id: string }>(
          `INSERT INTO calendar_events (
             user_id, graph_event_id, graph_calendar_id,
             subject, start_time, end_time, is_all_day, is_recurring, is_cancelled,
             status, raw_data, synced_at
           ) VALUES ($1,$2,'test-calendar',$3,$4,$4,true,false,false,'confirmed',$5,NOW())
           ON CONFLICT (user_id, graph_event_id) DO UPDATE SET updated_at=NOW()
           RETURNING id`,
          [userId, graphId, label, day, JSON.stringify({ source: 'test-seed' })]
        );
        if (row) {
          await db.query(
            `INSERT INTO event_classifications (event_id, user_id, task_type_id, confidence_score, classification_method, model_version)
             VALUES ($1,$2,1,0.95,'rule_based','test-seed-v1')
             ON CONFLICT (event_id) DO UPDATE SET task_type_id=1, updated_at=NOW()`,
            [row.id, userId]
          );
          count++;
        }
      }
    }
  }

  return count;
}

// ── main entry point ──────────────────────────────────────────────────────────

export async function seedTestUsers(): Promise<SeedResult> {
  const result: SeedResult = { success: false, users: [] };

  try {
    logger.info('Seeding test users');

    for (const profile of PROFILES) {
      const userId = await upsertUser(profile);
      const eventsCreated = await seedEventsForUser(userId, profile);

      await computeWorkload(userId);
      const riskResult = await detectRisks(userId);

      result.users.push({
        userId,
        email: profile.email,
        displayName: profile.displayName,
        eventsCreated,
        risks: riskResult.risksDetected,
      });

      logger.info('Seeded user', {
        name: profile.displayName,
        eventsCreated,
        risks: riskResult.risksDetected,
      });
    }

    result.success = true;
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Seed failed', { error });
    result.error = error;
    return result;
  }
}

export async function getAllUsersWorkloadSummary() {
  return db.queryMany(
    `SELECT
       u.id, u.email, u.display_name,
       u.last_login_at,
       -- tag test users by email domain
       (u.email LIKE '%@smartcol-test.com') AS is_test_user,
       COUNT(DISTINCT ce.id)                    AS total_events,
       COUNT(DISTINCT ec.id)                    AS classified_events,
       COALESCE(SUM(dw.work_minutes),0)         AS total_work_minutes,
       COALESCE(MAX(dw.work_minutes),0)         AS peak_daily_minutes,
       COALESCE(SUM(dw.overtime_minutes),0)     AS total_overtime,
       COALESCE(SUM(dw.meeting_minutes),0)      AS total_meeting_minutes,
       COALESCE(SUM(dw.focus_minutes),0)        AS total_focus_minutes,
       COUNT(DISTINCT ra.id) FILTER (WHERE ra.status = 'active')       AS active_risks,
       COUNT(DISTINCT ra.id) FILTER (WHERE ra.status = 'acknowledged') AS ongoing_risks
     FROM users u
     LEFT JOIN calendar_events ce ON ce.user_id = u.id AND ce.is_cancelled = false
     LEFT JOIN event_classifications ec ON ec.event_id = ce.id
     LEFT JOIN daily_workload dw ON dw.user_id = u.id
     LEFT JOIN risk_alerts ra ON ra.user_id = u.id
     GROUP BY u.id, u.email, u.display_name, u.last_login_at
     ORDER BY is_test_user ASC, total_work_minutes DESC`
  );
}

export async function getUserRiskAlerts(userId: string) {
  return db.queryMany(
    `SELECT ra.title, ra.severity, ra.score, ra.status, rt.name AS risk_type_name
     FROM risk_alerts ra
     JOIN risk_types rt ON rt.id = ra.risk_type_id
     WHERE ra.user_id = $1
     ORDER BY ra.score DESC`,
    [userId]
  );
}

// ── Random user generator ─────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Aisha', 'Ben', 'Chloe', 'Daniel', 'Elena', 'Faiz', 'Grace', 'Hassan',
  'Isla', 'Jordan', 'Kai', 'Lena', 'Marcus', 'Nadia', 'Omar', 'Priya',
  'Quinn', 'Ravi', 'Sofia', 'Tariq', 'Uma', 'Victor', 'Wei', 'Xin',
  'Yusuf', 'Zara', 'Aaron', 'Bella', 'Carlos', 'Diana',
];
const LAST_NAMES = [
  'Ahmad', 'Brooks', 'Chen', 'Davis', 'Eriksson', 'Fernandez', 'Garcia',
  'Huang', 'Ibrahim', 'Jensen', 'Kumar', 'Lee', 'Martinez', 'Nguyen',
  'Okafor', 'Patel', 'Qureshi', 'Reyes', 'Singh', 'Tan', 'Usman',
  'Vasquez', 'Wong', 'Xu', 'Yamamoto', 'Zafar',
];
const ARCHETYPES = ['balanced', 'underloaded', 'overloaded', 'meeting-heavy'] as const;
type Archetype = typeof ARCHETYPES[number];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * Build a weekly event schedule from scratch based on archetype + randomised params.
 */
function buildRandomEvents(archetype: Archetype): EventTemplate[] {
  const events: EventTemplate[] = [];

  // Meeting subjects per archetype flavour
  const meetingSubjects = [
    'Team Sync', 'Sprint Planning', 'Project Review', 'Client Call',
    'Stakeholder Update', 'Weekly Standup', 'Cross-team Meeting',
    'Roadmap Discussion', 'Design Review', 'Release Planning',
  ];
  const focusSubjects = [
    'Focus Time — Deep Work', 'Focus Block', 'Deep Work Session',
    'Maker Time', 'Uninterrupted Dev Time',
  ];
  const adminSubjects = ['Admin & Ops', 'Email Catch-up', 'Documentation', 'Planning'];
  // const trainingSubjects = ['Workshop', 'Learning Session', 'Tech Talk', 'Knowledge Sharing'];

  if (archetype === 'balanced') {
    // Mon–Fri: standup + 1–2 meetings + 1–2 focus blocks + optional 1:1
    for (let dow = 0; dow < 5; dow++) {
      // Standup every day
      events.push({ subject: 'Daily Standup', dayOfWeek: dow, startHour: 9, startMin: 0, durationMin: rand(15, 30), taskTypeId: 4 });
      // Focus block (Mon, Wed, Fri)
      if ([0, 2, 4].includes(dow)) {
        events.push({ subject: pick(focusSubjects), dayOfWeek: dow, startHour: 10, startMin: 0, durationMin: rand(90, 150), taskTypeId: 8 });
      }
      // Meeting (Tue, Thu)
      if ([1, 3].includes(dow)) {
        events.push({ subject: pick(meetingSubjects), dayOfWeek: dow, startHour: 10, startMin: 0, durationMin: rand(45, 90), taskTypeId: 4 });
        events.push({ subject: pick(focusSubjects), dayOfWeek: dow, startHour: 14, startMin: 0, durationMin: rand(60, 120), taskTypeId: 8 });
      }
      // Afternoon slot
      events.push({ subject: pick(meetingSubjects), dayOfWeek: dow, startHour: 14, startMin: rand(0, 30), durationMin: rand(30, 60), taskTypeId: rand(0, 1) === 0 ? 4 : 7 });
      // 1:1 on Wednesday
      if (dow === 2) {
        events.push({ subject: '1:1 with Manager', dayOfWeek: dow, startHour: 13, startMin: 0, durationMin: 30, taskTypeId: 5 });
      }
    }
  }

  if (archetype === 'underloaded') {
    // 2–3 events total across the whole week
    const activeDays = [0, 2, 4].slice(0, rand(2, 3));
    for (const dow of activeDays) {
      events.push({ subject: pick([...meetingSubjects, ...adminSubjects]), dayOfWeek: dow, startHour: rand(10, 14), startMin: 0, durationMin: rand(20, 45), taskTypeId: pick([4, 6]) });
    }
  }

  if (archetype === 'overloaded') {
    // Every day: 6+ meetings back-to-back + overtime troubleshooting
    for (let dow = 0; dow < 5; dow++) {
      let hour = 8;
      // 5–6 meetings filling the day
      const meetingCount = rand(5, 6);
      for (let m = 0; m < meetingCount; m++) {
        const dur = rand(60, 120);
        events.push({ subject: pick(meetingSubjects), dayOfWeek: dow, startHour: hour, startMin: 0, durationMin: dur, taskTypeId: 4 });
        hour += Math.ceil(dur / 60);
        if (hour >= 17) break;
      }
      // Extended overtime: 17:00–21:00 = 240 min → ensures total ≥ 720 min (12h) for off-day entitlement
      events.push({ subject: 'Urgent Issue — Overtime', dayOfWeek: dow, startHour: 17, startMin: 0, durationMin: 240, taskTypeId: 2 });
    }
    // Saturday weekend work → automatic off-day entitlement regardless of hours
    events.push({ subject: 'Weekend Emergency Support', dayOfWeek: 5, startHour: 9, startMin: 0, durationMin: 180, taskTypeId: 2 });
    // Deadlines: Mon + Wed (overlapping)
    events.push({ subject: 'Phase Deadline', dayOfWeek: 0, startHour: 0, startMin: 0, durationMin: 0, taskTypeId: 1, isAllDay: true });
    events.push({ subject: 'Release Deadline', dayOfWeek: 2, startHour: 0, startMin: 0, durationMin: 0, taskTypeId: 1, isAllDay: true });
  }

  if (archetype === 'meeting-heavy') {
    // Every day: 6–7 meetings, minimal other work, no focus
    for (let dow = 0; dow < 5; dow++) {
      const slots = [
        { h: 9,  m: 0,  dur: 30 },
        { h: 9,  m: 30, dur: rand(45, 60) },
        { h: 10, m: 30, dur: rand(45, 60) },
        { h: 11, m: 30, dur: rand(45, 60) },
        { h: 13, m: 0,  dur: 60 },
        { h: 14, m: 0,  dur: rand(45, 60) },
        { h: 15, m: 0,  dur: rand(45, 60) },
      ];
      for (const s of slots) {
        events.push({ subject: pick(meetingSubjects), dayOfWeek: dow, startHour: s.h, startMin: s.m, durationMin: s.dur, taskTypeId: s.h === 13 ? 5 : 4 });
      }
    }
  }

  return events;
}

export interface RandomUserResult {
  success: boolean;
  userId?: string;
  displayName?: string;
  email?: string;
  archetype?: Archetype;
  eventsCreated?: number;
  risks?: string[];
  error?: string;
}

/**
 * Generate and seed a single random user, run full pipeline, return result.
 */
export async function seedRandomUser(): Promise<RandomUserResult> {
  try {
    const firstName   = pick(FIRST_NAMES);
    const lastName    = pick(LAST_NAMES);
    const displayName = `${firstName} ${lastName}`;
    const archetype   = pick([...ARCHETYPES]);
    const tag         = Date.now().toString(36); // unique suffix
    const email       = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${tag}@smartcol-test.com`;

    const profile: UserProfile = {
      email,
      displayName,
      timezone: 'Asia/Singapore',
      weeklyEvents: buildRandomEvents(archetype),
    };

    const userId = await upsertUser(profile);
    const eventsCreated = await seedEventsForUser(userId, profile);
    await computeWorkload(userId);
    const riskResult = await detectRisks(userId);

    logger.info('Random user seeded', { displayName, archetype, eventsCreated, risks: riskResult.risksDetected });

    return {
      success: true,
      userId,
      displayName,
      email,
      archetype,
      eventsCreated,
      risks: riskResult.risksDetected,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Random user seed failed', { error });
    return { success: false, error };
  }
}

/**
 * Add more randomised mock calendar events for an existing user,
 * then recompute workload and re-run risk detection.
 */
export async function addRandomEventsToUser(userId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  risks: string[];
  error?: string;
}> {
  try {
    const user = await db.queryOne<{ display_name: string; email: string }>(
      'SELECT display_name, email FROM users WHERE id = $1',
      [userId]
    );
    if (!user) throw new Error('User not found');

    // Pick a random archetype for the new batch of events
    const archetype = pick([...ARCHETYPES]);
    const profile: UserProfile = {
      email: user.email,
      displayName: user.display_name,
      timezone: 'Asia/Singapore',
      weeklyEvents: buildRandomEvents(archetype),
    };

    // Only seed current week (weekOffset=0) to add fresh upcoming events
    let count = 0;
    for (const tpl of profile.weeklyEvents) {
      const start  = eventDate(0, tpl.dayOfWeek, tpl.startHour, tpl.startMin);
      const end    = new Date(start.getTime() + tpl.durationMin * 60000);
      const graphId = `rnd-${userId}-${Date.now()}-${tpl.dayOfWeek}-${tpl.startHour}${tpl.startMin}`;

      const row = await db.queryOne<{ id: string }>(
        `INSERT INTO calendar_events (
           user_id, graph_event_id, graph_calendar_id,
           subject, start_time, end_time, is_all_day, is_recurring, is_cancelled,
           status, raw_data, synced_at
         ) VALUES ($1,$2,'test-calendar',$3,$4,$5,$6,false,false,'confirmed',$7,NOW())
         ON CONFLICT (user_id, graph_event_id) DO NOTHING
         RETURNING id`,
        [
          userId, graphId, tpl.subject, start, end,
          tpl.isAllDay ?? false,
          JSON.stringify({ source: 'random-add', archetype }),
        ]
      );
      if (row) {
        await db.query(
          `INSERT INTO event_classifications (event_id, user_id, task_type_id, confidence_score, classification_method, model_version)
           VALUES ($1,$2,$3,0.90,'rule_based','test-seed-v1')
           ON CONFLICT (event_id) DO NOTHING`,
          [row.id, userId, tpl.taskTypeId]
        );
        count++;
      }
    }

    await computeWorkload(userId);
    const riskResult = await detectRisks(userId);

    return { success: true, eventsAdded: count, risks: riskResult.risksDetected };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, eventsAdded: 0, risks: [], error };
  }
}
