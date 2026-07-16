-- When a learner runs a case in a language other than the case's authored default, the
-- fact pattern and learning objective are translated into that language and cached on the
-- session so the Case-facts panel reads in the learner's language. Additive + idempotent.

ALTER TABLE case_sessions ADD COLUMN IF NOT EXISTS translated_context   text;
ALTER TABLE case_sessions ADD COLUMN IF NOT EXISTS translated_objective text;
