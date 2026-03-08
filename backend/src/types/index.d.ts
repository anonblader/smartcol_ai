/**
 * SmartCol AI - TypeScript Type Definitions
 *
 * Global type declarations for the backend application.
 */

import { Request } from 'express';

// ============================================================================
// DATABASE MODELS
// ============================================================================

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  microsoft_user_id: string | null;
  timezone: string;

  // Work schedule settings
  standard_hours_per_day: number;
  standard_hours_per_week: number;
  work_days: string[]; // ["Monday", "Tuesday", ...]
  work_start_time: string; // "09:00:00"
  work_end_time: string; // "17:00:00"

  // Account status
  is_active: boolean;
  last_login_at: Date | null;

  // Metadata
  created_at: Date;
  updated_at: Date;
}

export interface OAuthToken {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  token_hash: string;
  expires_at: Date;
  scope: string | null;
  calendar_delta_link: string | null;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskType {
  id: number;
  name: string;
  description: string | null;
  color_code: string | null;
  is_work_time: boolean;
  icon: string | null;
  created_at: Date;
}

export interface ProjectCategory {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color_code: string | null;
  created_at: Date;
}

export interface CalendarEvent {
  id: string;
  user_id: string;

  // Microsoft Graph identifiers
  graph_event_id: string;
  graph_calendar_id: string | null;

  // Event details
  subject: string | null;
  body_preview: string | null;
  start_time: Date;
  end_time: Date;
  duration_minutes: number; // Generated column

  // Event properties
  is_all_day: boolean;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  location: string | null;
  attendees: Attendee[] | null;
  organizer_email: string | null;

  // Event status
  status: EventStatus;
  response_status: ResponseStatus | null;
  is_cancelled: boolean;

  // Raw data
  raw_data: any; // Full Graph API response

  // Sync metadata
  synced_at: Date;
  last_modified_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

export interface EventClassification {
  id: string;
  event_id: string;
  user_id: string;

  // Classification results
  task_type_id: number;
  project_category_id: string | null;

  // Classification metadata
  confidence_score: number; // 0.0 to 1.0
  classification_method: ClassificationMethod;
  model_version: string | null;
  features_used: Record<string, any> | null;

  // User feedback
  is_manually_corrected: boolean;
  corrected_at: Date | null;
  original_task_type_id: number | null;

  created_at: Date;
  updated_at: Date;
}

export interface SyncHistory {
  id: string;
  user_id: string;
  sync_type: SyncType;
  status: SyncStatus;

  events_fetched: number;
  events_created: number;
  events_updated: number;
  events_deleted: number;

  error_message: string | null;
  error_details: any | null;
  duration_ms: number | null;

  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface DailyWorkload {
  id: string;
  user_id: string;
  date: string; // DATE format: "2025-12-04"

  // Time metrics (in minutes)
  total_minutes: number;
  work_minutes: number;
  meeting_minutes: number;
  focus_minutes: number;
  break_minutes: number;

  // Event counts
  total_events: number;
  meeting_count: number;
  deadline_count: number;

  // Overtime
  standard_minutes: number | null;
  overtime_minutes: number;

  // Breakdowns (JSONB)
  task_type_breakdown: Record<string, number>;
  project_breakdown: Record<string, number>;

  // Risk indicators
  has_high_workload: boolean;
  has_overlapping_deadlines: boolean;

  created_at: Date;
  updated_at: Date;
}

export interface WeeklyWorkload {
  id: string;
  user_id: string;
  week_start_date: string; // DATE format
  year: number;
  week_number: number;

  total_minutes: number;
  work_minutes: number;
  overtime_minutes: number;

  total_events: number;
  meeting_count: number;

  task_type_breakdown: Record<string, number>;
  daily_breakdown: Record<string, DailyMetrics>;

  created_at: Date;
  updated_at: Date;
}

export interface RiskType {
  id: number;
  name: string;
  description: string | null;
  severity_default: RiskSeverity;
  created_at: Date;
}

export interface RiskAlert {
  id: string;
  user_id: string;
  risk_type_id: number;

  severity: RiskSeverity;
  score: number; // 0-100

  detected_date: string; // DATE
  start_date: string | null; // DATE
  end_date: string | null; // DATE

  title: string;
  description: string | null;
  recommendation: string | null;

  metrics: Record<string, any> | null;
  related_event_ids: string[] | null;

  status: RiskStatus;
  acknowledged_at: Date | null;
  resolved_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

export interface OffDayRecommendation {
  id: string;
  user_id: string;
  recommended_date: string; // DATE
  priority_score: number; // 0-100

  workload_score: number | null;
  deadline_count: number | null;
  meeting_count: number | null;
  days_in_future: number | null;

  reason: string | null;
  metrics: Record<string, any> | null;

  status: RecommendationStatus;
  user_response_at: Date | null;

  generated_at: Date;
  expires_at: Date | null;
  created_at: Date;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;

  // Channel preferences
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;

