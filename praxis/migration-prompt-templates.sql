-- Per-org reusable Socratic prompt templates (SA-3). Additive + idempotent.

CREATE TABLE IF NOT EXISTS org_prompt_templates (
  id               text PRIMARY KEY,
  organisation_id  text NOT NULL,
  created_by       text NOT NULL,
  created_by_name  text,
  title            text NOT NULL,
  category         text NOT NULL DEFAULT 'Our templates',
  description      text NOT NULL DEFAULT '',
  prompt_text      text NOT NULL,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_prompt_templates_org_idx ON org_prompt_templates (organisation_id);
