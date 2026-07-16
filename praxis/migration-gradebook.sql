-- Unified gradebook: source-agnostic column registry + per-cell overlay + off-track alerts.
-- Pulls assignments, cases, interactive activities and manual items into one gradebook.
-- Additive + idempotent (safe to re-run). See lib/db/src/schema/gradebook.ts.

-- ── Column registry ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gradebook_items (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id        text NOT NULL,
  source_type      text NOT NULL,                 -- 'assignment' | 'case' | 'activity' | 'manual'
  source_id        text,                          -- assignment/case/activity id; null for manual
  title            text NOT NULL,
  category         text NOT NULL DEFAULT 'General',
  item_type        text NOT NULL DEFAULT 'summative', -- 'formative' | 'summative'
  points_possible  numeric(7,2) NOT NULL DEFAULT 100,
  due_date         timestamp,
  include_in_grade boolean NOT NULL DEFAULT true,
  position         integer NOT NULL DEFAULT 0,
  created_by       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gradebook_items_course_idx ON gradebook_items (course_id);
CREATE INDEX IF NOT EXISTS gradebook_items_source_idx ON gradebook_items (source_type, source_id);
-- One inclusion per (course, source). NULL source_id (manual) is treated as distinct by
-- Postgres, so a course can hold many manual columns while source-backed rows stay unique.
CREATE UNIQUE INDEX IF NOT EXISTS gradebook_items_course_source_uq
  ON gradebook_items (course_id, source_type, source_id);

-- ── Per-(item, learner) overlay: manual score and/or feedback note ───────────────
CREATE TABLE IF NOT EXISTS gradebook_cells (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id      text NOT NULL,
  user_id      text NOT NULL,
  manual_score numeric(7,2),
  note         text,
  updated_by   text,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gradebook_cells_item_user_uq ON gradebook_cells (item_id, user_id);
CREATE INDEX IF NOT EXISTS gradebook_cells_user_idx ON gradebook_cells (user_id);

-- ── Off-track alert state per (course, learner) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS gradebook_alerts (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id    text NOT NULL,
  user_id      text NOT NULL,
  status       text NOT NULL DEFAULT 'on_track', -- 'on_track' | 'at_risk' | 'off_track'
  reasons      text[] NOT NULL DEFAULT '{}',      -- mastery_low | trend_down | missing_summative
  mastery_pct  numeric(5,2),
  plan_id      text,
  notified_at  timestamp,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now(),
  resolved_at  timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS gradebook_alerts_course_user_uq ON gradebook_alerts (course_id, user_id);
CREATE INDEX IF NOT EXISTS gradebook_alerts_status_idx ON gradebook_alerts (status);

-- ── coach_plans: allow a plan to target a course + record its origin ──────────────
ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS course_id text;
ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'coach';

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'gradebook_items';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_plans' AND column_name IN ('course_id','source');
