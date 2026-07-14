import { Router } from "express";
import { db } from "@workspace/db";
import { announcementsTable, usersTable, notificationsTable, enrolmentsTable } from "@workspace/db";
import { eq, desc, or, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /announcements — all announcements relevant to current user
router.get("/announcements", requireAuth, async (req, res) => {
  // Get all platform-wide + course announcements for enrolled courses
  const rows = await db
    .select({ ann: announcementsTable, author: usersTable })
    .from(announcementsTable)
    .leftJoin(usersTable, eq(announcementsTable.authorId, usersTable.id))
    .where(or(eq(announcementsTable.platformWide, true), isNull(announcementsTable.courseId)))
    .orderBy(desc(announcementsTable.createdAt))
    .limit(50);
  res.json(rows.map(r => ({
    ...r.ann,
    author: r.author ? { id: r.author.id, firstName: r.author.firstName, lastName: r.author.lastName } : null,
  })));
});

// GET /courses/:courseId/announcements
router.get("/courses/:courseId/announcements", requireAuth, async (req, res) => {
  const rows = await db
    .select({ ann: announcementsTable, author: usersTable })
    .from(announcementsTable)
    .leftJoin(usersTable, eq(announcementsTable.authorId, usersTable.id))
    .where(eq(announcementsTable.courseId, req.params.courseId))
    .orderBy(desc(announcementsTable.pinned), desc(announcementsTable.createdAt));
  res.json(rows.map(r => ({
    ...r.ann,
    author: r.author ? { id: r.author.id, firstName: r.author.firstName, lastName: r.author.lastName } : null,
  })));
});

// POST /courses/:courseId/announcements
router.post("/courses/:courseId/announcements", requireAuth, async (req, res) => {
  const { title, body, pinned } = req.body;
  const [ann] = await db.insert(announcementsTable).values({
    courseId: req.params.courseId,
    authorId: req.userId!,
    title,
    body,
    pinned: pinned ?? false,
    publishedAt: new Date(),
  }).returning();

  // Notify enrolled learners
  const enrolled = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.courseId, req.params.courseId));
  if (enrolled.length > 0) {
    await db.insert(notificationsTable).values(
      enrolled.map(e => ({
        userId: e.userId,
        type: "announcement" as const,
        title: `New Announcement: ${title}`,
        body: body.slice(0, 120),
        link: `/courses/${req.params.courseId}`,
        courseId: req.params.courseId,
        actorId: req.userId,
      }))
    );
  }

  res.status(201).json(ann);
});

// PATCH /announcements/:announcementId
router.patch("/announcements/:announcementId", requireAuth, async (req, res) => {
  const { title, body, pinned } = req.body;
  const [updated] = await db.update(announcementsTable)
    .set({ title, body, pinned, updatedAt: new Date() })
    .where(eq(announcementsTable.id, req.params.announcementId))
    .returning();
  res.json(updated);
});

// DELETE /announcements/:announcementId
router.delete("/announcements/:announcementId", requireAuth, async (req, res) => {
  await db.delete(announcementsTable).where(eq(announcementsTable.id, req.params.announcementId));
  res.status(204).send();
});

export default router;
