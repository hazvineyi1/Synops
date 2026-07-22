import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Add the DB-level integrity constraints the app-level check-then-insert logic can't guarantee under
 * concurrency (the platform runs the same learner on web + WhatsApp, so races are real):
 *   - one gradebook entry per (assignment, user)      -> no drift / last-write nondeterminism
 *   - one VALID credential per (user, module)          -> no double credential
 *   - one funded-seat assignment per (agreement, learner) -> no double-count against a grant
 *
 * The schema is managed by CREATE-IF-NOT-EXISTS + ALTER heals (no migration runner), so we add the
 * indexes here. CREATE UNIQUE INDEX fails if duplicates already exist, so each is preceded by a
 * dedupe that keeps the newest row. Idempotent and cheap once clean (dedupe finds nothing, the
 * index already exists). Runs once at boot, fire-and-forget; never throws.
 */
export async function ensureIntegrityConstraints(): Promise<void> {
  const steps: Array<[string, ReturnType<typeof sql>[]]> = [
    // Soft-lifecycle columns for account archive / delete. Added here (not via a migration runner)
    // so every full-row select of users stays valid the instant the new schema deploys.
    ["users", [
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz`,
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
    ]],
    // Per-item grade type (points | pass_fail | completion) for the configurable gradebook.
    ["gradebook_items", [
      sql`ALTER TABLE gradebook_items ADD COLUMN IF NOT EXISTS grade_type text NOT NULL DEFAULT 'points'`,
    ]],
    ["gradebook_entries", [
      sql`DELETE FROM gradebook_entries a USING gradebook_entries b
          WHERE a.assignment_id = b.assignment_id AND a.user_id = b.user_id AND a.ctid < b.ctid`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS gradebook_entries_assignment_user_uidx
          ON gradebook_entries (assignment_id, user_id)`,
    ]],
    ["credentials", [
      // Keep the most recently issued valid credential per (user, module); demote older valids.
      sql`UPDATE credentials c SET status = 'superseded'
          WHERE status = 'valid' AND EXISTS (
            SELECT 1 FROM credentials c2
            WHERE c2.user_id = c.user_id AND c2.module_id = c.module_id
              AND c2.status = 'valid' AND c2.issued_at > c.issued_at)`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_module_valid_uidx
          ON credentials (user_id, module_id) WHERE status = 'valid'`,
    ]],
    ["funded_seat_assignments", [
      sql`DELETE FROM funded_seat_assignments a USING funded_seat_assignments b
          WHERE a.agreement_id = b.agreement_id AND a.learner_id = b.learner_id AND a.ctid < b.ctid`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS funded_seat_agreement_learner_uidx
          ON funded_seat_assignments (agreement_id, learner_id)`,
    ]],
  ];

  for (const [table, stmts] of steps) {
    try {
      for (const s of stmts) await db.execute(s);
    } catch (err) {
      // A missing table (not yet created) or an odd column is fine — skip and keep the others.
      logger.warn({ err, table }, "integrity-constraint heal skipped");
    }
  }
}
