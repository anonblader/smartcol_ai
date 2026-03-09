-- ============================================================
-- Migration 004: Classification Feedback (Active Learning)
-- Stores user corrections to AI event classifications.
-- Used to improve future classifications via pattern matching.
-- ============================================================

CREATE TABLE IF NOT EXISTS classification_feedback (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id               UUID        NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    user_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_subject          VARCHAR(500),
    original_task_type_id  INTEGER     REFERENCES task_types(id),
    corrected_task_type_id INTEGER     NOT NULL REFERENCES task_types(id),
    original_confidence    DECIMAL(4,3),
    original_method        VARCHAR(50),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id)  -- one correction per event; re-correction replaces previous
);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_user
    ON classification_feedback(user_id);

CREATE INDEX IF NOT EXISTS idx_classification_feedback_subject
    ON classification_feedback(user_id, event_subject);
