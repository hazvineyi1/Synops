import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Boot-time heal: add columns the course builder needs that may not exist yet on an already
 * migrated database. ADD COLUMN IF NOT EXISTS is idempotent and cheap. Never blocks boot.
 */
export async function ensureCourseColumns(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS catalog_description text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS banner_url text`);
  } catch (err) {
    logger.error({ err }, "ensureCourseColumns failed");
  }
}
