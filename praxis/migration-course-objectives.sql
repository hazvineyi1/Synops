-- Course-level learning objectives (shown on the learner course Overview).
-- Additive and idempotent. TYPE it in the Railway Postgres Console (do NOT paste).

ALTER TABLE courses ADD COLUMN IF NOT EXISTS objectives text[] NOT NULL DEFAULT '{}';
