-- Off-track catch-up plans pushed to The Coach (AI study-coach app) remember the returned
-- magic-link URL, so the learner's "Start catch-up" opens the AI coach straight onto the plan.
-- Idempotent: safe to run more than once.
ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS coach_url text;
