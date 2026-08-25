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
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS architect_blueprint text`);
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS overview_config text`);
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS source_material text`);
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS toc_config text`);
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS section_policies text`);
    await db.execute(sql`ALTER TABLE courses ADD COLUMN IF NOT EXISTS syllabus text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS banner_url text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS overview_config text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS rail_config text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS image_url text`);
    await db.execute(sql`ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS spec jsonb`);
    await db.execute(sql`ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS rubric_id text`);
    await db.execute(sql`ALTER TABLE case_scenarios ADD COLUMN IF NOT EXISTS rubric_id text`);
    // Forced password change after an admin issues a temporary password.
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false`);
  } catch (err) {
    logger.error({ err }, "ensureCourseColumns failed");
  }
}
