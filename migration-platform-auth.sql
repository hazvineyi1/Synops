-- Synops Praxis: first-party auth + platform console.
--
-- Replaces Clerk with sessions we own, and adds the substrate the platform console
-- needs: impersonation, master password resets, suspension, login activity, API keys.
--
-- Run ONCE against the Praxis Postgres. Additive and idempotent (IF NOT EXISTS).
-- The only change to an existing table is on `users`: new columns, plus DROPPING the
-- NOT NULL on clerk_id. Nothing is deleted, no rows are touched.

-- ── users ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('invited', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamp;

-- Identity moved in-house: a user no longer has to exist in Clerk. Existing rows keep
-- their clerk_id for traceability; new users are created without one.
ALTER TABLE users ALTER COLUMN clerk_id DROP NOT NULL;

-- ── sessions we own ──────────────────────────────────────────────────────────
-- NOTE: `auth_sessions`, NOT `sessions`. `sessions` is already taken by LEARNING
-- sessions (the Socratic dialogue). Colliding those two would be genuinely dangerous.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token           text NOT NULL UNIQUE,
  user_id         text NOT NULL,
  -- Set when a super_admin is impersonating: holds the ADMIN's user id, so actions
  -- taken while impersonating can be attributed to the real actor.
  impersonator_id text,
  ip_address      text,
  user_agent      text,
  expires_at      timestamp NOT NULL,
  revoked_at      timestamp,
  created_at      timestamp NOT NULL DEFAULT now(),
  last_seen_at    timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions (expires_at);

-- ── password resets ──────────────────────────────────────────────────────────
-- Only a SHA-256 HASH of the token is stored, never the token: a database leak must
-- not be convertible into an account takeover.
CREATE TABLE IF NOT EXISTS password_resets (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id            text NOT NULL,
  token_hash         text NOT NULL UNIQUE,
  issued_by          text NOT NULL DEFAULT 'self_service',  -- self_service | admin
  issued_by_user_id  text,
  expires_at         timestamp NOT NULL,
  used_at            timestamp,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

-- ── login activity ───────────────────────────────────────────────────────────
-- Records FAILURES as well as successes. A trail that only shows successes cannot
-- reveal credential stuffing, and is useless to support ("why can't they get in?").
DO $$ BEGIN
  CREATE TYPE login_outcome AS ENUM
    ('success', 'bad_password', 'unknown_email', 'suspended', 'impersonated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS login_events (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         text,
  -- Captured even when no user matches, so unknown-email attempts are visible.
  email           text,
  outcome         login_outcome NOT NULL,
  ip_address      text,
  user_agent      text,
  impersonator_id text,
  created_at      timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_user_idx ON login_events (user_id);
CREATE INDEX IF NOT EXISTS login_events_created_idx ON login_events (created_at);

-- ── API keys ─────────────────────────────────────────────────────────────────
-- Stores only a hash; the plaintext key is shown exactly once at creation. `prefix`
-- is the visible, non-secret head of the key so it can be identified in a list.
CREATE TABLE IF NOT EXISTS api_keys (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name               text NOT NULL,
  key_hash           text NOT NULL UNIQUE,
  prefix             text NOT NULL,
  partner_id         text,
  organisation_id    text,
  created_by_user_id text,
  scopes             text[] NOT NULL DEFAULT '{}',
  last_used_at       timestamp,
  expires_at         timestamp,
  revoked_at         timestamp,
  created_at         timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_keys_partner_idx ON api_keys (partner_id);

-- ── Bootstrap the first super admin ──────────────────────────────────────────
-- Existing Clerk users have no password yet, so nobody can sign in after this
-- migration until someone sets one. Promote your account, then issue yourself a reset
-- link from the console (or set a password directly via the app once you can log in).
--
--   UPDATE users SET role = 'super_admin', status = 'active'
--   WHERE email = 'you@example.com';
--
-- To verify:
--   SELECT email, role, status, (password_hash IS NOT NULL) AS has_password FROM users;
