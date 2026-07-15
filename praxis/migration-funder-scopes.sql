-- Funder scope mapping (decision doc §10.2). One row per (funder, organisation), optionally
-- narrowed to a funded program (course_id). Aggregate-only; never exposes learner rows.
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS funder_scopes (
  id               text PRIMARY KEY,
  funder_id        text NOT NULL,
  organisation_id  text NOT NULL,
  course_id        text,
  label            text,
  created_at       timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS funder_scopes_funder_idx ON funder_scopes (funder_id);
CREATE INDEX IF NOT EXISTS funder_scopes_org_idx ON funder_scopes (organisation_id);
