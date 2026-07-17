-- Adaptive multi-modal remediation for the in-LMS Coach: generated flashcards + knowledge
-- questions (grounded in the learner's course content) with SM-2 scheduling, plus gamification.
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS remedial_sets (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  plan_id text,
  course_id text,
  category text NOT NULL,
  learner_name text,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remedial_sets_user_idx ON remedial_sets (user_id);

CREATE TABLE IF NOT EXISTS remedial_flashcards (
  id text PRIMARY KEY,
  set_id text NOT NULL,
  user_id text NOT NULL,
  front text NOT NULL,
  back text NOT NULL,
  hint text,
  "order" integer NOT NULL DEFAULT 0,
  mastery real NOT NULL DEFAULT 0,
  ef real NOT NULL DEFAULT 2.5,
  interval integer NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 0,
  due_date date,
  last_reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remedial_flashcards_set_idx ON remedial_flashcards (set_id);

CREATE TABLE IF NOT EXISTS remedial_questions (
  id text PRIMARY KEY,
  set_id text NOT NULL,
  user_id text NOT NULL,
  prompt text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL,
  explanation text,
  difficulty text NOT NULL DEFAULT 'medium',
  "order" integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  last_choice integer,
  last_correct boolean,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS remedial_questions_set_idx ON remedial_questions (set_id);

CREATE TABLE IF NOT EXISTS coach_gamification (
  user_id text PRIMARY KEY,
  xp integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  last_activity_date date,
  updated_at timestamp NOT NULL DEFAULT now()
);
