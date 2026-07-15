-- Adds the `instructional_designer` role: the Instructional Design Hub tier from the
-- Praxis role & permission decision doc. Additive and idempotent -- safe on prod.
--
-- NOTE: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so this must
-- be a standalone statement (APPLY-MIGRATION runs each migration-*.sql on its own).
-- IF NOT EXISTS makes re-runs a no-op (Postgres 12+).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'instructional_designer';
