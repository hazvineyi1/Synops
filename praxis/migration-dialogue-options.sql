-- Selectable answer options for coach questions: the learner can pick choices instead of typing.
-- options = the answer choices; select_mode = 'single' | 'multi' | 'free'. Idempotent.
ALTER TABLE dialogue_turns ADD COLUMN IF NOT EXISTS options jsonb;
ALTER TABLE dialogue_turns ADD COLUMN IF NOT EXISTS select_mode text;
