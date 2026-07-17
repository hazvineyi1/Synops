-- Coach intervention layer on gradebook_alerts.
-- Additive + idempotent. Lets a coach annotate a flagged learner's remediation, store
-- AI-generated coaching talking points, and track resolution — all on the existing alert row.

ALTER TABLE gradebook_alerts ADD COLUMN IF NOT EXISTS coach_note text;
ALTER TABLE gradebook_alerts ADD COLUMN IF NOT EXISTS coach_assist jsonb;
ALTER TABLE gradebook_alerts ADD COLUMN IF NOT EXISTS coach_assist_at timestamp;
