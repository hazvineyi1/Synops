-- Case distribution / assignment chain: Partner -> Organisation -> Learner.
-- Explicit grant at each tier; status rolls up from case_sessions. Additive + idempotent.

CREATE TABLE IF NOT EXISTS case_assignments (
  id                   text PRIMARY KEY,
  case_id              text NOT NULL,
  tier                 text NOT NULL,               -- 'partner' | 'organisation' | 'learner'
  partner_id           text,
  organisation_id      text,
  user_id              text,
  group_id             text,
  parent_assignment_id text,
  assigned_by          text NOT NULL,
  assigned_by_name     text,
  status               text NOT NULL DEFAULT 'assigned', -- assigned | in_progress | completed | revoked
  due_date             timestamp,
  assigned_at          timestamp NOT NULL DEFAULT now(),
  completed_at         timestamp,
  updated_at           timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_assignments_case_idx    ON case_assignments (case_id);
CREATE INDEX IF NOT EXISTS case_assignments_partner_idx ON case_assignments (partner_id);
CREATE INDEX IF NOT EXISTS case_assignments_org_idx     ON case_assignments (organisation_id);
CREATE INDEX IF NOT EXISTS case_assignments_user_idx    ON case_assignments (user_id);
CREATE INDEX IF NOT EXISTS case_assignments_tier_idx    ON case_assignments (tier);
