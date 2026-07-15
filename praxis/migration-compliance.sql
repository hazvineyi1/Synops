-- Accreditation compliance (decision doc §10.4): QCTO/SETA unit standards + mapping to
-- content. Portfolio-of-evidence reuses the existing evidence_records table. Additive + idempotent.

DO $$ BEGIN
  CREATE TYPE compliance_framework AS ENUM ('qcto', 'seta', 'nqf', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS unit_standards (
  id           text PRIMARY KEY,
  code         text NOT NULL,
  title        text NOT NULL,
  framework    compliance_framework NOT NULL DEFAULT 'qcto',
  nqf_level    integer,
  credits      integer,
  description  text,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_standards_code_idx ON unit_standards (code);

CREATE TABLE IF NOT EXISTS unit_standard_mappings (
  id               text PRIMARY KEY,
  unit_standard_id text NOT NULL,
  target_type      text NOT NULL,
  target_id        text NOT NULL,
  created_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unit_standard_mappings_std_idx ON unit_standard_mappings (unit_standard_id);
CREATE INDEX IF NOT EXISTS unit_standard_mappings_target_idx ON unit_standard_mappings (target_type, target_id);
