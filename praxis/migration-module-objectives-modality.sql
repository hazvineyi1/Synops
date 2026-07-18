-- Module-level learning objectives + delivery modality (Phase 1 of the module
-- learning-experience redesign). Additive and idempotent; safe to run more than once.
-- NOTE: type in the Railway Postgres Console (do NOT paste -- bracketed paste mangles it).

-- 1. Modality enum (async | sync | hybrid). Ignore the error if it already exists.
CREATE TYPE module_modality AS ENUM ('async', 'sync', 'hybrid');

-- 2. Columns on modules.
ALTER TABLE modules ADD COLUMN IF NOT EXISTS module_modality module_modality NOT NULL DEFAULT 'async';
ALTER TABLE modules ADD COLUMN IF NOT EXISTS objectives text[] NOT NULL DEFAULT '{}';
