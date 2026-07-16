-- Named Socratic tutor identity per case. The instructional designer names the tutor and
-- picks a face (a preset key like 'f1'/'m2', or a data:/https image URL for a custom upload)
-- before assigning the training. Additive + idempotent.

ALTER TABLE case_scenarios ADD COLUMN IF NOT EXISTS tutor_name text;
ALTER TABLE case_scenarios ADD COLUMN IF NOT EXISTS tutor_avatar text;
