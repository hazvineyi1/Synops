-- Configurable, content-agnostic AI persona per case. The author sets who the AI is
-- (e.g. a small-business finance mentor, a growth-marketing coach, a plain-language
-- business-law advisor) so the Socratic engine adopts the right expert lens for whatever
-- entrepreneurship skill the case teaches. Nothing about the domain is hardcoded.
-- Additive + idempotent.

ALTER TABLE case_scenarios ADD COLUMN IF NOT EXISTS ai_persona text;
