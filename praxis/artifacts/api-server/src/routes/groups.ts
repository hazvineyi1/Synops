import { Router } from "express";
import { db } from "@workspace/db";
import { courseGroupsTable, courseGroupMembersTable, usersTable, coursesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canAdministerOrg, canAccessCourse, type ScopedUser } from "../lib/roles";

const router = Router();

/**
 * Section (course-group) management is a Facilitator action scoped to the course's org
 * (decision §4.2: cohort/section management = Org/Facilitator, own org). Returns true
 * only for a Super Admin, or a Facilitator whose org owns the course (course.tenantId).
 * Co-facilitators only VIEW their sections; they do not create or delete them.
 */
async function canManageCourseSections(user: ScopedUser, courseId: string): Promise<boolean> {
  if (!canAdministerOrg(user.role)) return false;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, courseId) });
  if (!course) return false;
  return canAccessCourse(user, course);
}

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
  if (!(await canManageCourseSections(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, description, maxMembers } = req.body;
  const [group] = await db.insert(courseGroupsTable).values({ courseId: req.params.courseId, name, description, maxMembers }).returning();
  res.status(201).json({ ...group, members: [] });
});

// PATCH /groups/:groupId
router.patch("/groups/:groupId", requireAuth, async (req, res) => {
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, description, maxMembers } = req.body;
  const [updated] = await db.update(courseGroupsTable).set({ name, description, maxMembers }).where(eq(courseGroupsTable.id, req.params.groupId)).returning();
  res.json(updated);
});

// DELETE /groups/:groupId
router.delete("/groups/:groupId", requireAuth, async (req, res) => {
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(204).send(); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
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

// POST /groups/:groupId/members — a Facilitator assigns a user to a section, optionally
// as its "leader" (the section's Co-facilitator). This is how Co-facilitators become
// bound to the sections they teach (decision §8). Idempotent: re-assigning updates role.
router.post("/groups/:groupId/members", requireAuth, async (req, res) => {
  const { userId, role = "member" } = req.body as { userId: string; role?: "leader" | "member" };
  const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  if (!(await canManageCourseSections(req.dbUser!, group.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await db.query.courseGroupMembersTable.findFirst({
    where: and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, userId)),
  });
  if (existing) {
    const [updated] = await db.update(courseGroupMembersTable).set({ role }).where(eq(courseGroupMembersTable.id, existing.id)).returning();
    res.json(updated);
    return;
  }
  const [member] = await db.insert(courseGroupMembersTable).values({ groupId: req.params.groupId, userId, role }).returning();
  res.status(201).json(member);
});

// DELETE /groups/:groupId/members/:userId — a member may remove themselves; removing
// anyone else is a Facilitator action scoped to the course's org.
router.delete("/groups/:groupId/members/:userId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  if (actor.id !== req.params.userId) {
    const group = await db.query.courseGroupsTable.findFirst({ where: eq(courseGroupsTable.id, req.params.groupId) });
    if (!group) { res.status(204).send(); return; }
    if (!(await canManageCourseSections(actor, group.courseId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  await db.delete(courseGroupMembersTable).where(and(eq(courseGroupMembersTable.groupId, req.params.groupId), eq(courseGroupMembersTable.userId, req.params.userId)));
  res.status(204).send();
});

export default router;
