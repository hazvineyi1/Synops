import { Router } from "express";
import { db } from "@workspace/db";
import {
  assignmentsTable, assignmentSubmissionsTable, gradebookEntriesTable,
  rubricsTable, usersTable, notificationsTable, enrolmentsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function toAssignmentResponse(a: typeof assignmentsTable.$inferSelect) {
  return {
    id: a.id, courseId: a.courseId, moduleId: a.moduleId, title: a.title,
    description: a.description, instructions: a.instructions,
    submissionType: a.submissionType, dueDate: a.dueDate?.toISOString() ?? null,
    availableFrom: a.availableFrom?.toISOString() ?? null,
    availableUntil: a.availableUntil?.toISOString() ?? null,
    pointsPossible: Number(a.pointsPossible), allowLateSubmissions: a.allowLateSubmissions,
    latePenaltyPercent: a.latePenaltyPercent, rubricId: a.rubricId,
    groupAssignment: a.groupAssignment, peerReviewRequired: a.peerReviewRequired,
    published: a.published, position: a.position,
    createdAt: a.createdAt.toISOString(),
  };
}

// GET /courses/:courseId/assignments
router.get("/courses/:courseId/assignments", requireAuth, async (req, res) => {
  const assignments = await db.select().from(assignmentsTable)
    .where(eq(assignmentsTable.courseId, req.params.courseId))
    .orderBy(assignmentsTable.position);
  res.json(assignments.map(toAssignmentResponse));
});

// POST /courses/:courseId/assignments
router.post("/courses/:courseId/assignments", requireAuth, async (req, res) => {
  const { title, description, instructions, submissionType, dueDate, pointsPossible, published, position } = req.body;
  const [assignment] = await db.insert(assignmentsTable).values({
    courseId: req.params.courseId, title, description, instructions,
    submissionType, dueDate: dueDate ? new Date(dueDate) : null,
    pointsPossible: pointsPossible ?? "100", published: published ?? false,
    position: position ?? 0,
  }).returning();

  // Create gradebook entries for all enrolled learners
  const enrolled = await db.select().from(enrolmentsTable).where(eq(enrolmentsTable.courseId, req.params.courseId));
  if (enrolled.length > 0) {
    await db.insert(gradebookEntriesTable).values(
      enrolled.map(e => ({
        userId: e.userId, courseId: req.params.courseId, assignmentId: assignment.id,
        possibleScore: assignment.pointsPossible, missing: true,
      }))
    );
  }

  res.status(201).json(toAssignmentResponse(assignment));
});

// GET /assignments/:assignmentId
router.get("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const assignment = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toAssignmentResponse(assignment));
});

// PATCH /assignments/:assignmentId
router.patch("/assignments/:assignmentId", requireAuth, async (req, res) => {
  const { title, description, instructions, dueDate, pointsPossible, published, position } = req.body;
  const [updated] = await db.update(assignmentsTable)
    .set({ title, description, instructions, dueDate: dueDate ? new Date(dueDate) : undefined, pointsPossible, published, position, updatedAt: new Date() })
    .where(eq(assignmentsTable.id, req.params.assignmentId))
    .returning();
  res.json(toAssignmentResponse(updated));
});

// DELETE /assignments/:assignmentId
router.delete("/assignments/:assignmentId", requireAuth, async (req, res) => {
  await db.delete(assignmentsTable).where(eq(assignmentsTable.id, req.params.assignmentId));
  res.status(204).send();
});

