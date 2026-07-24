import { db } from "@workspace/paideia-db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Boot-time heal for the Coach MFA tables. Same pattern as ensurePopiaSchema: Paideia reconciles
 * with drizzle-kit push, but a deploy boots as soon as it builds, so this CREATE-IF-NOT-EXISTS pass
 * makes the MFA tables exist the instant the build starts. Idempotent; never throws.
 */
export async function ensureMfaSchema(): Promise<void> {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS copilot_mfa_factors (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id uuid NOT NULL,
      type text NOT NULL,
      label text NOT NULL DEFAULT '',
      secret text,
      credential jsonb,
      email text,
      verified_at timestamptz,
      last_used_at timestamptz,
      preferred boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS copilot_mfa_factors_teacher_idx ON copilot_mfa_factors (teacher_id)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS copilot_mfa_backup_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id uuid NOT NULL,
      code_hash text NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS copilot_mfa_backup_codes_teacher_idx ON copilot_mfa_backup_codes (teacher_id)`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS copilot_mfa_challenges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id uuid NOT NULL,
      purpose text NOT NULL,
      code_hash text,
      challenge text,
      destination text,
      expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS copilot_mfa_challenges_teacher_purpose_idx ON copilot_mfa_challenges (teacher_id, purpose)`);
  } catch (err) {
    logger.warn({ err }, "MFA schema heal skipped");
  }
}
