-- Funder / sponsor tier (decision doc §10.2): read-only aggregate outcomes scoped to the
-- orgs/programs a funder finances. Additive + idempotent.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside a transaction block, so it lives in its own
-- migration file (the funder_scopes table is created separately in migration-funder-scopes.sql).

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'funder';
