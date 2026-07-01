import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  lessonPlansTable,
  worksheetsTable,
  quizzesTable,
  parentDraftsTable,
} from "@workspace/paideia-db";
import { desc, eq, and } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

router.get("/", async (req, res) => {
  const teacherId = req.teacher!.id;
  const [plans, worksheets, quizzes, drafts] = await Promise.all([
    db.select({
      id: lessonPlansTable.id,
      title: lessonPlansTable.title,
      subject: lessonPlansTable.subject,
      yearGroup: lessonPlansTable.yearGroup,
      topic: lessonPlansTable.topic,
      createdAt: lessonPlansTable.createdAt,
    }).from(lessonPlansTable).where(eq(lessonPlansTable.teacherId, teacherId)).orderBy(desc(lessonPlansTable.createdAt)).limit(500),
    db.select({
      id: worksheetsTable.id,
      title: worksheetsTable.title,
      subject: worksheetsTable.subject,
      yearGroup: worksheetsTable.yearGroup,
      topic: worksheetsTable.topic,
      createdAt: worksheetsTable.createdAt,
    }).from(worksheetsTable).where(eq(worksheetsTable.teacherId, teacherId)).orderBy(desc(worksheetsTable.createdAt)).limit(500),
    db.select({
      id: quizzesTable.id,
      title: quizzesTable.title,
      subject: quizzesTable.subject,
      yearGroup: quizzesTable.yearGroup,
      topic: quizzesTable.topic,
      createdAt: quizzesTable.createdAt,
    }).from(quizzesTable).where(eq(quizzesTable.teacherId, teacherId)).orderBy(desc(quizzesTable.createdAt)).limit(500),
    db.select({
      id: parentDraftsTable.id,
      studentName: parentDraftsTable.studentName,
      yearGroup: parentDraftsTable.yearGroup,
      tone: parentDraftsTable.tone,
      createdAt: parentDraftsTable.createdAt,
    }).from(parentDraftsTable).where(eq(parentDraftsTable.teacherId, teacherId)).orderBy(desc(parentDraftsTable.createdAt)).limit(500),
  ]);
  const items = [
    ...plans.map((p) => ({ id: p.id, kind: "plan" as const, title: p.title, subject: p.subject, yearGroup: p.yearGroup, topic: p.topic, createdAt: p.createdAt.toISOString() })),
    ...worksheets.map((w) => ({ id: w.id, kind: "worksheet" as const, title: w.title, subject: w.subject, yearGroup: w.yearGroup, topic: w.topic, createdAt: w.createdAt.toISOString() })),
    ...quizzes.map((q) => ({ id: q.id, kind: "quiz" as const, title: q.title, subject: q.subject, yearGroup: q.yearGroup, topic: q.topic, createdAt: q.createdAt.toISOString() })),
    ...drafts.map((d) => ({ id: d.id, kind: "parent-draft" as const, title: `Update for ${d.studentName}`, subject: d.tone, yearGroup: d.yearGroup ?? "", topic: null as string | null, createdAt: d.createdAt.toISOString() })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items });
});

const dupSchema = z.object({
  kind: z.enum(["plan", "worksheet", "quiz", "parent-draft"]),
  id: z.string().uuid(),
});

router.post("/duplicate", async (req, res) => {
  const parsed = dupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const teacherId = req.teacher!.id;
  const { kind, id } = parsed.data;
  try {
    if (kind === "plan") {
      const [row] = await db.select().from(lessonPlansTable).where(and(eq(lessonPlansTable.id, id), eq(lessonPlansTable.teacherId, teacherId))).limit(1);
      if (!row) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _i, createdAt: _c, ...rest } = row;
      const [copy] = await db.insert(lessonPlansTable).values({ ...rest, title: `${rest.title} (copy)` }).returning();
      res.status(201).json({ kind, id: copy.id });
      return;
    }
    if (kind === "worksheet") {
      const [row] = await db.select().from(worksheetsTable).where(and(eq(worksheetsTable.id, id), eq(worksheetsTable.teacherId, teacherId))).limit(1);
      if (!row) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _i, createdAt: _c, ...rest } = row;
      const [copy] = await db.insert(worksheetsTable).values({ ...rest, title: `${rest.title} (copy)` }).returning();
      res.status(201).json({ kind, id: copy.id });
      return;
    }
    if (kind === "quiz") {
      const [row] = await db.select().from(quizzesTable).where(and(eq(quizzesTable.id, id), eq(quizzesTable.teacherId, teacherId))).limit(1);
      if (!row) { res.status(404).json({ error: "Not found" }); return; }
      const { id: _i, createdAt: _c, ...rest } = row;
      const [copy] = await db.insert(quizzesTable).values({ ...rest, title: `${rest.title} (copy)` }).returning();
      res.status(201).json({ kind, id: copy.id });
      return;
    }
    const [row] = await db.select().from(parentDraftsTable).where(and(eq(parentDraftsTable.id, id), eq(parentDraftsTable.teacherId, teacherId))).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const { id: _i, createdAt: _c, ...rest } = row;
    const [copy] = await db.insert(parentDraftsTable).values(rest).returning();
    res.status(201).json({ kind, id: copy.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
