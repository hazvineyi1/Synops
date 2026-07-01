import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  classesTable,
  assignmentsTable,
  worksheetsTable,
  quizzesTable,
  submissionsTable,
  studentsTable,
} from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";
import { generateShortCode } from "../../lib/auth.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const createSchema = z.object({
  classId: z.string().uuid(),
  resourceKind: z.enum(["worksheet", "quiz"]),
  resourceId: z.string().uuid(),
  deliveryMode: z.enum(["share_link", "accounts"]),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const cls = await db
    .select()
    .from(classesTable)
    .where(and(eq(classesTable.id, parsed.data.classId), eq(classesTable.teacherId, req.teacher!.id)))
    .limit(1);
  if (!cls[0]) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  let title = "";
  let worksheetId: string | null = null;
  let quizId: string | null = null;
  if (parsed.data.resourceKind === "worksheet") {
    const rows = await db
      .select()
      .from(worksheetsTable)
      .where(and(eq(worksheetsTable.id, parsed.data.resourceId), eq(worksheetsTable.teacherId, req.teacher!.id)))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Worksheet not found" });
      return;
    }
    title = rows[0].title;
    worksheetId = rows[0].id;
  } else {
    const rows = await db
      .select()
      .from(quizzesTable)
      .where(and(eq(quizzesTable.id, parsed.data.resourceId), eq(quizzesTable.teacherId, req.teacher!.id)))
      .limit(1);
    if (!rows[0]) {
      res.status(404).json({ error: "Quiz not found" });
      return;
    }
    title = rows[0].title;
    quizId = rows[0].id;
  }
  const shareCode = generateShortCode(8);
  const [row] = await db
    .insert(assignmentsTable)
    .values({
      teacherId: req.teacher!.id,
      classId: parsed.data.classId,
      resourceKind: parsed.data.resourceKind,
      worksheetId,
      quizId,
      title,
      deliveryMode: parsed.data.deliveryMode,
      shareCode,
    })
    .returning();
  res.json({ assignment: row });
});

router.get("/", async (req, res) => {
  const rows = await db
    .select({
      assignment: assignmentsTable,
      class: classesTable,
    })
    .from(assignmentsTable)
    .innerJoin(classesTable, eq(assignmentsTable.classId, classesTable.id))
    .where(eq(assignmentsTable.teacherId, req.teacher!.id))
    .orderBy(desc(assignmentsTable.createdAt))
    .limit(100);
  res.json({ assignments: rows });
});

router.get("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)))
    .limit(1);
  const assignment = rows[0];
  if (!assignment) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const cls = (await db.select().from(classesTable).where(eq(classesTable.id, assignment.classId)).limit(1))[0]!;
  const submissions = await db
    .select({
      submission: submissionsTable,
      student: studentsTable,
    })
    .from(submissionsTable)
    .leftJoin(studentsTable, eq(submissionsTable.studentId, studentsTable.id))
    .where(eq(submissionsTable.assignmentId, id))
    .orderBy(desc(submissionsTable.submittedAt));
  const sanitised = submissions.map((s) => ({
    submission: s.submission,
    student: s.student ? (() => { const { passwordHash: _ph, ...rest } = s.student!; return rest; })() : null,
  }));
  res.json({ assignment, class: cls, submissions: sanitised });
});

router.patch("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  const schema = z.object({ closed: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .update(assignmentsTable)
    .set({ closed: parsed.data.closed })
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ assignment: row });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"] as string;
  await db
    .delete(assignmentsTable)
    .where(and(eq(assignmentsTable.id, id), eq(assignmentsTable.teacherId, req.teacher!.id)));
  res.json({ ok: true });
});

export default router;
