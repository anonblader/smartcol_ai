/**
 * Mock Calendar Sync Service
 *
 * Simulates Microsoft Graph calendar synchronization for demonstration purposes.
 * This is used when Microsoft Graph API access is unavailable due to tenant restrictions.
 */

import { db } from './database.client';
import { logger } from '../config/monitoring.config';
import { CalendarEvent } from '../types';

/**
 * Generate realistic mock calendar events
 */
function generateMockEvents(userId: string): Partial<CalendarEvent>[] {
  const now = new Date();
  const events: Partial<CalendarEvent>[] = [];

  // Team Meeting - Recurring weekly
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-1`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Weekly Team Standup',
    body_preview: 'Discuss weekly progress, blockers, and upcoming tasks',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 10, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 11, 0),
    is_all_day: false,
    is_recurring: true,
    recurrence_pattern: {
      type: 'weekly',
      interval: 1,
      daysOfWeek: ['Monday'],
    },
    location: 'Conference Room A',
    attendees: [
      { email: 'manager@company.com', name: 'Sarah Chen', type: 'required', status: 'accepted' },
      { email: 'dev1@company.com', name: 'John Smith', type: 'required', status: 'accepted' },
      { email: 'dev2@company.com', name: 'Emily Wong', type: 'optional', status: 'tentativelyAccepted' },
    ],
    organizer_email: 'manager@company.com',
    status: 'confirmed',
    response_status: 'accepted',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'recurring-meeting' },
    last_modified_at: new Date(),
  });

  // Project Deadline
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-2`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Project Phase 1 Deadline',
    body_preview: 'Complete all features for Phase 1 release',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 0, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59),
    is_all_day: true,
    is_recurring: false,
    recurrence_pattern: null,
    location: null,
    attendees: null,
    organizer_email: null,
    status: 'confirmed',
    response_status: 'organizer',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'deadline' },
    last_modified_at: new Date(),
  });

  // Client Presentation
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-3`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Client Demo - SmartCol AI',
    body_preview: 'Demonstrate the calendar sync feature and AI-powered workload analysis',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 14, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 15, 30),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: 'Zoom Meeting',
    attendees: [
      { email: 'client@example.com', name: 'Alex Johnson', type: 'required', status: 'accepted' },
      { email: 'team-lead@company.com', name: 'David Lee', type: 'required', status: 'accepted' },
    ],
    organizer_email: 'you@company.com',
    status: 'confirmed',
    response_status: 'organizer',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'presentation', isOnlineMeeting: true },
    last_modified_at: new Date(),
  });

  // Code Review Session
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-4`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Code Review: Calendar Sync Implementation',
    body_preview: 'Review the calendar synchronization service implementation',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 11, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 12, 0),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: 'Engineering Room',
    attendees: [
      { email: 'senior-dev@company.com', name: 'Lisa Park', type: 'required', status: 'accepted' },
    ],
    organizer_email: 'you@company.com',
    status: 'confirmed',
    response_status: 'organizer',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'code-review' },
    last_modified_at: new Date(),
  });

  // Sprint Planning
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-5`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Sprint Planning - Next Iteration',
    body_preview: 'Plan tasks and story points for the upcoming sprint',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 9, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 12, 0),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: 'Conference Room B',
    attendees: [
      { email: 'scrum-master@company.com', name: 'Mike Chen', type: 'required', status: 'accepted' },
      { email: 'dev1@company.com', name: 'John Smith', type: 'required', status: 'accepted' },
      { email: 'dev2@company.com', name: 'Emily Wong', type: 'required', status: 'notResponded' },
      { email: 'designer@company.com', name: 'Anna Kim', type: 'optional', status: 'declined' },
    ],
    organizer_email: 'scrum-master@company.com',
    status: 'confirmed',
    response_status: 'accepted',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'planning' },
    last_modified_at: new Date(),
  });

  // Focus Time (No meetings)
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-6`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Focus Time - Deep Work',
    body_preview: 'Block time for uninterrupted development work',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 14, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 17, 0),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: null,
    attendees: null,
    organizer_email: null,
    status: 'confirmed',
    response_status: 'organizer',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'focus-time' },
    last_modified_at: new Date(),
  });

  // Past event - completed task
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-7`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Database Schema Design Review',
    body_preview: 'Finalize the database schema for SmartCol AI',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 11, 30),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: 'Online',
    attendees: [
      { email: 'architect@company.com', name: 'Robert Zhang', type: 'required', status: 'accepted' },
    ],
    organizer_email: 'you@company.com',
    status: 'confirmed',
    response_status: 'organizer',
    is_cancelled: false,
    raw_data: { source: 'mock', type: 'past-event' },
    last_modified_at: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2),
  });

  // Cancelled event
  events.push({
    user_id: userId,
    graph_event_id: `mock-event-${userId}-8`,
    graph_calendar_id: 'mock-calendar-primary',
    subject: 'Optional Team Lunch',
    body_preview: 'Cancelled due to scheduling conflicts',
    start_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0),
    end_time: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 13, 0),
    is_all_day: false,
    is_recurring: false,
    recurrence_pattern: null,
    location: 'Restaurant',
    attendees: null,
    organizer_email: 'social@company.com',
    status: 'cancelled',
    response_status: null,
    is_cancelled: true,
    raw_data: { source: 'mock', type: 'cancelled' },
    last_modified_at: new Date(),
  });

  return events;
}

/**
 * Sync mock calendar events
 */
export async function syncMockCalendarEvents(userId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  totalProcessed: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    logger.info('Starting mock calendar sync', { userId });

    // Generate mock events
    const mockEvents = generateMockEvents(userId);

    let eventsAdded = 0;
    let eventsUpdated = 0;

    // Insert or update each event
    for (const event of mockEvents) {
      const existingEvent = await db.queryOne<CalendarEvent>(
        'SELECT id FROM calendar_events WHERE user_id = $1 AND graph_event_id = $2',
        [userId, event.graph_event_id]
      );

      if (existingEvent) {
        // Update existing event
        await db.query(
          `UPDATE calendar_events
           SET subject = $1,
               body_preview = $2,
               start_time = $3,
               end_time = $4,
               is_all_day = $5,
               is_recurring = $6,
               recurrence_pattern = $7,
               location = $8,
               attendees = $9,
               organizer_email = $10,
               status = $11,
               response_status = $12,
               is_cancelled = $13,
               raw_data = $14,
               last_modified_at = $15,
               synced_at = NOW(),
               updated_at = NOW()
           WHERE id = $16`,
          [
            event.subject,
            event.body_preview,
            event.start_time,
            event.end_time,
            event.is_all_day,
            event.is_recurring,
            JSON.stringify(event.recurrence_pattern),
            event.location,
            JSON.stringify(event.attendees),
            event.organizer_email,
            event.status,
            event.response_status,
            event.is_cancelled,
            JSON.stringify(event.raw_data),
            event.last_modified_at,
            existingEvent.id,
          ]
        );
        eventsUpdated++;
      } else {
        // Insert new event
        await db.query(
          `INSERT INTO calendar_events (
            user_id,
            graph_event_id,
            graph_calendar_id,
            subject,
            body_preview,
            start_time,
            end_time,
            is_all_day,
            is_recurring,
            recurrence_pattern,
            location,
            attendees,
            organizer_email,
            status,
            response_status,
            is_cancelled,
            raw_data,
            last_modified_at,
            synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())`,
          [
            event.user_id,
            event.graph_event_id,
            event.graph_calendar_id,
            event.subject,
            event.body_preview,
            event.start_time,
            event.end_time,
            event.is_all_day,
            event.is_recurring,
            JSON.stringify(event.recurrence_pattern),
            event.location,
            JSON.stringify(event.attendees),
            event.organizer_email,
            event.status,
            event.response_status,
            event.is_cancelled,
            JSON.stringify(event.raw_data),
            event.last_modified_at,
          ]
        );
        eventsAdded++;
      }
    }

    // Record sync in sync_history
    const duration = Date.now() - startTime;
    await db.query(
      `INSERT INTO sync_history (
        user_id,
        sync_type,
        status,
        started_at,
        completed_at,
        events_fetched,
        events_created,
        events_updated,
        events_deleted,
        duration_ms
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '${duration} milliseconds', NOW(), $4, $5, $6, $7, $8)`,
      [
        userId,
        'mock',
        'success',
        mockEvents.length,
        eventsAdded,
        eventsUpdated,
        0,
        duration,
      ]
    );

    logger.info('Mock calendar sync completed', {
      userId,
      duration,
      eventsAdded,
      eventsUpdated,
    });

    return {
      success: true,
      eventsAdded,
      eventsUpdated,
      eventsDeleted: 0,
      totalProcessed: mockEvents.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Mock calendar sync failed', { userId, error: errorMessage });

    return {
      success: false,
      eventsAdded: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      totalProcessed: 0,
      error: errorMessage,
    };
  }
}

// ── Light mock sync (underloaded profile) ─────────────────────────────────────

function generateLightMockEvents(userId: string): Partial<CalendarEvent>[] {
  const events: Partial<CalendarEvent>[] = [];
  const now = new Date();

  // Just a handful of light events spread across the week — triggers Low Focus Time
  const lightEvents = [
    { subj: 'Weekly Check-in',   day: 0, sh: 10, sm: 0,  eh: 10, em: 30 },
    { subj: 'Admin & Emails',    day: 2, sh: 14, sm: 0,  eh: 14, em: 30 },
    { subj: 'Optional Team Sync',day: 4, sh: 11, sm: 0,  eh: 11, em: 30 },
  ];

  lightEvents.forEach((e, i) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + e.day, e.sh, e.sm);
    const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + e.day, e.eh, e.em);
    events.push({
      user_id: userId,
      graph_event_id: `light-${userId}-${i + 1}`,
      graph_calendar_id: 'mock-calendar-primary',
      subject: e.subj,
      body_preview: 'Light schedule — minimal workload',
      start_time: start,
      end_time: end,
      is_all_day: false,
      is_recurring: false,
      recurrence_pattern: null,
      location: null,
      attendees: null,
      organizer_email: null,
      status: 'confirmed',
      response_status: 'organizer',
      is_cancelled: false,
      raw_data: { source: 'light-mock' },
      last_modified_at: new Date(),
    });
  });

  return events;
}

export async function syncLightMockEvents(userId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  totalProcessed: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    logger.info('Starting light mock calendar sync', { userId });
    const mockEvents = generateLightMockEvents(userId);
    let eventsAdded = 0;
    let eventsUpdated = 0;

    for (const event of mockEvents) {
      const existing = await db.queryOne<CalendarEvent>(
        'SELECT id FROM calendar_events WHERE user_id = $1 AND graph_event_id = $2',
        [userId, event.graph_event_id]
      );
      if (existing) {
        await db.query(
          `UPDATE calendar_events SET subject=$1, start_time=$2, end_time=$3,
           synced_at=NOW(), updated_at=NOW() WHERE id=$4`,
          [event.subject, event.start_time, event.end_time, existing.id]
        );
        eventsUpdated++;
      } else {
        await db.query(
          `INSERT INTO calendar_events (
             user_id, graph_event_id, graph_calendar_id, subject, body_preview,
             start_time, end_time, is_all_day, is_recurring, recurrence_pattern,
             location, attendees, organizer_email, status, response_status,
             is_cancelled, raw_data, last_modified_at, synced_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`,
          [
            event.user_id, event.graph_event_id, event.graph_calendar_id,
            event.subject, event.body_preview, event.start_time, event.end_time,
            event.is_all_day, event.is_recurring, JSON.stringify(event.recurrence_pattern),
            event.location, JSON.stringify(event.attendees), event.organizer_email,
            event.status, event.response_status, event.is_cancelled,
            JSON.stringify(event.raw_data), event.last_modified_at,
          ]
        );
        eventsAdded++;
      }
    }

    const duration = Date.now() - startTime;
    await db.query(
      `INSERT INTO sync_history (user_id, sync_type, status, started_at, completed_at,
         events_fetched, events_created, events_updated, events_deleted, duration_ms)
       VALUES ($1,'mock','success',NOW() - INTERVAL '${duration} milliseconds',NOW(),$2,$3,$4,$5,$6)`,
      [userId, mockEvents.length, eventsAdded, eventsUpdated, 0, duration]
    );

    logger.info('Light mock sync completed', { userId, eventsAdded, eventsUpdated });
    return { success: true, eventsAdded, eventsUpdated, eventsDeleted: 0, totalProcessed: mockEvents.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Light mock sync failed', { userId, error: errorMessage });
    return { success: false, eventsAdded: 0, eventsUpdated: 0, eventsDeleted: 0, totalProcessed: 0, error: errorMessage };
  }
}

// ── Heavy mock sync (overloaded profile) ──────────────────────────────────────

/**
 * Generate an overloaded schedule spanning the past 2 weeks + current week.
 * Produces: back-to-back meetings, overtime troubleshooting, clustered deadlines,
 * zero focus time → triggers High Daily Workload, Meeting Overload,
 * Excessive Troubleshooting, Overlapping Deadlines, Low Focus Time, Burnout Risk.
 */
function generateHeavyMockEvents(userId: string): Partial<CalendarEvent>[] {
  const events: Partial<CalendarEvent>[] = [];

  // Helper: Monday of a given week offset (0 = current, -1 = last week, etc.)
  function weekMonday(weekOffset: number): Date {
    const today = new Date();
    const dow = today.getUTCDay() || 7;
    const mon = new Date(today);
    mon.setUTCDate(today.getUTCDate() - dow + 1 + weekOffset * 7);
    mon.setUTCHours(0, 0, 0, 0);
    return mon;
  }

  function d(weekOffset: number, dayOfWeek: number, hour: number, minute = 0): Date {
    const base = weekMonday(weekOffset);
    base.setUTCDate(base.getUTCDate() + dayOfWeek);
    base.setUTCHours(hour, minute, 0, 0);
    return base;
  }

  let idx = 0;

  // 3 events per day totalling 750 min (12.5h) — same daily load, half the event count.
  // 210 + 270 + 270 = 750 min ✓  triggers all 6 risk types + off-day entitlement.
  const dailySchedule: Array<{
    subj: string; body: string;
    sh: number; sm: number; eh: number; em: number;
    attendees: Array<{ email: string; name: string; type: 'required' | 'optional'; status: 'accepted' | 'declined' | 'tentativelyAccepted' | 'organizer' | 'notResponded' }>;
  }> = [
    {
      subj:    'Morning Standup & Sprint Review',
      body:    'Daily standup, sprint progress review and team sync',
      sh: 8,  sm: 0,  eh: 11, em: 30,   // 210 min — Routine Meeting
      attendees: [
        { email: 'manager@company.com', name: 'Sarah Chen',  type: 'required', status: 'accepted' },
        { email: 'dev1@company.com',    name: 'John Smith',  type: 'required', status: 'accepted' },
        { email: 'dev2@company.com',    name: 'Emily Wong',  type: 'required', status: 'accepted' },
      ],
    },
    {
      subj:    'Stakeholder Sync & Technical Planning',
      body:    'Client sync, architecture planning and cross-team coordination meeting',
      sh: 12, sm: 0,  eh: 16, em: 30,   // 270 min — Routine Meeting
      attendees: [
        { email: 'client@company.com',  name: 'Alex Johnson', type: 'required', status: 'accepted' },
        { email: 'lead@company.com',    name: 'David Lee',    type: 'required', status: 'accepted' },
        { email: 'dev1@company.com',    name: 'John Smith',   type: 'optional', status: 'accepted' },
      ],
    },
    {
      subj:    'Urgent Production Incident Response',
      body:    'Emergency bug fix and troubleshooting for critical production outage — P0 incident',
      sh: 17, sm: 0,  eh: 21, em: 30,   // 270 min overtime — Ad-hoc Troubleshooting
      attendees: [],
    },
  ];

  for (const weekOffset of [-2, -1, 0]) {
    for (let dow = 0; dow < 5; dow++) {
      for (const slot of dailySchedule) {
        idx++;
        const start = d(weekOffset, dow, slot.sh, slot.sm);
        const end   = d(weekOffset, dow, slot.eh, slot.em);
        events.push({
          user_id: userId,
          graph_event_id: `heavy-${userId}-w${weekOffset}-d${dow}-${idx}`,
          graph_calendar_id: 'mock-calendar-primary',
          subject: slot.subj,
          body_preview: slot.body,
          start_time: start,
          end_time: end,
          is_all_day: false,
          is_recurring: false,
          recurrence_pattern: null,
          location: 'Conference Room / Teams',
          attendees: slot.attendees,
          organizer_email: 'ariff@company.com',
          status: 'confirmed',
          response_status: 'organizer',
          is_cancelled: false,
          raw_data: { source: 'heavy-mock', weekOffset, dow },
          last_modified_at: new Date(),
        });
      }
    }

    // Weekend work: Saturday morning support shift → earns 1 off-day regardless of hours
    idx++;
    const sat = d(weekOffset, 5, 9, 0); // Saturday (day 5 from Monday)
    events.push({
      user_id: userId,
      graph_event_id: `heavy-weekend-${userId}-w${weekOffset}`,
      graph_calendar_id: 'mock-calendar-primary',
      subject: 'Weekend On-Call Support',
      body_preview: 'Saturday support coverage — qualifies for off-day compensation',
      start_time: sat,
      end_time: new Date(sat.getTime() + 3 * 60 * 60 * 1000), // 3h
      is_all_day: false,
      is_recurring: false,
      recurrence_pattern: null,
      location: null,
      attendees: null,
      organizer_email: 'ariff@company.com',
      status: 'confirmed',
      response_status: 'organizer',
      is_cancelled: false,
      raw_data: { source: 'heavy-mock', type: 'weekend-work' },
      last_modified_at: new Date(),
    });

    // Clustered deadlines: Monday + Wednesday each week (2 days apart → Overlapping Deadlines)
    for (const [dow, subj] of [[0, 'Phase Deadline'], [2, 'Release Deadline']] as const) {
      idx++;
      const day = d(weekOffset, dow, 0);
      events.push({
        user_id: userId,
        graph_event_id: `heavy-deadline-${userId}-w${weekOffset}-d${dow}`,
        graph_calendar_id: 'mock-calendar-primary',
        subject: subj,
        body_preview: 'Deadline — must deliver',
        start_time: day,
        end_time: day,
        is_all_day: true,
        is_recurring: false,
        recurrence_pattern: null,
        location: null,
        attendees: null,
        organizer_email: 'ariff@company.com',
        status: 'confirmed',
        response_status: 'organizer',
        is_cancelled: false,
        raw_data: { source: 'heavy-mock', type: 'deadline' },
        last_modified_at: new Date(),
      });
    }
  }

  return events;
}

/**
 * Sync heavy (overloaded) mock events for the authenticated user.
 */
export async function syncHeavyMockEvents(userId: string): Promise<{
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  totalProcessed: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    logger.info('Starting heavy mock calendar sync', { userId });
    const mockEvents = generateHeavyMockEvents(userId);
    let eventsAdded = 0;
    let eventsUpdated = 0;

    for (const event of mockEvents) {
      const existing = await db.queryOne<CalendarEvent>(
        'SELECT id FROM calendar_events WHERE user_id = $1 AND graph_event_id = $2',
        [userId, event.graph_event_id]
      );

      if (existing) {
        await db.query(
          `UPDATE calendar_events
           SET subject=$1, body_preview=$2, start_time=$3, end_time=$4,
               is_all_day=$5, is_recurring=$6, recurrence_pattern=$7,
               location=$8, attendees=$9, organizer_email=$10,
               status=$11, response_status=$12, is_cancelled=$13,
               raw_data=$14, last_modified_at=$15, synced_at=NOW(), updated_at=NOW()
           WHERE id=$16`,
          [
            event.subject, event.body_preview, event.start_time, event.end_time,
            event.is_all_day, event.is_recurring, JSON.stringify(event.recurrence_pattern),
            event.location, JSON.stringify(event.attendees), event.organizer_email,
            event.status, event.response_status, event.is_cancelled,
            JSON.stringify(event.raw_data), event.last_modified_at, existing.id,
          ]
        );
        eventsUpdated++;
      } else {
        await db.query(
          `INSERT INTO calendar_events (
             user_id, graph_event_id, graph_calendar_id, subject, body_preview,
             start_time, end_time, is_all_day, is_recurring, recurrence_pattern,
             location, attendees, organizer_email, status, response_status,
             is_cancelled, raw_data, last_modified_at, synced_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())`,
          [
            event.user_id, event.graph_event_id, event.graph_calendar_id,
            event.subject, event.body_preview, event.start_time, event.end_time,
            event.is_all_day, event.is_recurring, JSON.stringify(event.recurrence_pattern),
            event.location, JSON.stringify(event.attendees), event.organizer_email,
            event.status, event.response_status, event.is_cancelled,
            JSON.stringify(event.raw_data), event.last_modified_at,
          ]
        );
        eventsAdded++;
      }
    }

    const duration = Date.now() - startTime;
    await db.query(
      `INSERT INTO sync_history (
         user_id, sync_type, status, started_at, completed_at,
         events_fetched, events_created, events_updated, events_deleted, duration_ms
       ) VALUES ($1,'mock','success',NOW() - INTERVAL '${duration} milliseconds',NOW(),$2,$3,$4,$5,$6)`,
      [userId, mockEvents.length, eventsAdded, eventsUpdated, 0, duration]
    );

    logger.info('Heavy mock sync completed', { userId, eventsAdded, eventsUpdated });
    return { success: true, eventsAdded, eventsUpdated, eventsDeleted: 0, totalProcessed: mockEvents.length };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Heavy mock sync failed', { userId, error: errorMessage });
    return { success: false, eventsAdded: 0, eventsUpdated: 0, eventsDeleted: 0, totalProcessed: 0, error: errorMessage };
  }
}
