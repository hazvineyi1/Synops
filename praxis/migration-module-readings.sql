-- Module readings: documents parsed to text (no binary storage) and external links,
-- attached to a module and shown in the learner's Readings tab.
-- Idempotent. TYPE it in the Railway Postgres Console (do NOT paste).
-- NOTE: "order" is a reserved word and must stay quoted.

CREATE TABLE IF NOT EXISTS module_readings (
  id text PRIMARY KEY,
  module_id text NOT NULL,
  course_id text,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'document',
  source_url text,
  filename text,
  content text,
  chars integer NOT NULL DEFAULT 0,
  "order" integer NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_readings_module_idx ON module_readings (module_id);
