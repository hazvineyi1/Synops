import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, classProfilesTable } from "@workspace/paideia-db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireActiveTeacher } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth, requireActiveTeacher);

const schema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(120),
  yearGroup: z.string().min(1).max(40),
  syllabus: z.string().max(500).optional().nullable(),
  languageLevel: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function serialise(row: typeof classProfilesTable.$inferSelect) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(classProfilesTable)
    .where(eq(classProfilesTable.teacherId, req.teacher!.id))
    .orderBy(desc(classProfilesTable.createdAt));
  res.json({ profiles: rows.map(serialise) });
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .insert(classProfilesTable)
    .values({
      teacherId: req.teacher!.id,
      name: parsed.data.name.trim(),
      subject: parsed.data.subject.trim(),
      yearGroup: parsed.data.yearGroup.trim(),
      syllabus: parsed.data.syllabus ?? null,
      languageLevel: parsed.data.languageLevel ?? null,
      notes: parsed.data.notes ?? null,
    })
    .returning();
  res.status(201).json({ profile: serialise(row) });
});

router.patch("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [row] = await db
    .update(classProfilesTable)
    .set(parsed.data)
    .where(and(eq(classProfilesTable.id, id), eq(classProfilesTable.teacherId, req.teacher!.id)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ profile: serialise(row) });
});

router.delete("/:id", async (req, res) => {
  const id = req.params["id"];
  if (!id) { res.status(400).json({ error: "Missing id" }); return; }
  await db
    .delete(classProfilesTable)
    .where(and(eq(classProfilesTable.id, id), eq(classProfilesTable.teacherId, req.teacher!.id)));
  res.json({ ok: true });
});

export default router;
