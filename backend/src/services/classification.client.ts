/**
 * Classification Client
 *
 * HTTP client for the Python AI classification service.
 */

import { config } from '../config/env';
import { logger } from '../config/monitoring.config';
import { ClassificationRequest, ClassificationResponse } from '../types';

const BASE_URL = config.ai.serviceUrl;

/**
 * Check if the classification service is reachable
 */
export async function isClassificationServiceHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Classify a single calendar event
 */
export async function classifyEvent(
  request: ClassificationRequest
): Promise<ClassificationResponse> {
  const res = await fetch(`${BASE_URL}/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(config.ai.timeout),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Classification service error ${res.status}: ${body}`);
  }

  return res.json() as Promise<ClassificationResponse>;
}

/**
 * Classify a batch of events in chunks to avoid overwhelming the CPU-bound NLI model.
 * Events are processed BATCH_SIZE at a time (concurrent within each batch,
 * sequential across batches), preventing timeout storms on large syncs.
 */
const CLASSIFY_BATCH_SIZE = 8;

export async function classifyEvents(
  requests: ClassificationRequest[]
): Promise<Array<{ request: ClassificationRequest; result?: ClassificationResponse; error?: string }>> {
  const all: Array<{ request: ClassificationRequest; result?: ClassificationResponse; error?: string }> = [];

  for (let i = 0; i < requests.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = requests.slice(i, i + CLASSIFY_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (request) => {
        try {
          const result = await classifyEvent(request);
          return { request, result };
        } catch (err) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          logger.warn('Failed to classify event', { eventId: request.event_id, error });
          return { request, error };
        }
      })
    );
    all.push(...batchResults);
  }

  return all;
}
