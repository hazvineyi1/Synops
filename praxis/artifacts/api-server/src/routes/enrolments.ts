import { Router } from "express";
import { db } from "@workspace/db";
import { enrolmentsTable, usersTable, coursesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toUserResponse(u: typeof usersTable.$inferSelect, showEmail: boolean) {
  return {
    id: u.id,
    // POPIA: a learner's email is personal information. Peers on the same course have
    // no lawful basis to see each other's contact details, so we only expose an email
    // to facilitators (or to the learner viewing their own row). Everyone else gets null.
    email: showEmail ? u.email : null,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
  };
}

// Roles that legitimately need learner contact details / grades (course staff).
const FACILITATOR_ROLES = ["coach", "org_admin", "partner_admin", "super_admin"];

// GET /courses/:courseId/roster
router.get("/courses/:courseId/roster", requireAuth, async (req, res) => {
  const isFacilitator = FACILITATOR_ROLES.includes(req.dbUser?.role ?? "");
  const rows = await db
    .select({ enrolment: enrolmentsTable, user: usersTable })
    .from(enrolmentsTable)
    .leftJoin(usersTable, eq(enrolmentsTable.userId, usersTable.id))
    .where(eq(enrolmentsTable.courseId, req.params.courseId));
  res.json(rows.map(r => {
    // Facilitators see everyone's details; a learner sees only their own.
    const canSee = isFacilitator || r.user?.id === req.userId;
    return {
      enrolmentId: r.enrolment.id,
      status: r.enrolment.status,
      role: r.enrolment.role,
      // A classmate's grade is private too -- redact it for peers.
      finalGrade: canSee ? r.enrolment.finalGrade : null,
      enrolledAt: r.enrolment.enrolledAt,
      user: r.user ? toUserResponse(r.user, canSee) : null,
    };
  }));
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
