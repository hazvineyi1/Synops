import { db, announcementsTable } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";
import { logger } from "./logger";

/**
 * One-time, idempotent content correction run on boot (fire-and-forget, never throws).
 *
 * An early demo seed shipped a platform-wide "What's new" announcement claiming interactive
 * video (PlayPosit-style) had launched for all modules, that feature does not exist, so the
 * message was untrue and visible to every learner across every tenant. There is no API path to
 * edit or delete a platform-wide (course_id IS NULL) announcement, so we correct the row here.
 *
 * The WHERE is guarded on the OLD false body ("%PlayPosit%") so this only ever rewrites the
 * incorrect version once and can never clobber a later legitimate hand-edit of the same row.
 */
export async function correctSeededAnnouncements(): Promise<void> {
  try {
    await db
      .update(announcementsTable)
      .set({
        title: "New: built-in learner supports",
        body: "Lessons now include read-aloud narration, on-demand translation, and adjustable, guided pacing, so every learner can work in the way that suits them best.",
        updatedAt: new Date(),
      })
      .where(and(eq(announcementsTable.id, "ann_plat_01"), like(announcementsTable.body, "%PlayPosit%")));
  } catch (err) {
    // Table may not exist yet in a fresh environment, never block boot.
    logger.warn({ err }, "correctSeededAnnouncements skipped");
  }
}
