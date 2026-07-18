-- Workshops at module level. Extends the EXISTING delivery_sessions table rather than
-- adding a parallel "workshops" table: session_type already has a 'workshop' value, and
-- attendance/coaching-hours reporting already aggregates from attendance_records.
--
-- module_id: nullable link to a specific module, so a sync/hybrid module can show its own
--            workshop in the learner's Workshop tab. Null = course-wide or standalone.
-- join_url:  joining link for a virtual session, kept distinct from `location` (free text
--            for a physical venue) so the learner knows which one they are looking at.
--
-- Idempotent. TYPE it in the Railway Postgres Console (do NOT paste -- bracketed paste
-- inserts control characters and the command fails).

ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS module_id text;
ALTER TABLE delivery_sessions ADD COLUMN IF NOT EXISTS join_url text;

CREATE INDEX IF NOT EXISTS delivery_sessions_module_idx ON delivery_sessions (module_id);
