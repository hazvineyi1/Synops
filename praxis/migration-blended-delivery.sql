-- Blended-delivery tracking (decision doc §10.3): in-person / virtual / mentoring /
-- workshop sessions plus per-learner attendance and coaching hours. Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE delivery_session_type AS ENUM ('in_person', 'virtual', 'mentoring', 'workshop');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'excused', 'late');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS delivery_sessions (
  id                text PRIMARY KEY,
  tenant_id         text NOT NULL,
  course_id         text,
  facilitator_id    text,
  title             text NOT NULL,
  session_type      delivery_session_type NOT NULL DEFAULT 'in_person',
  scheduled_at      timestamp NOT NULL,
  duration_minutes  integer NOT NULL DEFAULT 60,
  location          text,
  notes             text,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_sessions_tenant_idx ON delivery_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS delivery_sessions_course_idx ON delivery_sessions (course_id);

CREATE TABLE IF NOT EXISTS attendance_records (
  id              text PRIMARY KEY,
  session_id      text NOT NULL,
  user_id         text NOT NULL,
  status          attendance_status NOT NULL DEFAULT 'present',
  coaching_hours  numeric,
  recorded_by     text,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON attendance_records (session_id);
CREATE INDEX IF NOT EXISTS attendance_records_user_idx ON attendance_records (user_id);
