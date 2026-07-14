-- Interactive HTML activities. Additive and idempotent -- safe to run against prod.

DO $$ BEGIN
  CREATE TYPE activity_submission_status AS ENUM ('submitted', 'reviewed', 'approved');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS interactive_activities (
  id                  text PRIMARY KEY,
  course_id           text,
  module_id           text,
  title               text NOT NULL,
  instructions        text,
  html                text NOT NULL DEFAULT '',
  max_score           numeric(7,2) NOT NULL DEFAULT 100,
  published           boolean NOT NULL DEFAULT false,
  created_by_user_id  text,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_submissions (
  id            text PRIMARY KEY,
  activity_id   text NOT NULL,
  user_id       text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  score         numeric(7,2),
  status        activity_submission_status NOT NULL DEFAULT 'submitted',
  feedback      text,
  reviewed_by   text,
  submitted_at  timestamp NOT NULL DEFAULT now(),
  reviewed_at   timestamp
);

CREATE INDEX IF NOT EXISTS activity_submissions_activity_idx ON activity_submissions (activity_id);
CREATE INDEX IF NOT EXISTS activity_submissions_user_idx ON activity_submissions (user_id);
