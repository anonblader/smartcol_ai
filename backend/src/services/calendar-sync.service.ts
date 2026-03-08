/**
 * Calendar Sync Service
 *
 * Handles synchronization of calendar events from Microsoft Graph API
 * to local database with support for delta queries and incremental updates.
 */

import { db } from './database.client';
import { graphClient } from './graph.client';
import { logger } from '../config/monitoring.config';
import {
  User,
  OAuthToken,
  CalendarEvent,
  GraphEvent,
  Attendee,
  RecurrencePattern,
} from '../types';

/**
 * Result of a calendar sync operation
 */
export interface SyncResult {
  success: boolean;
  eventsAdded: number;
  eventsUpdated: number;
  eventsDeleted: number;
  totalProcessed: number;
  error?: string;
}

/**
 * Decrypt token (placeholder - implement with Azure Key Vault)
 */
function decryptToken(encryptedToken: string): string {
  // TODO: Implement proper AES-256-GCM decryption with Azure Key Vault
  return Buffer.from(encryptedToken, 'base64').toString('utf-8');
}

/**
 * Get valid access token for user (refresh if expired)
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const token = await db.queryOne<OAuthToken>(
    'SELECT * FROM oauth_tokens WHERE user_id = $1',
    [userId]
  );

  if (!token) {
    throw new Error('No OAuth token found for user');
  }

  // Check if token is expired
  const isExpired = new Date(token.expires_at) < new Date();

  if (!isExpired) {
    return decryptToken(token.access_token_encrypted);
  }

  // Token is expired - refresh it
  logger.info('Access token expired, refreshing', { userId });

  const refreshToken = decryptToken(token.refresh_token_encrypted);
  const newTokens = await graphClient.refreshAccessToken(refreshToken);

  // Update stored tokens
  const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000);

  await db.query(
    `UPDATE oauth_tokens
     SET access_token_encrypted = $1,
         expires_at = $2,
         updated_at = NOW()
     WHERE user_id = $3`,
    [
      Buffer.from(newTokens.access_token).toString('base64'),
      expiresAt,
      userId,
    ]
  );

  logger.info('Access token refreshed', { userId });

  return newTokens.access_token;
}

/**
 * Convert Graph API event to database format
 */
function convertGraphEventToDbFormat(
  graphEvent: GraphEvent,
  userId: string
): Partial<CalendarEvent> {
  // Determine event status
  let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
  if (graphEvent.isCancelled) {
    status = 'cancelled';
  }
  // Note: GraphEvent doesn't have showAs property, so we can't detect tentative status from it

  // Map response status
  let responseStatus: 'accepted' | 'declined' | 'tentativelyAccepted' | 'organizer' | 'notResponded' | null = null;
  if (graphEvent.responseStatus?.response) {
    const graphResponse = graphEvent.responseStatus.response.toLowerCase();
    if (graphResponse === 'accepted') responseStatus = 'accepted';
    else if (graphResponse === 'declined') responseStatus = 'declined';
    else if (graphResponse === 'tentativelyaccepted') responseStatus = 'tentativelyAccepted';
    else if (graphResponse === 'organizer') responseStatus = 'organizer';
    else responseStatus = 'notResponded';
  }

  // Parse recurrence pattern if present
  let recurrencePattern: RecurrencePattern | null = null;
  if (graphEvent.recurrence?.pattern) {
    const pattern = graphEvent.recurrence.pattern;
    recurrencePattern = {
      type: pattern.type || 'daily',
      interval: pattern.interval || 1,
      daysOfWeek: pattern.daysOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      monthOfYear: pattern.month,
      endDate: graphEvent.recurrence.range?.endDate,
      occurrences: graphEvent.recurrence.range?.numberOfOccurrences,
    };
  }

  // Parse attendees
  const attendees: Attendee[] | null = graphEvent.attendees?.map((a): Attendee => ({
    email: a.emailAddress.address,
    name: a.emailAddress.name,
    type: a.type === 'required' ? 'required' : a.type === 'optional' ? 'optional' : a.type === 'resource' ? 'resource' : undefined,
    status: (a.status?.response?.toLowerCase() as any) || undefined,
  })) || null;

  return {
    user_id: userId,
    graph_event_id: graphEvent.id,
    graph_calendar_id: null,
    subject: graphEvent.subject || null,
    body_preview: graphEvent.bodyPreview || null,
    start_time: new Date(graphEvent.start.dateTime),
    end_time: new Date(graphEvent.end.dateTime),
    is_all_day: graphEvent.isAllDay || false,
    is_recurring: !!graphEvent.recurrence,
    recurrence_pattern: recurrencePattern,
    location: graphEvent.location?.displayName || null,
    attendees,
    organizer_email: graphEvent.organizer?.emailAddress?.address || null,
    status,
    response_status: responseStatus,
    is_cancelled: graphEvent.isCancelled || false,
    raw_data: graphEvent,
    last_modified_at: null, // GraphEvent doesn't have this property
  };
}

/**
 * Sync calendar events for a user
 */
