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
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS banner_url text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS overview_config text`);
    await db.execute(sql`ALTER TABLE modules ADD COLUMN IF NOT EXISTS rail_config text`);
    await db.execute(sql`ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS image_url text`);
    await db.execute(sql`ALTER TABLE interactive_activities ADD COLUMN IF NOT EXISTS spec jsonb`);
  } catch (err) {
    logger.error({ err }, "ensureCourseColumns failed");
  }
}
