import { Router } from "express";
import { db } from "@workspace/db";
import { discussionsTable, discussionRepliesTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, asc, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canStaffActOnCourse } from "../lib/scope";

const router = Router();

function toUserSnap(u: typeof usersTable.$inferSelect | null) {
  if (!u) return null;
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatarUrl: u.avatarUrl, role: u.role };
}

/**
 * GET /courses/:courseId/discussions
 *
 * Each row carries `iHaveReplied` for the CALLING learner. replyCount is a global total, so
 * on its own it cannot answer "has THIS learner participated?" -- which is what a
 * participation requirement actually turns on. Only the caller's own authorship is checked;
 * no other learner's posting activity is exposed here.
 */
router.get("/courses/:courseId/discussions", requireAuth, async (req, res) => {
  const rows = await db
    .select({ discussion: discussionsTable, author: usersTable })
    .from(discussionsTable)
    .leftJoin(usersTable, eq(discussionsTable.authorId, usersTable.id))
    .where(eq(discussionsTable.courseId, req.params.courseId))
    .orderBy(desc(discussionsTable.isPinned), desc(discussionsTable.createdAt));

  const myReplies = await db
    .select({ discussionId: discussionRepliesTable.discussionId })
    .from(discussionRepliesTable)
    .where(eq(discussionRepliesTable.authorId, req.userId!));
  const replied = new Set(myReplies.map((r) => r.discussionId));

  res.json(rows.map(r => ({
    ...r.discussion,
    author: toUserSnap(r.author),
    iHaveReplied: replied.has(r.discussion.id),
  })));
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

// PATCH /discussions/:discussionId — the author may edit their own text; moderation
// flags (pin/close) are delivery-staff-only, scoped to the course (decision §4.2).
router.patch("/discussions/:discussionId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, req.params.discussionId) });
  if (!discussion) { res.status(404).json({ error: "Discussion not found" }); return; }
  const isStaff = await canStaffActOnCourse(actor, discussion.courseId);
  const isAuthor = discussion.authorId === actor.id;
  if (!isStaff && !isAuthor) { res.status(403).json({ error: "Forbidden" }); return; }

  const { title, body, isPinned, isClosed } = req.body;
  const updates: Partial<typeof discussionsTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body;
  if (isStaff) {
    if (isPinned !== undefined) updates.isPinned = isPinned;
    if (isClosed !== undefined) updates.isClosed = isClosed;
  }
  const [updated] = await db.update(discussionsTable)
    .set(updates)
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

// DELETE /discussions/replies/:replyId — the reply's author may delete their own; anyone
// else needs delivery-staff moderation rights scoped to the course (decision §4.2).
router.delete("/discussions/replies/:replyId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const reply = await db.query.discussionRepliesTable.findFirst({ where: eq(discussionRepliesTable.id, req.params.replyId) });
  if (!reply) { res.status(204).send(); return; }
  let allowed = reply.authorId === actor.id;
  if (!allowed) {
    const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, reply.discussionId) });
    if (discussion) allowed = await canStaffActOnCourse(actor, discussion.courseId);
  }
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(discussionRepliesTable).where(eq(discussionRepliesTable.id, req.params.replyId));
  res.status(204).send();
});

export default router;
