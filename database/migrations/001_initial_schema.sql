-- SmartCol AI Database Schema
-- PostgreSQL 15+ Initial Migration
-- Created: 2025-12-04

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

-- Users table: Core user information
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    microsoft_user_id VARCHAR(255) UNIQUE, -- Microsoft Graph user ID
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Work schedule settings
    standard_hours_per_day DECIMAL(4,2) DEFAULT 8.0,
    standard_hours_per_week DECIMAL(4,2) DEFAULT 40.0,
    work_days JSONB DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]',
    work_start_time TIME DEFAULT '09:00:00',
    work_end_time TIME DEFAULT '17:00:00',

    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OAuth tokens: Encrypted storage for Microsoft Graph tokens
CREATE TABLE oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Token data (encrypted)
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash for quick lookup

    -- Token metadata
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT,

    -- Delta sync tracking
    calendar_delta_link TEXT, -- For incremental sync
    last_sync_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id)
);

CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);

-- ============================================================================
-- TASK TYPES & CATEGORIES
-- ============================================================================

-- Predefined task types for classification
CREATE TABLE task_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color_code VARCHAR(7), -- Hex color for UI
    is_work_time BOOLEAN DEFAULT TRUE, -- Counts toward overtime calculation
    icon VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert predefined task types
INSERT INTO task_types (name, description, color_code, is_work_time, icon) VALUES
('Deadline', 'Tasks with specific due dates', '#FF5252', TRUE, 'event'),
('Ad-hoc Troubleshooting', 'Urgent unplanned issues', '#FF9800', TRUE, 'build'),
('Project Milestone', 'Key project checkpoints', '#4CAF50', TRUE, 'flag'),
('Routine Meeting', 'Regular scheduled meetings', '#2196F3', TRUE, 'groups'),
('1:1 Check-in', 'One-on-one meetings', '#9C27B0', TRUE, 'person'),
('Admin/Operational', 'Administrative tasks', '#607D8B', TRUE, 'settings'),
('Training/Learning', 'Skill development', '#00BCD4', TRUE, 'school'),
('Focus Time', 'Dedicated deep work blocks', '#3F51B5', TRUE, 'lightbulb'),
('Break/Personal', 'Lunch, breaks, personal time', '#8BC34A', FALSE, 'coffee'),
('Out of Office', 'Vacation, sick leave, holidays', '#FFC107', FALSE, 'beach_access');

-- Project categories (user-defined or auto-detected)
CREATE TABLE project_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color_code VARCHAR(7),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, name)
);

CREATE INDEX idx_project_categories_user_id ON project_categories(user_id);

-- ============================================================================
-- CALENDAR EVENTS
-- ============================================================================

-- Calendar events: Synced from Microsoft Graph
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Microsoft Graph identifiers
    graph_event_id VARCHAR(255) NOT NULL,
    graph_calendar_id VARCHAR(255),

    -- Event details
    subject VARCHAR(500),
    body_preview TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        EXTRACT(EPOCH FROM (end_time - start_time)) / 60
    ) STORED,

    -- Event properties
    is_all_day BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern JSONB,
    location VARCHAR(500),
    attendees JSONB, -- Array of attendee objects
    organizer_email VARCHAR(255),

    -- Event status
    status VARCHAR(50) DEFAULT 'confirmed', -- confirmed, tentative, cancelled
    response_status VARCHAR(50), -- accepted, declined, tentativelyAccepted
    is_cancelled BOOLEAN DEFAULT FALSE,

    -- Raw data
    raw_data JSONB, -- Full Graph API response

    -- Sync metadata
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    last_modified_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, graph_event_id)
);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX idx_calendar_events_end_time ON calendar_events(end_time);
CREATE INDEX idx_calendar_events_user_date ON calendar_events(user_id, start_time, end_time);
CREATE INDEX idx_calendar_events_graph_id ON calendar_events(graph_event_id);

-- ============================================================================
-- EVENT CLASSIFICATION
-- ============================================================================

