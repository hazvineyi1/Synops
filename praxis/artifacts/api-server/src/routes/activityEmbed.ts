import { Router } from "express";
import { db } from "@workspace/db";
import {
  interactiveActivitiesTable,
  activityEmbedLinksTable,
  type ActivityEmbedLink,
  type InteractiveActivity,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Public, UNAUTHENTICATED activity runner via a signed embed token — the "publish" side of
 * the Google-Sites-style flow. Anyone with the opaque token can open and play a published
 * activity (paste it into an LMS/site with an <iframe>). Gated only by the token, its active
 * flag and expiry. Every open bumps the link's counter.
 *
 * SECURITY: no auth by design; the token IS the credential. The activity HTML is still
 * rendered client-side in the same sandboxed player. Anonymous plays are NOT persisted as
 * submissions (activity_submissions requires a user) — tracked completion is the authenticated
 * assignment flow. This route only ever exposes the single activity the token points at.
 */
const router = Router();

async function resolveLink(token: string): Promise<{ link: ActivityEmbedLink; activity: InteractiveActivity } | null> {
  const link = await db.query.activityEmbedLinksTable.findFirst({ where: eq(activityEmbedLinksTable.token, token) });
  if (!link || !link.isActive) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  const activity = await db.query.interactiveActivitiesTable.findFirst({ where: eq(interactiveActivitiesTable.id, link.activityId) });
  if (!activity || !activity.published) return null;
  return { link, activity };
}

// GET /activity-embed/:token — public activity payload for the sandbox player.
router.get("/activity-embed/:token", async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) { res.status(404).json({ error: "This link is not available." }); return; }
  const { link, activity } = resolved;
  await db.update(activityEmbedLinksTable)
    .set({ accessCount: sql`${activityEmbedLinksTable.accessCount} + 1` })
    .where(eq(activityEmbedLinksTable.id, link.id));
  res.json({
    id: activity.id,
    title: activity.title,
    instructions: activity.instructions,
    html: activity.html,
    source: activity.source,
    embedUrl: activity.embedUrl,
    kind: activity.kind,
    bloomsLevel: activity.bloomsLevel,
    difficulty: activity.difficulty,
  });
});

export default router;
