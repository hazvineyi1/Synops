import { Router } from "express";
import { db } from "@workspace/db";
import { courseGroupsTable, courseGroupMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// GET /courses/:courseId/groups
router.get("/courses/:courseId/groups", requireAuth, async (req, res) => {
  const groups = await db.select().from(courseGroupsTable).where(eq(courseGroupsTable.courseId, req.params.courseId));
  const withMembers = await Promise.all(groups.map(async g => {
    const memberRows = await db
      .select({ member: courseGroupMembersTable, user: usersTable })
      .from(courseGroupMembersTable)
      .leftJoin(usersTable, eq(courseGroupMembersTable.userId, usersTable.id))
      .where(eq(courseGroupMembersTable.groupId, g.id));
    return {
      ...g,
      members: memberRows.map(r => ({
        id: r.member.id, userId: r.member.userId, role: r.member.role,
        user: r.user ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email } : null,
      })),
    };
  }));
  res.json(withMembers);
});

// POST /courses/:courseId/groups
router.post("/courses/:courseId/groups", requireAuth, async (req, res) => {
  const { name, description, maxMembers } = req.body;
  const [group] = await db.insert(courseGroupsTable).values({ courseId: req.params.courseId, name, description, maxMembers }).returning();
  res.status(201).json({ ...group, members: [] });
});

// PATCH /groups/:groupId
router.patch("/groups/:groupId", requireAuth, async (req, res) => {
  const { name, description, maxMembers } = req.body;
  const [updated] = await db.update(courseGroupsTable).set({ name, description, maxMembers }).where(eq(courseGroupsTable.id, req.params.groupId)).returning();
  res.json(updated);
});

// DELETE /groups/:groupId
router.delete("/groups/:groupId", requireAuth, async (req, res) => {
  await db.delete(courseGroupMembersTable).where(eq(courseGroupMembersTable.groupId, req.params.groupId));
  await db.delete(courseGroupsTable).where(eq(courseGroupsTable.id, req.params.groupId));
  res.status(204).send();
});

// POST /groups/:groupId/join
router.post("/groups/:groupId/join", requireAuth, async (req, res) => {
  const existing = await db.query.courseGroupMembersTable.findFirst({
    where: and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, req.userId!)),
  });
  if (existing) { res.json(existing); return; }
  const [member] = await db.insert(courseGroupMembersTable).values({ groupId: req.params.groupId, userId: req.userId!, role: "member" }).returning();
  res.status(201).json(member);
});

// DELETE /groups/:groupId/members/:userId
router.delete("/groups/:groupId/members/:userId", requireAuth, async (req, res) => {
  await db.delete(courseGroupMembersTable).where(and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, req.params.userId)));
  res.status(204).send();
});

export default router;
