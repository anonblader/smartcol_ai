/**
 * Classification Feedback Service (Active Learning)
 *
 * Allows engineers to correct misclassified events.
 * Corrections are:
 *   1. Applied immediately to event_classifications
 *   2. Stored in classification_feedback for pattern learning
 *   3. Used by future classifications — if a subject was corrected
 *      before, new events with matching subjects get auto-corrected type
 */

import { db }            from './database.client';
import { computeWorkload } from './analytics.service';
import { logger }        from '../config/monitoring.config';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FeedbackStats {
  totalCorrections:   number;
  uniqueSubjects:     number;
  autoApplied:        number;         // events corrected via pattern match
  byOriginalType:     Array<{ name: string; count: number }>;
  byCorrectedType:    Array<{ name: string; count: number }>;
  recentCorrections:  Array<{
    subject:         string;
    originalType:    string;
    correctedType:   string;
    correctedAt:     string;
  }>;
}

// ── Submit a correction ────────────────────────────────────────────────────────

export async function submitCorrection(
  userId:          string,
  eventId:         string,
  correctedTypeId: number
): Promise<{ success: boolean; message: string; patternsLearned: number }> {
  try {
    // Verify the event belongs to this user
    const event = await db.queryOne<{
      id: string; subject: string; user_id: string;
    }>(
      `SELECT id, subject, user_id FROM calendar_events WHERE id = $1`,
      [eventId]
    );

    if (!event || event.user_id !== userId) {
      return { success: false, message: 'Event not found', patternsLearned: 0 };
    }

    // Get the current classification
    const existing = await db.queryOne<{
      task_type_id: number; confidence_score: number; classification_method: string;
    }>(
      `SELECT task_type_id, confidence_score, classification_method
       FROM event_classifications WHERE event_id = $1`,
      [eventId]
    );

    // Verify corrected type exists
    const taskType = await db.queryOne<{ id: number; name: string }>(
      `SELECT id, name FROM task_types WHERE id = $1`,
      [correctedTypeId]
    );
    if (!taskType) return { success: false, message: 'Invalid task type', patternsLearned: 0 };

    // 1. Update event_classifications with the user's correction
    await db.query(
      `INSERT INTO event_classifications
         (event_id, user_id, task_type_id, confidence_score, classification_method, model_version)
       VALUES ($1, $2, $3, 0.99, 'user_feedback', 'user-correction-v1.0')
       ON CONFLICT (event_id) DO UPDATE SET
         task_type_id          = EXCLUDED.task_type_id,
         confidence_score      = EXCLUDED.confidence_score,
         classification_method = EXCLUDED.classification_method,
         model_version         = EXCLUDED.model_version,
         updated_at            = NOW()`,
      [eventId, userId, correctedTypeId]
    );

    // 2. Store correction in feedback table
    await db.query(
      `INSERT INTO classification_feedback
         (event_id, user_id, event_subject, original_task_type_id,
          corrected_task_type_id, original_confidence, original_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_id) DO UPDATE SET
         corrected_task_type_id = EXCLUDED.corrected_task_type_id,
         original_task_type_id  = EXCLUDED.original_task_type_id,
         original_confidence    = EXCLUDED.original_confidence,
         original_method        = EXCLUDED.original_method,
         updated_at             = NOW()`,
      [
        eventId, userId,
        event.subject,
        existing?.task_type_id ?? null,
        correctedTypeId,
        existing?.confidence_score ?? null,
        existing?.classification_method ?? null,
      ]
    );

    // 3. Apply pattern learning — re-classify other events with the same subject
    const patternsLearned = await applyPatternToMatchingEvents(
      userId, event.subject ?? '', correctedTypeId
    );

    // 4. Recompute workload so metrics reflect the correction
    computeWorkload(userId).catch(() => {});

    logger.info('Classification correction submitted', {
      userId, eventId, correctedTypeId: taskType.name, patternsLearned,
    });

    return {
      success:        true,
      message:        `Reclassified as "${taskType.name}"${patternsLearned > 0 ? ` · ${patternsLearned} similar event(s) also updated` : ''}`,
      patternsLearned,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('Feedback submission failed', { userId, eventId, error });
    return { success: false, message: error, patternsLearned: 0 };
  }
}

/**
 * Pattern learning: update all other events with the same subject
 * that were NOT already corrected by the user.
 */
async function applyPatternToMatchingEvents(
  userId: string, subject: string, correctedTypeId: number
): Promise<number> {
  if (!subject.trim()) return 0;

  // Find other events with the same subject that have AI classifications
  // but no user feedback yet
  const matchingEvents = await db.queryMany<{ id: string }>(
    `SELECT ce.id
     FROM calendar_events ce
     JOIN event_classifications ec ON ec.event_id = ce.id
     LEFT JOIN classification_feedback cf ON cf.event_id = ce.id
     WHERE ce.user_id = $1
       AND ce.is_cancelled = false
       AND LOWER(ce.subject) = LOWER($2)
       AND cf.id IS NULL
       AND ec.classification_method != 'user_feedback'`,
    [userId, subject]
  );

  if (matchingEvents.length === 0) return 0;

  // Apply the correction to all matching events
  for (const event of matchingEvents) {
    await db.query(
      `UPDATE event_classifications
       SET task_type_id = $1, confidence_score = 0.97,
           classification_method = 'user_feedback', model_version = 'pattern-learning-v1.0',
           updated_at = NOW()
       WHERE event_id = $2`,
      [correctedTypeId, event.id]
    );
  }

  return matchingEvents.length;
}

// ── Pre-classification feedback check ─────────────────────────────────────────

/**
 * Returns a map of { subject → corrected_task_type_id } for a user's
 * previously corrected subjects. Used by event-classification.service.ts
 * to skip AI for events whose subjects have already been corrected.
 */
export async function getUserFeedbackPatterns(
  userId: string
): Promise<Map<string, number>> {
  const rows = await db.queryMany<{ event_subject: string; corrected_task_type_id: number }>(
    `SELECT LOWER(event_subject) AS event_subject, corrected_task_type_id
     FROM classification_feedback
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.event_subject) {
      map.set(row.event_subject.toLowerCase(), row.corrected_task_type_id);
    }
  }
  return map;
}

// ── Feedback stats ─────────────────────────────────────────────────────────────

export async function getFeedbackStats(userId: string): Promise<FeedbackStats> {
  const [total, byOrig, byCorr, recent] = await Promise.all([
    // Total corrections + unique subjects
    db.queryOne<{ total: number; unique_subjects: number }>(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT LOWER(event_subject)) AS unique_subjects
       FROM classification_feedback WHERE user_id = $1`,
      [userId]
    ),

    // Breakdown by original type
    db.queryMany<{ name: string; count: number }>(
      `SELECT tt.name, COUNT(*) AS count
       FROM classification_feedback cf
       JOIN task_types tt ON tt.id = cf.original_task_type_id
       WHERE cf.user_id = $1 AND cf.original_task_type_id IS NOT NULL
       GROUP BY tt.name ORDER BY count DESC`,
      [userId]
    ),

    // Breakdown by corrected type
    db.queryMany<{ name: string; count: number }>(
      `SELECT tt.name, COUNT(*) AS count
       FROM classification_feedback cf
       JOIN task_types tt ON tt.id = cf.corrected_task_type_id
       WHERE cf.user_id = $1
       GROUP BY tt.name ORDER BY count DESC`,
      [userId]
    ),

    // Recent 5 corrections
    db.queryMany<{
      subject: string; original_name: string; corrected_name: string; updated_at: string;
    }>(
      `SELECT cf.event_subject AS subject,
              ot.name AS original_name, ct.name AS corrected_name,
              cf.updated_at
       FROM classification_feedback cf
       LEFT JOIN task_types ot ON ot.id = cf.original_task_type_id
       JOIN task_types ct ON ct.id = cf.corrected_task_type_id
       WHERE cf.user_id = $1
       ORDER BY cf.updated_at DESC LIMIT 5`,
      [userId]
    ),
  ]);

  // Count how many events are classified via pattern learning
  const patternCount = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM event_classifications
     WHERE user_id = $1 AND classification_method = 'user_feedback'`,
    [userId]
  );

  return {
    totalCorrections:  Number(total?.total ?? 0),
    uniqueSubjects:    Number(total?.unique_subjects ?? 0),
    autoApplied:       Math.max(0, Number(patternCount?.count ?? 0) - Number(total?.total ?? 0)),
    byOriginalType:    byOrig.map(r => ({ name: r.name, count: Number(r.count) })),
    byCorrectedType:   byCorr.map(r => ({ name: r.name, count: Number(r.count) })),
    recentCorrections: recent.map(r => ({
      subject:      r.subject ?? '(untitled)',
      originalType: r.original_name ?? 'Unknown',
      correctedType: r.corrected_name,
      correctedAt:   r.updated_at,
    })),
  };
}

// ── Classified events list ─────────────────────────────────────────────────────

export async function getClassifiedEvents(userId: string, limit = 50) {
  return db.queryMany(
    `SELECT
       ce.id, ce.subject, ce.start_time, ce.end_time, ce.duration_minutes,
       ce.is_all_day, ce.location,
       ec.task_type_id, ec.confidence_score, ec.classification_method,
       tt.name AS task_type_name, tt.color_code,
       cf.id AS feedback_id,
       cf.corrected_task_type_id AS user_corrected_type_id
     FROM calendar_events ce
     JOIN event_classifications ec ON ec.event_id = ce.id
     JOIN task_types tt ON tt.id = ec.task_type_id
     LEFT JOIN classification_feedback cf ON cf.event_id = ce.id
     WHERE ce.user_id = $1 AND ce.is_cancelled = false
     ORDER BY ce.start_time DESC
     LIMIT $2`,
    [userId, limit]
  );
}