-- Event classifications: AI-powered task type assignment
CREATE TABLE event_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Classification results
    task_type_id INTEGER NOT NULL REFERENCES task_types(id),
    project_category_id UUID REFERENCES project_categories(id) ON DELETE SET NULL,

    -- Classification metadata
    confidence_score DECIMAL(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    classification_method VARCHAR(50), -- 'ml_model', 'rule_based', 'hybrid', 'manual'
    model_version VARCHAR(50),

    -- Features used for classification (for debugging/improvement)
    features_used JSONB,

    -- User feedback
    is_manually_corrected BOOLEAN DEFAULT FALSE,
    corrected_at TIMESTAMPTZ,
    original_task_type_id INTEGER REFERENCES task_types(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(event_id)
);

CREATE INDEX idx_event_classifications_event_id ON event_classifications(event_id);
CREATE INDEX idx_event_classifications_user_id ON event_classifications(user_id);
CREATE INDEX idx_event_classifications_task_type ON event_classifications(task_type_id);
CREATE INDEX idx_event_classifications_confidence ON event_classifications(confidence_score);

-- ============================================================================
-- SYNC HISTORY
-- ============================================================================

-- Sync history: Track calendar synchronization jobs
CREATE TABLE sync_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Sync details
    sync_type VARCHAR(50) NOT NULL, -- 'full', 'delta', 'manual'
    status VARCHAR(50) NOT NULL, -- 'success', 'partial', 'failed'

    -- Results
    events_fetched INTEGER DEFAULT 0,
    events_created INTEGER DEFAULT 0,
    events_updated INTEGER DEFAULT 0,
    events_deleted INTEGER DEFAULT 0,

    -- Error handling
    error_message TEXT,
    error_details JSONB,

    -- Performance
    duration_ms INTEGER,

    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_history_user_id ON sync_history(user_id);
CREATE INDEX idx_sync_history_started_at ON sync_history(started_at DESC);

-- ============================================================================
-- ANALYTICS & METRICS
-- ============================================================================

-- Daily workload summary: Pre-aggregated daily metrics
CREATE TABLE daily_workload (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Time metrics (in minutes)
    total_minutes INTEGER DEFAULT 0,
    work_minutes INTEGER DEFAULT 0,
    meeting_minutes INTEGER DEFAULT 0,
    focus_minutes INTEGER DEFAULT 0,
    break_minutes INTEGER DEFAULT 0,

    -- Event counts
    total_events INTEGER DEFAULT 0,
    meeting_count INTEGER DEFAULT 0,
    deadline_count INTEGER DEFAULT 0,

    -- Overtime
    standard_minutes INTEGER, -- Based on user settings
    overtime_minutes INTEGER DEFAULT 0,

    -- Breakdown by task type (JSONB for flexibility)
    task_type_breakdown JSONB, -- { "task_type_id": minutes }
    project_breakdown JSONB,   -- { "project_id": minutes }

    -- Risk indicators
    has_high_workload BOOLEAN DEFAULT FALSE,
    has_overlapping_deadlines BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_workload_user_date ON daily_workload(user_id, date DESC);
CREATE INDEX idx_daily_workload_date ON daily_workload(date DESC);

-- Weekly workload summary
CREATE TABLE weekly_workload (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL, -- Monday of the week
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL,

    -- Time metrics (in minutes)
    total_minutes INTEGER DEFAULT 0,
    work_minutes INTEGER DEFAULT 0,
    overtime_minutes INTEGER DEFAULT 0,

    -- Event counts
    total_events INTEGER DEFAULT 0,
    meeting_count INTEGER DEFAULT 0,

    -- Breakdowns
    task_type_breakdown JSONB,
    daily_breakdown JSONB, -- { "2025-01-15": { metrics } }

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, week_start_date)
);

CREATE INDEX idx_weekly_workload_user_week ON weekly_workload(user_id, week_start_date DESC);

-- ============================================================================
-- RISK DETECTION
-- ============================================================================

-- Risk types reference
CREATE TABLE risk_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    severity_default VARCHAR(20), -- 'low', 'medium', 'high', 'critical'

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert predefined risk types
INSERT INTO risk_types (name, description, severity_default) VALUES
('High Daily Workload', 'Working >10 hours/day for extended periods', 'high'),
('Burnout Risk', 'Sustained >50 hours/week for 3+ consecutive weeks', 'critical'),
('Overlapping Deadlines', 'Multiple deadlines within 3-day window', 'medium'),
('Excessive Troubleshooting', '>8 hours/week of ad-hoc incidents', 'medium'),
('Low Focus Time', '<5 hours/week of dedicated focus blocks', 'low'),
('Meeting Overload', '>20 hours or 25+ meetings per week', 'medium');

-- Risk alerts: Detected risk instances
CREATE TABLE risk_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    risk_type_id INTEGER NOT NULL REFERENCES risk_types(id),

    -- Risk details
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    score INTEGER CHECK (score >= 0 AND score <= 100),

    -- Detection period
    detected_date DATE NOT NULL,
    start_date DATE,
    end_date DATE,

    -- Description and recommendations
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recommendation TEXT,

    -- Supporting data
    metrics JSONB, -- Specific metrics that triggered the alert
    related_event_ids UUID[], -- Array of event IDs

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'acknowledged', 'resolved', 'dismissed'
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_risk_alerts_user_id ON risk_alerts(user_id);
CREATE INDEX idx_risk_alerts_status ON risk_alerts(status);
CREATE INDEX idx_risk_alerts_severity ON risk_alerts(severity);
CREATE INDEX idx_risk_alerts_detected_date ON risk_alerts(detected_date DESC);

-- ============================================================================
-- OFF-DAY RECOMMENDATIONS
-- ============================================================================

-- Off-day recommendations: AI-suggested optimal days for time-off
CREATE TABLE offday_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Recommendation details
    recommended_date DATE NOT NULL,
    priority_score INTEGER CHECK (priority_score >= 0 AND priority_score <= 100),

    -- Analysis metrics
    workload_score INTEGER,
    deadline_count INTEGER,
    meeting_count INTEGER,
    days_in_future INTEGER,

    -- Explanation
    reason TEXT,
    metrics JSONB,

    -- Recommendation status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'expired'
    user_response_at TIMESTAMPTZ,

    -- Validity period
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offday_recommendations_user_id ON offday_recommendations(user_id);
CREATE INDEX idx_offday_recommendations_date ON offday_recommendations(recommended_date);
CREATE INDEX idx_offday_recommendations_status ON offday_recommendations(status);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

-- Notification preferences: User-configurable notification settings
CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Channel preferences
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,

    -- Notification types
    risk_alerts_enabled BOOLEAN DEFAULT TRUE,
    overtime_warnings_enabled BOOLEAN DEFAULT TRUE,
    weekly_summary_enabled BOOLEAN DEFAULT TRUE,
    offday_recommendations_enabled BOOLEAN DEFAULT TRUE,
    classification_feedback_enabled BOOLEAN DEFAULT FALSE,

    -- Filtering
    minimum_severity VARCHAR(20) DEFAULT 'medium', -- Only send alerts >= this severity

    -- Quiet hours
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME DEFAULT '22:00:00',
    quiet_hours_end TIME DEFAULT '08:00:00',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications: Outbound notification queue
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Notification details
    type VARCHAR(100) NOT NULL, -- 'risk_alert', 'overtime_warning', 'weekly_summary', etc.
    channel VARCHAR(50) NOT NULL, -- 'email', 'push', 'in_app'

    -- Content
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB, -- Additional structured data

    -- Priority
    priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'

    -- Related entities
    related_risk_id UUID REFERENCES risk_alerts(id) ON DELETE CASCADE,
    related_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,

    -- Delivery status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'read'
    sent_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    error_message TEXT,

    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_channel ON notifications(channel);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

-- Audit log: Security and compliance tracking
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Action details
    action VARCHAR(100) NOT NULL, -- 'login', 'sync', 'classify', 'export_data', 'delete_account'
    resource_type VARCHAR(100), -- 'event', 'classification', 'user', etc.
    resource_id VARCHAR(255),

    -- Request details
    ip_address INET,
    user_agent TEXT,

    -- Result
    status VARCHAR(50), -- 'success', 'failed', 'denied'
    error_message TEXT,

    -- Metadata
    metadata JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_classifications_updated_at BEFORE UPDATE ON event_classifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_workload_updated_at BEFORE UPDATE ON daily_workload
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_workload_updated_at BEFORE UPDATE ON weekly_workload
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_risk_alerts_updated_at BEFORE UPDATE ON risk_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active events with classifications
CREATE OR REPLACE VIEW v_classified_events AS
SELECT
    ce.id,
    ce.user_id,
    ce.subject,
    ce.start_time,
    ce.end_time,
    ce.duration_minutes,
    ce.location,
    ce.is_all_day,
    ce.status,
    tt.name AS task_type,
    tt.color_code,
    tt.is_work_time,
    ec.confidence_score,
    ec.classification_method,
    pc.name AS project_name
FROM calendar_events ce
LEFT JOIN event_classifications ec ON ce.id = ec.event_id
LEFT JOIN task_types tt ON ec.task_type_id = tt.id
LEFT JOIN project_categories pc ON ec.project_category_id = pc.id
WHERE ce.is_cancelled = FALSE;

-- View: User active risks summary
CREATE OR REPLACE VIEW v_active_risks AS
SELECT
    ra.id,
    ra.user_id,
    rt.name AS risk_type,
    ra.severity,
    ra.title,
    ra.description,
    ra.detected_date,
    ra.status,
    ra.created_at
FROM risk_alerts ra
JOIN risk_types rt ON ra.risk_type_id = rt.id
WHERE ra.status = 'active'
ORDER BY ra.severity DESC, ra.detected_date DESC;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'Core user accounts with work schedule preferences';
COMMENT ON TABLE oauth_tokens IS 'Encrypted Microsoft Graph OAuth tokens with delta sync tracking';
COMMENT ON TABLE calendar_events IS 'Calendar events synced from Microsoft Graph API';
COMMENT ON TABLE event_classifications IS 'AI-powered task type classifications for events';
COMMENT ON TABLE risk_alerts IS 'Detected workload and burnout risks';
COMMENT ON TABLE daily_workload IS 'Pre-aggregated daily time analytics for performance';
COMMENT ON TABLE notifications IS 'Multi-channel notification queue with retry logic';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Grant permissions (adjust based on your service account)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO smartcol_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartcol_app;

COMMIT;
