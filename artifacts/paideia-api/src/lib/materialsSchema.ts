import { db } from "@workspace/paideia-db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Boot-time heal for the teacher materials table (same pattern as ensureMfaSchema): a deploy boots
 * as soon as it builds, so this CREATE-IF-NOT-EXISTS pass makes the table exist immediately.
 * Idempotent; never throws.
 */
export async function ensureMaterialsSchema(): Promise<void> {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS copilot_materials (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      teacher_id uuid NOT NULL,
      title text NOT NULL,
      source_type text NOT NULL,
      source_meta text,
      content_text text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'ready',
      error_message text,
      char_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS copilot_materials_teacher_idx ON copilot_materials (teacher_id)`);
  } catch (err) {
    logger.error({ err }, "ensureMaterialsSchema failed");
  }
}