  // Notification types
  risk_alerts_enabled: boolean;
  overtime_warnings_enabled: boolean;
  weekly_summary_enabled: boolean;
  offday_recommendations_enabled: boolean;
  classification_feedback_enabled: boolean;

  // Filtering
  minimum_severity: RiskSeverity;

  // Quiet hours
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // TIME
  quiet_hours_end: string; // TIME

  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;

  type: NotificationType;
  channel: NotificationChannel;

  title: string;
  message: string;
  data: Record<string, any> | null;

  priority: NotificationPriority;

  related_risk_id: string | null;
  related_event_id: string | null;

  status: NotificationStatus;
  sent_at: Date | null;
  read_at: Date | null;
  error_message: string | null;

  retry_count: number;
  max_retries: number;
  next_retry_at: Date | null;

  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;

  action: AuditAction;
  resource_type: string | null;
  resource_id: string | null;

  ip_address: string | null;
  user_agent: string | null;

  status: 'success' | 'failed' | 'denied';
  error_message: string | null;

  metadata: Record<string, any> | null;
  created_at: Date;
}

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type ResponseStatus = 'accepted' | 'declined' | 'tentativelyAccepted' | 'organizer' | 'notResponded';
export type ClassificationMethod = 'ml_model' | 'rule_based' | 'hybrid' | 'manual';
export type SyncType = 'full' | 'delta' | 'manual';
export type SyncStatus = 'success' | 'partial' | 'failed';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';
export type RecommendationStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type NotificationType =
  | 'risk_alert'
  | 'overtime_warning'
  | 'weekly_summary'
  | 'offday_recommendation'
  | 'classification_feedback';
export type NotificationChannel = 'email' | 'push' | 'in_app';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';
export type AuditAction =
  | 'login'
  | 'logout'
  | 'sync'
  | 'classify'
  | 'export_data'
  | 'delete_account'
  | 'update_settings';

// ============================================================================
// NESTED TYPES
// ============================================================================

export interface Attendee {
  email: string;
  name?: string;
  type?: 'required' | 'optional' | 'resource';
  status?: ResponseStatus;
}

export interface RecurrencePattern {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: string[];
  dayOfMonth?: number;
  monthOfYear?: number;
  endDate?: string;
  occurrences?: number;
}

export interface DailyMetrics {
  total_minutes: number;
  work_minutes: number;
  meeting_count: number;
  overtime_minutes: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface AuthCallbackQuery {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface CalendarSyncResponse {
  success: boolean;
  events_fetched: number;
  events_created: number;
  events_updated: number;
  sync_id: string;
}

export interface EventsQueryParams {
  start_date?: string; // ISO 8601 date
  end_date?: string;
  task_type_id?: number;
  project_id?: string;
  limit?: number;
  offset?: number;
}

export interface DashboardResponse {
  weekly_summary: WeeklySummary;
  time_breakdown: TimeBreakdown;
  active_risks: RiskAlert[];
  recent_events: CalendarEvent[];
}

export interface WeeklySummary {
  total_hours: number;
  overtime_hours: number;
  meeting_count: number;
  utilization_rate: number;
  week_start: string;
  week_end: string;
}

export interface TimeBreakdown {
  by_task_type: Array<{
    task_type: string;
    minutes: number;
    percentage: number;
    color: string;
  }>;
  by_project: Array<{
    project_name: string;
    minutes: number;
    percentage: number;
  }>;
}

export interface OvertimeTrend {
  date: string;
  total_hours: number;
  overtime_hours: number;
  standard_hours: number;
}

// ============================================================================
// MICROSOFT GRAPH API TYPES
// ============================================================================

export interface GraphEvent {
  id: string;
  subject: string;
  bodyPreview: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: string;
    status: {
      response: string;
      time: string;
    };
  }>;
  organizer: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  isAllDay: boolean;
  isCancelled: boolean;
  seriesMasterId?: string;
  recurrence?: any;
  responseStatus: {
    response: string;
    time: string;
  };
}

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  mailboxSettings?: {
    timeZone: string;
  };
}

export interface GraphTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ============================================================================
// EXPRESS EXTENSIONS
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

// ============================================================================
// SERVICE TYPES
// ============================================================================

export interface DatabaseClient {
  query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export interface GraphClient {
  getAuthUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<GraphTokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<GraphTokenResponse>;
  getUserProfile(accessToken: string): Promise<GraphUser>;
  getCalendarEvents(accessToken: string, deltaLink?: string): Promise<{
    events: GraphEvent[];
    deltaLink: string;
  }>;
}

// ============================================================================
// CLASSIFICATION SERVICE TYPES
// ============================================================================

export interface ClassificationRequest {
  event_id: string;
  subject: string;
  body_preview: string | null;
  location: string | null;
  attendees: Attendee[];
  organizer_email: string | null;
  duration_minutes: number;
  is_all_day: boolean;
}

export interface ClassificationResponse {
  task_type_id: number;
  task_type_name: string;
  confidence_score: number;
  method: ClassificationMethod;
  model_version: string;
  features: Record<string, any>;
  project_suggestion?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Pagination
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
