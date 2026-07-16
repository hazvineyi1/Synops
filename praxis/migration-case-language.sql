-- Multilingual Socratic tutor. The author sets a default language on the case; a learner
-- can choose their language for a session. Codes: en, zu (isiZulu), xh (isiXhosa),
-- af (Afrikaans), sn (Shona). Additive + idempotent.

ALTER TABLE case_scenarios ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE case_sessions  ADD COLUMN IF NOT EXISTS language text;
