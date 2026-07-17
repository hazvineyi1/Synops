-- When a coaching session is launched from a catch-up (off-track) plan item, remember the weak
-- area so every turn of the Socratic dialogue stays focused on rebuilding it. Additive + idempotent.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS remedial_focus text;
