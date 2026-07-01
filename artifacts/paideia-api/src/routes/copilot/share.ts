import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  assignmentsTable,
  classesTable,
  worksheetsTable,
  quizzesTable,
  studentsTable,
  submissionsTable,
} from "@workspace/paideia-db";
import { and, eq } from "drizzle-orm";
import { gradeQuiz, gradeWorksheet } from "../../lib/grading.js";
import { enqueueGrading } from "../../lib/gradingQueue.js";

const router: IRouter = Router();

router.get("/:code", async (req, res) => {
  const code = req.params["code"] as string;
  const rows = await db
    .select({ assignment: assignmentsTable, class: classesTable })
    .from(assignmentsTable)
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(eq(assignmentsTable.shareCode, code))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  if (row.assignment.deliveryMode !== "share_link") {
    res.status(403).json({ error: "This assignment requires a student account." });
    return;
  }
  if (row.assignment.closed) {
    res.status(403).json({ error: "This assignment is closed." });
    return;
  }
  const resource = await loadResource(row.assignment);
  if (!resource) {
    res.status(404).json({ error: "Resource missing" });
    return;
  }
  const students = await db
    .select({ id: studentsTable.id, firstName: studentsTable.firstName, lastInitial: studentsTable.lastInitial })
    .from(studentsTable)
    .where(eq(studentsTable.classId, row.assignment.classId))
    .orderBy(studentsTable.firstName);
  res.json({
    assignment: {
      id: row.assignment.id,
      title: row.assignment.title,
      resourceKind: row.assignment.resourceKind,
      shareCode: row.assignment.shareCode,
    },
    class: { name: row.class.name },
    resource: stripAnswers(resource, row.assignment.resourceKind),
    students,
  });
});

const submitSchema = z.object({
  studentId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(80).optional(),
  answers: z.record(z.string(), z.string().max(4000)),
});

router.post("/:code/submit", async (req, res) => {
  const code = req.params["code"] as string;
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.shareCode, code))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  if (assignment.deliveryMode !== "share_link" || assignment.closed) {
    res.status(403).json({ error: "This assignment is not open." });
    return;
  }
  let displayName = parsed.data.displayName?.trim() ?? "";
  let studentId: string | null = null;
  if (parsed.data.studentId) {
    const sRows = await db
      .select()
      .from(studentsTable)
      .where(and(eq(studentsTable.id, parsed.data.studentId), eq(studentsTable.classId, assignment.classId)))
      .limit(1);
    if (!sRows[0]) {
      res.status(400).json({ error: "Student not in this class" });
      return;
    }
    studentId = sRows[0].id;
    displayName = `${sRows[0].firstName} ${sRows[0].lastInitial}`;
  }
  if (!displayName) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  const resource = await loadResource(assignment);
  if (!resource) {
    res.status(500).json({ error: "Resource missing" });
    return;
  }
  const graded = gradeResource(resource, assignment.resourceKind, parsed.data.answers);
  let submission;
  try {
    [submission] = await db
      .insert(submissionsTable)
      .values({
        assignmentId: assignment.id,
        studentId,
        displayName,
        answers: parsed.data.answers,
        autoScore: graded.autoScore,
        maxAutoScore: graded.maxAutoScore,
        needsReviewCount: graded.needsReviewCount,
        feedback: graded.feedback,
      })
      .returning();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "This student has already submitted this assignment." });
      return;
    }
    throw err;
  }
  if (!submission) {
    res.status(500).json({ error: "Could not save submission" });
    return;
  }
  enqueueGrading(submission.id);
  res.json({
    submission: {
      id: submission.id,
      autoScore: submission.autoScore,
      maxAutoScore: submission.maxAutoScore,
      needsReviewCount: submission.needsReviewCount,
      feedback: graded.feedback,
      gradingStatus: submission.gradingStatus,
    },
  });
});

router.get("/:code/submissions/:id", async (req, res) => {
  const code = req.params["code"] as string;
  const id = req.params["id"] as string;
  const aRows = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.shareCode, code))
    .limit(1);
  const assignment = aRows[0];
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  const sRows = await db
    .select()
    .from(submissionsTable)
    .where(and(eq(submissionsTable.id, id), eq(submissionsTable.assignmentId, assignment.id)))
    .limit(1);
  const sub = sRows[0];
  if (!sub) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }
  res.json({
    submission: {
      id: sub.id,
      displayName: sub.displayName,
      autoScore: sub.autoScore,
      maxAutoScore: sub.maxAutoScore,
      needsReviewCount: sub.needsReviewCount,
      feedback: sub.feedback,
      gradingStatus: sub.gradingStatus,
      gradedAt: sub.gradedAt,
      submittedAt: sub.submittedAt,
    },
    assignment: { id: assignment.id, title: assignment.title, resourceKind: assignment.resourceKind },
  });
});

async function loadResource(a: { resourceKind: string; worksheetId: string | null; quizId: string | null }) {
  if (a.resourceKind === "worksheet" && a.worksheetId) {
    const r = await db.select().from(worksheetsTable).where(eq(worksheetsTable.id, a.worksheetId)).limit(1);
    return r[0] ?? null;
  }
  if (a.resourceKind === "quiz" && a.quizId) {
    const r = await db.select().from(quizzesTable).where(eq(quizzesTable.id, a.quizId)).limit(1);
    return r[0] ?? null;
  }
  return null;
}

function stripAnswers(resource: { content: unknown }, kind: string) {
  const c = JSON.parse(JSON.stringify(resource.content)) as Record<string, unknown>;
  if (kind === "worksheet" && Array.isArray(c["questions"])) {
    c["questions"] = (c["questions"] as Array<Record<string, unknown>>).map((q) => {
      const { answer: _a, workingOrRubric: _w, ...rest } = q;
      return rest;
    });
  }
  if (kind === "quiz" && Array.isArray(c["items"])) {
    c["items"] = (c["items"] as Array<Record<string, unknown>>).map((q) => {
      const { correctAnswer: _a, ...rest } = q;
      return rest;
    });
  }
  return c;
}

function gradeResource(resource: { content: unknown }, kind: string, answers: Record<string, string>) {
  const c = resource.content as Record<string, unknown>;
  if (kind === "quiz") {
    return gradeQuiz((c["items"] as never) ?? [], answers);
  }
  return gradeWorksheet((c["questions"] as never) ?? [], answers);
}

export default router;
