-- Authored case / scenario Socratic learning vehicle (ported from Sokratify).
-- Cases + rubrics (optionally linked to QCTO/SETA unit standards) + case sessions with
-- end-of-session AI analysis + signed public embed links. Additive + idempotent.

CREATE TABLE IF NOT EXISTS case_scenarios (
  id                   text PRIMARY KEY,
  organisation_id      text,
  module_id            text,
  created_by           text NOT NULL,
  created_by_name      text,
  title                text NOT NULL,
  learning_objective   text,
  context_block        text NOT NULL DEFAULT '',
  opening_question     text,
  focus_areas          text[],
  ai_constraints       text,
  guiding_instructions text,
  difficulty           text NOT NULL DEFAULT 'intermediate',
  blooms_level         text,
  prompt_limit         integer NOT NULL DEFAULT 8,
  socratic_style       text NOT NULL DEFAULT 'maieutic',
  ai_tone              text NOT NULL DEFAULT 'standard',
  is_library           boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'draft',
  tags                 text[],
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_scenarios_org_idx ON case_scenarios (organisation_id);
CREATE INDEX IF NOT EXISTS case_scenarios_status_idx ON case_scenarios (status);

CREATE TABLE IF NOT EXISTS case_rubrics (
  id              text PRIMARY KEY,
  case_id         text NOT NULL,
  organisation_id text,
  criteria        jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_points    integer NOT NULL DEFAULT 100,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_rubrics_case_idx ON case_rubrics (case_id);

CREATE TABLE IF NOT EXISTS case_sessions (
  id                   text PRIMARY KEY,
  case_id              text NOT NULL,
  organisation_id      text,
  embed_link_id        text,
  user_id              text,
  learner_name         text,
  messages             jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_count         integer NOT NULL DEFAULT 0,
  prompt_limit         integer NOT NULL DEFAULT 8,
  status               text NOT NULL DEFAULT 'in_progress',
  engagement_score     integer,
  engagement_narrative text,
  concepts_addressed   text[],
  reasoning_strengths  text[],
  development_areas    text[],
  rubric_scores        jsonb,
  created_at           timestamp NOT NULL DEFAULT now(),
  completed_at         timestamp
);
CREATE INDEX IF NOT EXISTS case_sessions_case_idx ON case_sessions (case_id);
CREATE INDEX IF NOT EXISTS case_sessions_user_idx ON case_sessions (user_id);

CREATE TABLE IF NOT EXISTS case_embed_links (
  id              text PRIMARY KEY,
  case_id         text NOT NULL,
  organisation_id text,
  created_by      text NOT NULL,
  token           text NOT NULL UNIQUE,
  label           text,
  expires_at      timestamp,
  is_active       boolean NOT NULL DEFAULT true,
  access_count    integer NOT NULL DEFAULT 0,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_embed_links_case_idx ON case_embed_links (case_id);
CREATE INDEX IF NOT EXISTS case_embed_links_token_idx ON case_embed_links (token);

CREATE TABLE IF NOT EXISTS case_link_access (
  id            text PRIMARY KEY,
  embed_link_id text NOT NULL,
  case_id       text NOT NULL,
  ip_address    text,
  user_agent    text,
  created_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_link_access_link_idx ON case_link_access (embed_link_id);
