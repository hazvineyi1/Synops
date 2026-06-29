import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/requireAuth";
import { requireRole, logAdminAction } from "../lib/roles";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// GET /announcements - active announcements for the current learner's tier.
router.get("/announcements", requireAuth, async (req, res) => {
  const ent = (req as any).entitlement;
  const tier = ent?.tier === "pro" ? "pro" : "free";
  const result = await db.execute(sql`
    SELECT id, title, body, created_at
    FROM announcements
    WHERE active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (audience = 'all' OR audience = ${tier})
    ORDER BY id DESC
    LIMIT 20
  `);
  res.json({ announcements: result.rows ?? [] });
});

// GET /admin/announcements - all announcements (moderator and above).
router.get("/admin/announcements", requireAuth, requireRole("moderator"), async (_req, res) => {
  const result = await db.execute(sql`
    SELECT id, title, body, audience, active, created_by_email, expires_at, created_at
    FROM announcements
    ORDER BY id DESC
    LIMIT 200
  `);
  res.json({ announcements: result.rows ?? [] });
});

// POST /admin/announcements - publish a broadcast (moderator and above).
router.post("/admin/announcements", requireAuth, requireRole("moderator"), async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  const audience = ["all", "free", "pro"].includes(req.body?.audience) ? req.body.audience : "all";
  if (!title || !body) {
    res.status(400).json({ error: "Title and body are required" });
    return;
  }
  const actorId = (req as any).userId as string;
  let actorEmail: string | null = null;
  try {
    const u = await db.execute(sql`SELECT email FROM users WHERE id = ${actorId} LIMIT 1`);
    actorEmail = (u.rows?.[0] as any)?.email ?? null;
  } catch {
    // best-effort
  }
  const inserted = await db.execute(sql`
    INSERT INTO announcements (title, body, audience, created_by, created_by_email)
    VALUES (${title}, ${body}, ${audience}, ${actorId}, ${actorEmail})
    RETURNING id
  `);
  const id = (inserted.rows?.[0] as any)?.id;
  await logAdminAction({
    actorUserId: actorId,
    actorEmail,
    action: "announcement.create",
    targetType: "announcement",
    targetId: String(id),
    metadata: { audience, title },
  });
  res.json({ ok: true, id });
});

// POST /admin/announcements/:id/deactivate - stop showing it (moderator+).
router.post("/admin/announcements/:id/deactivate", requireAuth, requireRole("moderator"), async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`UPDATE announcements SET active = false WHERE id = ${id}`);
  await logAdminAction({
    actorUserId: (req as any).userId,
    action: "announcement.deactivate",
    targetType: "announcement",
    targetId: String(id),
  });
  res.json({ ok: true });
});

export default router;
