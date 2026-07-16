-- Per-course gradebook grading config: category + type weighting and letter-grade bands.
-- Additive + idempotent. See lib/db/src/schema/gradebook.ts (gradebook_settings).

CREATE TABLE IF NOT EXISTS gradebook_settings (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  course_id         text NOT NULL,
  weighting_enabled boolean NOT NULL DEFAULT false,
  summative_weight  integer NOT NULL DEFAULT 100,
  formative_weight  integer NOT NULL DEFAULT 0,
  category_weights  jsonb NOT NULL DEFAULT '{}'::jsonb,
  letters_enabled   boolean NOT NULL DEFAULT false,
  letter_bands      jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by        text,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gradebook_settings_course_uq ON gradebook_settings (course_id);

-- Verify:
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'gradebook_settings';
