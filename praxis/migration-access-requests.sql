-- Access requests (SA-2): public "request access" submissions reviewed by super admins.
-- Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE access_request_status AS ENUM ('pending', 'approved', 'denied');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS access_requests (
  id                text PRIMARY KEY,
  first_name        text NOT NULL,
  last_name         text,
  email             text NOT NULL,
  organisation_name text,
  requested_role    text NOT NULL DEFAULT 'org_admin',
  message           text,
  status            access_request_status NOT NULL DEFAULT 'pending',
  reviewed_by_id    text,
  reviewer_note     text,
  reviewed_at       timestamp,
  created_at        timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_requests_status_idx ON access_requests (status);
