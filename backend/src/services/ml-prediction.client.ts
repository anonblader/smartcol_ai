/**
 * ML Prediction Client
 *
 * HTTP client for the Python ML prediction/scoring endpoints
 * served by the classification-service (port 8000).
 */

import { config } from '../config/env';

const BASE_URL = config.ai.serviceUrl;

export interface WorkloadPrediction {
  date: string;
  day_of_week: number;
  predicted_minutes: number;
  predicted_hours: number;
  confidence: number;
  load_level: 'light' | 'moderate' | 'high' | 'critical';
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface WorkloadPredictionResponse {
  predictions: WorkloadPrediction[];
  model_version: string;
  generated_at: string;
}

export interface BurnoutScoreResponse {
  score: number;
  level: 'none' | 'low' | 'medium' | 'high' | 'critical';
  trend: 'improving' | 'stable' | 'worsening';
  contributing_factors: string[];
  confidence: number;
  probabilities: Record<string, number>;
  metrics_summary: Record<string, unknown>;
  model_version: string;
}

export async function predictWorkload(
  historicalDaily: Array<{
    date: string;
    work_minutes: number;
    meeting_minutes?: number;
    focus_minutes?: number;
    deadline_count?: number;
  }>
): Promise<WorkloadPredictionResponse> {
  const res = await fetch(`${BASE_URL}/predict/workload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ historical_daily: historicalDaily }),
    signal: AbortSignal.timeout(config.ai.timeout),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Workload prediction service error ${res.status}: ${body}`);
  }

  return res.json() as Promise<WorkloadPredictionResponse>;
}

export async function scoreBurnout(
  weeklyMetrics: Array<{
    week_start_date?: string;
    work_minutes: number;
    overtime_minutes?: number;
    meeting_minutes?: number;
    focus_minutes?: number;
    meeting_count?: number;
  }>
): Promise<BurnoutScoreResponse> {
  const res = await fetch(`${BASE_URL}/score/burnout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekly_metrics: weeklyMetrics }),
    signal: AbortSignal.timeout(config.ai.timeout),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Burnout scoring service error ${res.status}: ${body}`);
  }

  return res.json() as Promise<BurnoutScoreResponse>;
}
