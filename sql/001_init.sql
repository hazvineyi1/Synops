-- Digital Justice Hub pilot schema (v1)
-- Learner free text lives in progress.state and submissions.snapshot.
-- Production note: field-level encryption and Ukraine-hosted Postgres are required before live use.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  prole         text NOT NULL,                        -- professional role (not a permission)
  route         text NOT NULL CHECK (route IN ('inv','pro','jud')),
  role          text NOT NULL DEFAULT 'learner' CHECK (role IN ('learner','reviewer','moderator','editor','admin')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
  institution   text,
  unit          text,
  lang          text NOT NULL DEFAULT 'uk' CHECK (lang IN ('uk','en')),
  pw_hash       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  approved_at   timestamptz,
  approved_by   uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Learner-entered working state, saved incrementally with optimistic concurrency (seq).
CREATE TABLE IF NOT EXISTS progress (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,
  seq         integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

-- Server-graded facts. The client cannot assert these.
CREATE TABLE IF NOT EXISTS item_results (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  item_id     text NOT NULL,                          -- D01, D02, S03, VC01..VC04, K1..K4, S05, S08
  first_value text,
  latest_value text,
  correct     boolean,
  attempts    integer NOT NULL DEFAULT 0,
  reflection  text,
  passed_at   timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id, item_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  key_version text NOT NULL,
  answers     jsonb NOT NULL,
  correct     integer NOT NULL,
  q5_correct  boolean NOT NULL,
  rule_met    boolean GENERATED ALWAYS AS (correct >= 4 AND q5_correct) STORED,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_exposures (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  reason      text NOT NULL,                          -- self_study_before_submission | post_submission
  at          timestamptz NOT NULL DEFAULT now()
);

-- Immutable submissions; idempotent per (user, key).
CREATE TABLE IF NOT EXISTS submissions (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id       text NOT NULL,
  idem_key        text NOT NULL,
  receipt         text NOT NULL UNIQUE,
  route           text NOT NULL,
  attempt         integer NOT NULL,
  content_version text NOT NULL,
  rubric_version  text NOT NULL,
  model_exposed   boolean NOT NULL,
  snapshot        jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idem_key)
);
CREATE OR REPLACE FUNCTION forbid_update() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'immutable record'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS submissions_immutable ON submissions;
CREATE TRIGGER submissions_immutable BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION forbid_update();

CREATE TABLE IF NOT EXISTS chat_messages (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('learner','guide')),
  source      text NOT NULL DEFAULT 'learner' CHECK (source IN ('learner','ai','authored','blocked')),
  screen      text,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_user_lesson ON chat_messages(user_id, lesson_id, id);

-- Operational events only: never learner free text.
CREATE TABLE IF NOT EXISTS audit_events (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  user_id   uuid,
  action    text NOT NULL,
  target    text
);
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append-only'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_append_only ON audit_events;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_change();
