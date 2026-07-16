-- Activities upgrade: embed/publish + AI-generation rigor + Partner->Org->Learner distribution.
-- Additive + idempotent. Extends interactive_activities and adds embed-links + assignments.

-- New columns on interactive_activities (guarded with IF NOT EXISTS).
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS organisation_id text;
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS source          text NOT NULL DEFAULT 'html';
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS embed_url       text;
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS kind            text NOT NULL DEFAULT 'custom';
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS blooms_level    text;
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS difficulty      text;
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS is_library      boolean NOT NULL DEFAULT false;
ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS tags            text[];

CREATE INDEX IF NOT EXISTS interactive_activities_org_idx ON interactive_activities (organisation_id);

-- Public embed links (mirrors case_embed_links).
CREATE TABLE IF NOT EXISTS activity_embed_links (
  id              text PRIMARY KEY,
  activity_id     text NOT NULL,
  organisation_id text,
  created_by      text NOT NULL,
  token           text NOT NULL UNIQUE,
  label           text,
  expires_at      timestamp,
  is_active       boolean NOT NULL DEFAULT true,
  access_count    numeric(12,0) NOT NULL DEFAULT 0,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_embed_links_activity_idx ON activity_embed_links (activity_id);

-- Distribution chain (mirrors case_assignments).
CREATE TABLE IF NOT EXISTS activity_assignments (
  id                   text PRIMARY KEY,
  activity_id          text NOT NULL,
  tier                 text NOT NULL,
  partner_id           text,
  organisation_id      text,
  user_id              text,
  group_id             text,
  parent_assignment_id text,
  assigned_by          text NOT NULL,
  assigned_by_name     text,
  status               text NOT NULL DEFAULT 'assigned',
  due_date             timestamp,
  assigned_at          timestamp NOT NULL DEFAULT now(),
  completed_at         timestamp,
  updated_at           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_assignments_activity_idx ON activity_assignments (activity_id);
CREATE INDEX IF NOT EXISTS activity_assignments_partner_idx  ON activity_assignments (partner_id);
CREATE INDEX IF NOT EXISTS activity_assignments_org_idx      ON activity_assignments (organisation_id);
CREATE INDEX IF NOT EXISTS activity_assignments_user_idx     ON activity_assignments (user_id);
