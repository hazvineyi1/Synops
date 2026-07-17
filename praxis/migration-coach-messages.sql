-- Two-way coach <-> learner conversation attached to an intervention (gradebook alert).
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS coach_messages (
  id text PRIMARY KEY,
  alert_id text NOT NULL,
  from_user_id text NOT NULL,
  from_role text NOT NULL DEFAULT 'coach',
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_messages_alert_idx ON coach_messages (alert_id, created_at);