export async function syncCalendarEvents(
  userId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    useDeltaSync?: boolean;
  } = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: false,
    eventsAdded: 0,
    eventsUpdated: 0,
    eventsDeleted: 0,
    totalProcessed: 0,
  };

  try {
    logger.info('Starting calendar sync', { userId, options });

    // Get valid access token
    const accessToken = await getValidAccessToken(userId);

    logger.debug('Retrieved access token for sync', {
      userId,
      tokenLength: accessToken.length,
      tokenPrefix: accessToken.substring(0, 20) + '...'
    });

    // Test token validity with a simple /me call
    try {
      const testProfile = await graphClient.getUserProfile(accessToken);
      logger.info('Token validated successfully', { userId: testProfile.id });
    } catch (error) {
      logger.error('Token validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error('Access token is invalid or expired');
    }

    // Get user for timezone
    const user = await db.queryOne<User>(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Get last sync info for delta queries
    let deltaLink: string | null = null;
    if (options.useDeltaSync !== false) {
      const token = await db.queryOne<OAuthToken>(
        `SELECT calendar_delta_link FROM oauth_tokens
         WHERE user_id = $1`,
        [userId]
      );
      deltaLink = token?.calendar_delta_link || null;
    }

    // Fetch events from Microsoft Graph
    const startDateTime = options.startDate?.toISOString();
    const endDateTime = options.endDate?.toISOString();

    const { events, deltaLink: newDeltaLink } = await graphClient.getCalendarEvents(
      accessToken,
      {
        deltaLink: deltaLink || undefined,
        startDateTime,
        endDateTime,
      }
    );

    logger.info('Fetched events from Graph API', {
      userId,
      eventCount: events.length,
      usedDelta: !!deltaLink,
    });

    // Process each event
    for (const graphEvent of events) {
      result.totalProcessed++;

      // Check if event was deleted (delta query marker)
      if ((graphEvent as any)['@removed']) {
        await db.query(
          `UPDATE calendar_events
           SET is_cancelled = true,
               status = 'cancelled',
               updated_at = NOW()
           WHERE user_id = $1 AND graph_event_id = $2`,
          [userId, graphEvent.id]
        );
        result.eventsDeleted++;
        continue;
      }

      // Convert to database format
      const dbEvent = convertGraphEventToDbFormat(graphEvent, userId);

      // Upsert event
      const existingEvent = await db.queryOne<CalendarEvent>(
        `SELECT id FROM calendar_events
         WHERE user_id = $1 AND graph_event_id = $2`,
        [userId, graphEvent.id]
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
            dbEvent.subject,
            dbEvent.body_preview,
            dbEvent.start_time,
            dbEvent.end_time,
            dbEvent.is_all_day,
            dbEvent.is_recurring,
            JSON.stringify(dbEvent.recurrence_pattern),
            dbEvent.location,
            JSON.stringify(dbEvent.attendees),
            dbEvent.organizer_email,
            dbEvent.status,
            dbEvent.response_status,
            dbEvent.is_cancelled,
            JSON.stringify(dbEvent.raw_data),
            dbEvent.last_modified_at,
            existingEvent.id,
          ]
        );
        result.eventsUpdated++;
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
            dbEvent.user_id,
            dbEvent.graph_event_id,
            dbEvent.graph_calendar_id,
            dbEvent.subject,
            dbEvent.body_preview,
            dbEvent.start_time,
            dbEvent.end_time,
            dbEvent.is_all_day,
            dbEvent.is_recurring,
            JSON.stringify(dbEvent.recurrence_pattern),
            dbEvent.location,
            JSON.stringify(dbEvent.attendees),
            dbEvent.organizer_email,
            dbEvent.status,
            dbEvent.response_status,
            dbEvent.is_cancelled,
            JSON.stringify(dbEvent.raw_data),
            dbEvent.last_modified_at,
          ]
        );
        result.eventsAdded++;
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
        deltaLink ? 'delta' : 'full',
        'success',
        result.totalProcessed,
        result.eventsAdded,
        result.eventsUpdated,
        result.eventsDeleted,
        duration,
      ]
    );

    // Update last_sync_at and calendar_delta_link in oauth_tokens
    await db.query(
      `UPDATE oauth_tokens
       SET last_sync_at = NOW(),
           calendar_delta_link = $2
       WHERE user_id = $1`,
      [userId, newDeltaLink]
    );

    result.success = true;

    logger.info('Calendar sync completed', {
      userId,
      duration,
      result,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    logger.error('Calendar sync failed', {
      userId,
      error: errorMessage,
    });

    // Record failed sync
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
        duration_ms,
        error_message
      ) VALUES ($1, $2, $3, NOW() - INTERVAL '${duration} milliseconds', NOW(), $4, $5, $6, $7, $8, $9)`,
      [userId, 'manual', 'failed', 0, 0, 0, 0, duration, errorMessage]
    );

    result.error = errorMessage;
    return result;
  }
}

/**
 * Sync calendar events for all active users
 */
export async function syncAllUsers(): Promise<{
  totalUsers: number;
  successful: number;
  failed: number;
  results: Array<{ userId: string; result: SyncResult }>;
}> {
  logger.info('Starting sync for all users');

  // Get all users with valid tokens
  const users = await db.queryMany<User>(
    `SELECT u.id, u.email
     FROM users u
     INNER JOIN oauth_tokens t ON u.id = t.user_id
     WHERE t.expires_at > NOW() OR t.refresh_token_encrypted IS NOT NULL`
  );

  const results: Array<{ userId: string; result: SyncResult }> = [];
  let successful = 0;
  let failed = 0;

  for (const user of users) {
    const result = await syncCalendarEvents(user.id, { useDeltaSync: true });
    results.push({ userId: user.id, result });

    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  logger.info('Completed sync for all users', {
    totalUsers: users.length,
    successful,
    failed,
  });

  return {
    totalUsers: users.length,
    successful,
    failed,
    results,
  };
}
