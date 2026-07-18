-- Real, authored transcripts for video beats. Kept separate from `narration`: narration is
-- the script a beat was generated from; a transcript is what we tell the learner the video
-- actually says. Only a stored transcript may be labelled "Transcript" in the UI.
-- Idempotent. TYPE it in the Railway Postgres Console (do NOT paste -- bracketed paste
-- inserts control characters and the command fails).

ALTER TABLE beats ADD COLUMN IF NOT EXISTS transcript text;
