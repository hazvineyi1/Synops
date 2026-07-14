import { Router } from "express";
import { db } from "@workspace/db";
import { discussionsTable, discussionRepliesTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, asc, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toUserSnap(u: typeof usersTable.$inferSelect | null) {
  if (!u) return null;
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatarUrl: u.avatarUrl, role: u.role };
}

// GET /courses/:courseId/discussions
router.get("/courses/:courseId/discussions", requireAuth, async (req, res) => {
  const rows = await db
    .select({ discussion: discussionsTable, author: usersTable })
    .from(discussionsTable)
    .leftJoin(usersTable, eq(discussionsTable.authorId, usersTable.id))
    .where(eq(discussionsTable.courseId, req.params.courseId))
    .orderBy(desc(discussionsTable.isPinned), desc(discussionsTable.createdAt));
  res.json(rows.map(r => ({ ...r.discussion, author: toUserSnap(r.author) })));
});

// POST /courses/:courseId/discussions
router.post("/courses/:courseId/discussions", requireAuth, async (req, res) => {
  const { title, body, requireInitialPost } = req.body;
  const [discussion] = await db.insert(discussionsTable).values({
    courseId: req.params.courseId,
    authorId: req.userId!,
    title,
    body,
    requireInitialPost: requireInitialPost ?? false,
  }).returning();
  res.status(201).json(discussion);
});

// GET /courses/:courseId/discussions/:discussionId
router.get("/courses/:courseId/discussions/:discussionId", requireAuth, async (req, res) => {
  const [row] = await db
    .select({ discussion: discussionsTable, author: usersTable })
    .from(discussionsTable)
    .leftJoin(usersTable, eq(discussionsTable.authorId, usersTable.id))
    .where(eq(discussionsTable.id, req.params.discussionId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const replyRows = await db
    .select({ reply: discussionRepliesTable, author: usersTable })
    .from(discussionRepliesTable)
    .leftJoin(usersTable, eq(discussionRepliesTable.authorId, usersTable.id))
    .where(eq(discussionRepliesTable.discussionId, req.params.discussionId))
    .orderBy(asc(discussionRepliesTable.createdAt));

  res.json({
    ...row.discussion,
    author: toUserSnap(row.author),
    replies: replyRows.map(r => ({ ...r.reply, author: toUserSnap(r.author) })),
  });
});

// PATCH /discussions/:discussionId
router.patch("/discussions/:discussionId", requireAuth, async (req, res) => {
  const { title, body, isPinned, isClosed } = req.body;
  const [updated] = await db.update(discussionsTable)
    .set({ title, body, isPinned, isClosed, updatedAt: new Date() })
    .where(eq(discussionsTable.id, req.params.discussionId))
    .returning();
  res.json(updated);
});

// POST /courses/:courseId/discussions/:discussionId/replies
router.post("/courses/:courseId/discussions/:discussionId/replies", requireAuth, async (req, res) => {
  const { body, parentReplyId } = req.body;
  const user = req.dbUser!;
  const isInstructor = ["coach", "org_admin", "partner_admin", "super_admin"].includes(user.role);

  const [reply] = await db.insert(discussionRepliesTable).values({
    discussionId: req.params.discussionId,
    authorId: req.userId!,
    body,
    parentReplyId: parentReplyId ?? null,
    isInstructorReply: isInstructor,
  }).returning();

  // bump reply count
  await db.update(discussionsTable)
    .set({ replyCount: sql`${discussionsTable.replyCount} + 1`, updatedAt: new Date() })
    .where(eq(discussionsTable.id, req.params.discussionId));

  // notify original author
  const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, req.params.discussionId) });
  if (discussion && discussion.authorId !== req.userId) {
    await db.insert(notificationsTable).values({
      userId: discussion.authorId,
      type: "discussion_reply",
      title: `${user.firstName ?? "Someone"} replied to your discussion`,
      body: `In: ${discussion.title}`,
      link: `/courses/${req.params.courseId}/discussions/${req.params.discussionId}`,
      courseId: req.params.courseId,
      actorId: req.userId,
    });
  }

  res.status(201).json({ ...reply, author: toUserSnap(user) });
});

// DELETE /discussions/replies/:replyId
router.delete("/discussions/replies/:replyId", requireAuth, async (req, res) => {
  await db.delete(discussionRepliesTable).where(eq(discussionRepliesTable.id, req.params.replyId));
  res.status(204).send();
});

export default router;
