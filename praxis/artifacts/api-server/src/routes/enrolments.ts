import { Router } from "express";
import { db } from "@workspace/db";
import { enrolmentsTable, usersTable, coursesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toUserResponse(u: typeof usersTable.$inferSelect) {
  return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, avatarUrl: u.avatarUrl, role: u.role };
}

// GET /courses/:courseId/roster
router.get("/courses/:courseId/roster", requireAuth, async (req, res) => {
  const rows = await db
    .select({ enrolment: enrolmentsTable, user: usersTable })
    .from(enrolmentsTable)
    .leftJoin(usersTable, eq(enrolmentsTable.userId, usersTable.id))
    .where(eq(enrolmentsTable.courseId, req.params.courseId));
  res.json(rows.map(r => ({
    enrolmentId: r.enrolment.id,
    status: r.enrolment.status,
    role: r.enrolment.role,
    finalGrade: r.enrolment.finalGrade,
    enrolledAt: r.enrolment.enrolledAt,
    user: r.user ? toUserResponse(r.user) : null,
  })));
});

// POST /courses/:courseId/enrol — enroll self
router.post("/courses/:courseId/enrol", requireAuth, async (req, res) => {
  const existing = await db.query.enrolmentsTable.findFirst({
    where: and(eq(enrolmentsTable.userId, req.userId!), eq(enrolmentsTable.courseId, req.params.courseId)),
  });
  if (existing) { res.json(existing); return; }
  const [enrolment] = await db.insert(enrolmentsTable).values({
    userId: req.userId!,
    courseId: req.params.courseId,
    status: "active",
  }).returning();
  await db.update(coursesTable).set({ enrolmentCount: sql`${coursesTable.enrolmentCount} + 1` }).where(eq(coursesTable.id, req.params.courseId));
  res.status(201).json(enrolment);
});

// POST /courses/:courseId/roster — admin enrols a user
router.post("/courses/:courseId/roster", requireAuth, async (req, res) => {
  const { userId, role = "student" } = req.body;
  const [enrolment] = await db.insert(enrolmentsTable).values({
    userId, courseId: req.params.courseId, status: "active", role,
  }).returning();
  res.status(201).json(enrolment);
});

// DELETE /courses/:courseId/roster/:userId
router.delete("/courses/:courseId/roster/:userId", requireAuth, async (req, res) => {
  await db.delete(enrolmentsTable).where(
    and(eq(enrolmentsTable.userId, req.params.userId), eq(enrolmentsTable.courseId, req.params.courseId))
  );
  res.status(204).send();
});

// GET /courses/:courseId/my-enrolment
router.get("/courses/:courseId/my-enrolment", requireAuth, async (req, res) => {
  const enrolment = await db.query.enrolmentsTable.findFirst({
    where: and(eq(enrolmentsTable.userId, req.userId!), eq(enrolmentsTable.courseId, req.params.courseId)),
  });
  res.json(enrolment ?? null);
});

export default router;
