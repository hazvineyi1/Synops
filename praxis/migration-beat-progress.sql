-- Synops Praxis: beat-level progress tracking.
--
-- Run ONCE against the Praxis Postgres before/with the progress feature.
-- Additive only: creates one new table. Touches no existing table, drops nothing.
-- Safe to re-run (IF NOT EXISTS throughout).
--
-- Why this table matters: without it the LMS had no record of what a learner had
-- actually seen. `enrolments.completed_at` existed but nothing ever wrote to it, so
-- course completion %, credential issuance and the org_admin workforce dashboard had
-- nothing real to stand on.

CREATE TABLE IF NOT EXISTS beat_progress (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        text NOT NULL,
  beat_id        text NOT NULL,
  -- Denormalised so completion queries don't need a 3-way join on every request.
  -- Beats never move between modules/courses, so these cannot drift.
  module_id      text NOT NULL,
  course_id      text NOT NULL,
  -- Cumulative dwell time. Additive across visits; feeds SETA / B-BBEE
  -- skills-development "training hours" reporting.
  seconds_spent  integer NOT NULL DEFAULT 0,
  first_viewed_at timestamp NOT NULL DEFAULT now(),
  last_viewed_at  timestamp NOT NULL DEFAULT now()
);

-- Makes marking progress IDEMPOTENT: the client can report "viewed" on every render
-- without double-counting, and the API upserts on this constraint. Deliberate -- it
-- removes the need for client-side bookkeeping, which always drifts.
CREATE UNIQUE INDEX IF NOT EXISTS beat_progress_user_beat_unique
  ON beat_progress (user_id, beat_id);

CREATE INDEX IF NOT EXISTS beat_progress_user_course_idx
  ON beat_progress (user_id, course_id);

CREATE INDEX IF NOT EXISTS beat_progress_user_module_idx
  ON beat_progress (user_id, module_id);

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'beat_progress' ORDER BY ordinal_position;
