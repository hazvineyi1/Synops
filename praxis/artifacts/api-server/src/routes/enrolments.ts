import { Router } from "express";
import { db } from "@workspace/db";
import { enrolmentsTable, usersTable, coursesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canStaffActOnCourse } from "../lib/scope";

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
/**
 * GET /courses/:courseId/enrolment-candidates — who could be enrolled on this course.
 *
 * Derived from the COURSE's organisation, not the caller's. Sourcing candidates from the
 * caller's own org is wrong twice over: a super admin has no organisationId and so would
 * see nobody, and an org admin browsing another tenant's course would be offered the wrong
 * people. Already-enrolled users are filtered out server-side.
 *
 * Staff only, and it returns names without emails -- picking someone to enrol does not
 * require their personal contact details (POPIA).
 */
router.get("/courses/:courseId/enrolment-candidates", requireAuth, async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const [members, enrolled] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.organisationId, course.tenantId)),
    db.select({ userId: enrolmentsTable.userId }).from(enrolmentsTable)
      .where(eq(enrolmentsTable.courseId, req.params.courseId)),
  ]);
  const taken = new Set(enrolled.map((e) => e.userId));

  res.json(members
    .filter((u) => !taken.has(u.id))
    .map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role })));
});

/**
 * POST /courses/:courseId/roster — enrol a learner.
 *
 * STAFF ONLY. This previously had no authorisation check beyond being logged in, which
 * meant any authenticated user could enrol ANY user into ANY course on the platform --
 * including courses in another organisation entirely -- simply by posting a userId.
 * Enrolment drives progress, gradebooks and credentials, so it is not a self-service action.
 */
router.post("/courses/:courseId/roster", requireAuth, async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const { userId, role = "student" } = req.body;
  if (!userId) { res.status(400).json({ error: "userId is required" }); return; }

  // Enrolling the same person twice would give them two progress rows and double-count
  // them in every roster and report.
  const existing = await db.query.enrolmentsTable.findFirst({
    where: and(eq(enrolmentsTable.userId, userId), eq(enrolmentsTable.courseId, req.params.courseId)),
  });
  if (existing) { res.status(409).json({ error: "That learner is already enrolled on this course." }); return; }

  const [enrolment] = await db.insert(enrolmentsTable).values({
    userId, courseId: req.params.courseId, status: "active", role,
  }).returning();
  res.status(201).json(enrolment);
});

// DELETE /courses/:courseId/roster/:userId — staff only, for the same reason as above.
// Un-enrolling someone destroys their access to the course; it was previously open to
// any authenticated caller.
router.delete("/courses/:courseId/roster/:userId", requireAuth, async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
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
