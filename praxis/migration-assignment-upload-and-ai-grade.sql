-- Assignment file submissions (parsed to text) and AI-drafted assessments.
--
-- parsed_text / source_filename : an uploaded document is parsed at submit time and only
--   the text is kept -- there is no object storage in this stack. Kept separate from
--   `body` so what the learner typed stays distinguishable from what their file contained.
--
-- ai_score / ai_feedback / ai_rubric_assessment / ai_graded_at : a PROVISIONAL assessment.
--   Deliberately NOT written to score/feedback/rubric_assessment, because grading fires
--   onGradeEvent -- which recomputes off-track status, auto-generates study plans and
--   emails staff and the learner. An AI score landing straight in the gradebook could flag
--   a learner off-track and email them about it on the strength of a model's opinion.
--   Staff confirm the draft; confirming is what makes it a real grade.
--
-- Idempotent and additive. TYPE it in the Railway Postgres Console (do NOT paste --
-- bracketed paste inserts control characters and the command fails).

ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS parsed_text text;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS source_filename text;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS ai_score numeric(7,2);
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS ai_feedback text;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS ai_rubric_assessment jsonb;
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS ai_graded_at timestamp;
