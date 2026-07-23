import { db } from "@workspace/paideia-db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Boot-time heal for the POPIA tables/columns.
 *
 * Paideia's schema is normally reconciled with `drizzle-kit push` rather than a
 * migration runner, and there is no other boot DDL. But deploys land as soon as
 * a commit builds on Railway, so code that queries study_consents /
 * study_deletion_requests could run before someone runs push. This CREATE/ALTER
 * IF NOT EXISTS pass makes the new schema exist the instant the build boots.
 * Idempotent and cheap; never throws (a failure just logs and is retried by the
 * next boot or an explicit push).
 */
export async function ensurePopiaSchema(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE study_users ADD COLUMN IF NOT EXISTS consent_version text`);
    await db.execute(sql`ALTER TABLE study_users ADD COLUMN IF NOT EXISTS consented_at timestamptz`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS study_consents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      app text NOT NULL DEFAULT 'coach',
      policy_version text NOT NULL,
      consented_at timestamptz NOT NULL DEFAULT now(),
      ip text,
      user_agent text
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS study_consents_user_idx ON study_consents (user_id)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS study_deletion_requests (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      reason text,
      requested_at timestamptz NOT NULL DEFAULT now(),
      decided_by uuid,
      decided_at timestamptz,
      retention_note text
    )`);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS study_deletion_requests_status_idx ON study_deletion_requests (status)`,
    );
  } catch (err) {
    logger.warn({ err }, "POPIA schema heal skipped");
  }
}
