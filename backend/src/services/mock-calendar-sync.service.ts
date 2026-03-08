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
    graph_event_id: `mock-event-${Date.now()}-1`,
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
    graph_event_id: `mock-event-${Date.now()}-2`,
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
    graph_event_id: `mock-event-${Date.now()}-3`,
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
    graph_event_id: `mock-event-${Date.now()}-4`,
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
    graph_event_id: `mock-event-${Date.now()}-5`,
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
    graph_event_id: `mock-event-${Date.now()}-6`,
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
    graph_event_id: `mock-event-${Date.now()}-7`,
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
    graph_event_id: `mock-event-${Date.now()}-8`,
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