// POST /assignments/:assignmentId/submit
router.post("/assignments/:assignmentId/submit", requireAuth, async (req, res) => {
  const { body: submissionBody, url, fileUrls } = req.body;
  const assignment = await db.query.assignmentsTable.findFirst({ where: eq(assignmentsTable.id, req.params.assignmentId) });
  if (!assignment) { res.status(404).json({ error: "Not found" }); return; }

  const isLate = assignment.dueDate && new Date() > assignment.dueDate;

  const existing = await db.query.assignmentSubmissionsTable.findFirst({
    where: and(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId), eq(assignmentSubmissionsTable.userId, req.userId!)),
  });

  let submission;
  if (existing) {
    [submission] = await db.update(assignmentSubmissionsTable)
      .set({ body: submissionBody, url, fileUrls: fileUrls ?? [], status: isLate ? "late" : "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(assignmentSubmissionsTable.id, existing.id))
      .returning();
  } else {
    [submission] = await db.insert(assignmentSubmissionsTable).values({
      assignmentId: req.params.assignmentId, userId: req.userId!,
      body: submissionBody, url, fileUrls: fileUrls ?? [],
      status: isLate ? "late" : "submitted", submittedAt: new Date(),
    }).returning();
    // Update gradebook — mark as submitted
    await db.update(gradebookEntriesTable)
      .set({ missing: false, late: isLate ?? false })
      .where(and(eq(gradebookEntriesTable.assignmentId, req.params.assignmentId), eq(gradebookEntriesTable.userId, req.userId!)));
  }
  res.status(201).json(submission);
});

// GET /assignments/:assignmentId/my-submission
router.get("/assignments/:assignmentId/my-submission", requireAuth, async (req, res) => {
  const submission = await db.query.assignmentSubmissionsTable.findFirst({
    where: and(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId), eq(assignmentSubmissionsTable.userId, req.userId!)),
  });
  res.json(submission ?? null);
});

// GET /assignments/:assignmentId/submissions — instructor view
router.get("/assignments/:assignmentId/submissions", requireAuth, async (req, res) => {
  const rows = await db
    .select({ submission: assignmentSubmissionsTable, user: usersTable })
    .from(assignmentSubmissionsTable)
    .leftJoin(usersTable, eq(assignmentSubmissionsTable.userId, usersTable.id))
    .where(eq(assignmentSubmissionsTable.assignmentId, req.params.assignmentId))
    .orderBy(desc(assignmentSubmissionsTable.submittedAt));
  res.json(rows.map(r => ({
    ...r.submission,
    user: r.user ? { id: r.user.id, firstName: r.user.firstName, lastName: r.user.lastName, email: r.user.email } : null,
  })));
});

// PATCH /assignment-submissions/:submissionId/grade
router.patch("/assignment-submissions/:submissionId/grade", requireAuth, async (req, res) => {
  const { score, letterGrade, feedback, rubricAssessment } = req.body;
  const [updated] = await db.update(assignmentSubmissionsTable)
    .set({ score, letterGrade, feedback, rubricAssessment, gradedBy: req.userId, gradedAt: new Date(), status: "graded", updatedAt: new Date() })
    .where(eq(assignmentSubmissionsTable.id, req.params.submissionId))
    .returning();

  // Update gradebook
  await db.update(gradebookEntriesTable)
    .set({ score, letterGrade, missing: false, updatedAt: new Date() })
    .where(and(eq(gradebookEntriesTable.assignmentId, updated.assignmentId), eq(gradebookEntriesTable.userId, updated.userId)));

  // Notify learner
  await db.insert(notificationsTable).values({
    userId: updated.userId,
    type: "assignment_graded",
    title: "Your assignment has been graded",
    body: `Score: ${score} — ${feedback?.slice(0, 80) ?? "View feedback in gradebook"}`,
    link: `/assignments/${updated.assignmentId}`,
    courseId: (await db.query.assignmentsTable.findFirst({ where: (a, { eq }) => eq(a.id, updated.assignmentId) }))?.courseId ?? null,
    actorId: req.userId,
  });

  res.json(updated);
});

// Rubrics
router.get("/courses/:courseId/rubrics", requireAuth, async (req, res) => {
  const rubrics = await db.select().from(rubricsTable).where(eq(rubricsTable.courseId, req.params.courseId));
  res.json(rubrics);
});

router.post("/rubrics", requireAuth, async (req, res) => {
  const { courseId, title, criteria, totalPoints } = req.body;
  const [rubric] = await db.insert(rubricsTable).values({ courseId, title, criteria: criteria ?? [], totalPoints: totalPoints ?? 100 }).returning();
  res.status(201).json(rubric);
});

export default router;
