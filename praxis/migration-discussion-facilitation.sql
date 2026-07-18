-- AI-facilitated, multilingual discussions with real participation requirements.
--
-- discussions.module_id      : optional module scoping. NULL = course-wide, which is what
--                              every existing row is, so nothing changes for them.
-- discussions.ai_facilitated : an AI facilitator posts a prodding follow-up after a learner
--                              contributes.
-- discussions.language       : language the thread was authored in.
-- min/max_initial_words, min_reply_words, required_interactions
--                            : participation rule, per thread rather than hard-coded, so a
--                              facilitator can move the bar without a redeploy. Defaults
--                              encode the standard ask: one initial post of 100-150 words
--                              then four further replies of 50+ words (5 interactions).
--
-- discussion_replies.is_ai_facilitator : posted by the AI, never counts towards a learner's
--                              own requirement.
-- discussion_replies.language, .word_count : source language for translation, and the count
--                              the post was judged on at write time.
--
-- Idempotent and additive. TYPE it in the Railway Postgres Console (do NOT paste --
-- bracketed paste inserts control characters and the command fails).

ALTER TABLE discussions ADD COLUMN IF NOT EXISTS module_id text;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS ai_facilitated boolean NOT NULL DEFAULT false;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS min_initial_words integer NOT NULL DEFAULT 100;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS max_initial_words integer NOT NULL DEFAULT 150;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS min_reply_words integer NOT NULL DEFAULT 50;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS required_interactions integer NOT NULL DEFAULT 5;

ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS is_ai_facilitator boolean NOT NULL DEFAULT false;
ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
ALTER TABLE discussion_replies ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS discussions_module_idx ON discussions (module_id);
