/**
 * Event Classification Service
 *
 * Fetches unclassified calendar events for a user, sends them to the
 * AI classification service, and persists results to event_classifications.
 */

import { db }              from './database.client';
import { classifyEvents, isClassificationServiceHealthy } from './classification.client';
import { logger }          from '../config/monitoring.config';
import { CalendarEvent, ClassificationRequest } from '../types';
import { getUserFeedbackPatterns } from './feedback.service';

export interface ClassificationResult {
  success: boolean;
  classified: number;
  skipped: number;
  failed: number;
  error?: string;
}

/**
 * Classify all unclassified events for a user and store results in DB.
 */
export async function classifyUserEvents(userId: string): Promise<ClassificationResult> {
  const result: ClassificationResult = {
    success: false,
    classified: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    // Check service availability first
    const healthy = await isClassificationServiceHealthy();
    if (!healthy) {
      throw new Error('Classification service is not reachable at ' + process.env.AI_SERVICE_URL);
    }

    // Fetch events that have not been classified yet
    const events = await db.queryMany<CalendarEvent>(
      `SELECT ce.*
       FROM calendar_events ce
       LEFT JOIN event_classifications ec ON ec.event_id = ce.id
       WHERE ce.user_id = $1
         AND ce.is_cancelled = false
         AND ec.id IS NULL
       ORDER BY ce.start_time ASC`,
      [userId]
    );

    if (events.length === 0) {
      logger.info('No unclassified events found', { userId });
      result.success = true;
      return result;
    }

    logger.info('Classifying events', { userId, count: events.length });

    // Load user's feedback patterns — subjects the user has already corrected.
    // Events matching a corrected pattern are applied directly without calling the AI.
    const feedbackPatterns = await getUserFeedbackPatterns(userId);
    let feedbackApplied = 0;

    const needsAI: CalendarEvent[] = [];
    for (const event of events) {
      const subjectKey = (event.subject ?? '').toLowerCase().trim();
      const correctedTypeId = feedbackPatterns.get(subjectKey);

      if (correctedTypeId) {
        // Apply user's known correction immediately
        await db.query(
          `INSERT INTO event_classifications
             (event_id, user_id, task_type_id, confidence_score, classification_method, model_version)
           VALUES ($1, $2, $3, 0.99, 'user_feedback', 'pattern-learning-v1.0')
           ON CONFLICT (event_id) DO UPDATE SET
             task_type_id = EXCLUDED.task_type_id,
             confidence_score = EXCLUDED.confidence_score,
             classification_method = EXCLUDED.classification_method,
             model_version = EXCLUDED.model_version,
             updated_at = NOW()`,
          [event.id, userId, correctedTypeId]
        );
        result.classified++;
        feedbackApplied++;
      } else {
        needsAI.push(event);
      }
    }

    if (feedbackApplied > 0) {
      logger.info('Applied feedback patterns', { userId, feedbackApplied });
    }

    // Only send events without an existing correction to the AI
    const aiEvents = needsAI;

    // Build classification requests
    const requests: ClassificationRequest[] = aiEvents.map((event) => ({
      event_id: event.id,
      subject: event.subject ?? '',
      body_preview: event.body_preview,
      location: event.location,
      attendees: event.attendees ?? [],
      organizer_email: event.organizer_email,
      duration_minutes: event.duration_minutes,
      is_all_day: event.is_all_day,
    }));

    if (aiEvents.length === 0) {
      result.success = true;
      logger.info('All events handled via feedback patterns', { userId, feedbackApplied });
      return result;
    }

    // Classify remaining events in batch via AI
    const batchResults = await classifyEvents(requests);

    // Persist each result
    for (const { request, result: classification, error } of batchResults) {
      if (!classification) {
        logger.warn('Skipping event due to classification error', {
          eventId: request.event_id,
          error,
        });
        result.failed++;
        continue;
      }

      try {
        await db.query(
          `INSERT INTO event_classifications (
            event_id,
            user_id,
            task_type_id,
            confidence_score,
            classification_method,
            model_version,
            features_used
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (event_id) DO UPDATE SET
            task_type_id          = EXCLUDED.task_type_id,
            confidence_score      = EXCLUDED.confidence_score,
            classification_method = EXCLUDED.classification_method,
            model_version         = EXCLUDED.model_version,
            features_used         = EXCLUDED.features_used,
            updated_at            = NOW()`,
          [
            request.event_id,
            userId,
            classification.task_type_id,
            classification.confidence_score,
            classification.method,
            classification.model_version,
            JSON.stringify(classification.features),
          ]
        );
        result.classified++;
      } catch (dbErr) {
        logger.error('Failed to save classification', {
          eventId: request.event_id,
          error: dbErr instanceof Error ? dbErr.message : 'Unknown error',
        });
        result.failed++;
      }
    }

    result.success = true;
    logger.info('Classification complete', { userId, ...result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Event classification failed', { userId, error });
    result.error = error;
    return result;
  }
}
