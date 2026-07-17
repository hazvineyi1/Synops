-- Let learners add their own study materials (documents/links) that the Coach turns into
-- practice. remedial_sets gains a source ('class' | 'upload') and a display title.
-- Idempotent: safe to run more than once.
ALTER TABLE remedial_sets ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'class';
ALTER TABLE remedial_sets ADD COLUMN IF NOT EXISTS title text;
