import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /notifications
router.get("/notifications", requireAuth, async (req, res) => {
  const notifications = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.userId, req.userId!))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(notifications);
});

// GET /notifications/unread-count
router.get("/notifications/unread-count", requireAuth, async (req, res) => {
  const [result] = await db.select({ count: count() }).from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ count: Number(result.count) });
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", requireAuth, async (req, res) => {
  await db.update(notificationsTable)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notificationsTable.id, req.params.id), eq(notificationsTable.userId, req.userId!)));
  res.json({ ok: true });
});

// POST /notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res) => {
  await db.update(notificationsTable)
    .set({ read: true, readAt: new Date() })
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.read, false)));
  res.json({ ok: true });
});

export default router;
