-- ============================================================
-- Migration 003: Email Alert Settings
-- Stores admin-configurable on/off switches for each email
-- alert type, along with last-triggered metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_alert_settings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_key       VARCHAR(50) NOT NULL UNIQUE,
    alert_name      VARCHAR(100) NOT NULL,
    description     TEXT,
    category        VARCHAR(50) NOT NULL DEFAULT 'alerts',
    enabled         BOOLEAN     NOT NULL DEFAULT true,
    last_triggered  TIMESTAMPTZ,
    trigger_count   INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the 6 default alert types
INSERT INTO email_alert_settings (alert_key, alert_name, description, category, enabled) VALUES
  ('risk_detected',
   'New Risk Alert',
   'Email engineer when any new workload risk is detected (high workload, burnout, meeting overload, etc.)',
   'risk', true),

  ('risk_acknowledged',
   'Risk Acknowledged',
   'Email engineer when their manager acknowledges a risk alert on their account',
   'risk', true),

  ('risk_dismissed',
   'Risk Dismissed',
   'Email engineer when their manager dismisses a risk alert on their account',
   'risk', false),

  ('burnout_warning',
   'Burnout Score Warning',
   'Email engineer when their ML burnout risk score exceeds 75 out of 100',
   'ml', true),

  ('high_workload_day',
   'High Workload Day Alert',
   'Email engineer when a single working day exceeds 10 hours (600 minutes)',
   'workload', false),

  ('weekly_digest',
   'Weekly Workload Digest',
   'Send each engineer a weekly summary of their workload and risk status every Monday',
   'digest', false)

ON CONFLICT (alert_key) DO NOTHING;
