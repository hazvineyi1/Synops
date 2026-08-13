import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canStaffActOnCourse, canParticipateInCourse } from "../lib/scope";

/**
 * Reusable, course-level RUBRICS. A rubric is a list of criteria, each with a descriptor and a point
 * value; the total is the sum. Activities (and, via their own mechanism, cases) attach to a rubric so
 * every graded piece states how it is judged. Self-creating table so no migration is needed.
 */
const router = Router();

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_rubrics (
      id text PRIMARY KEY,
      course_id text NOT NULL,
      title text NOT NULL,
      criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS course_rubrics_course_idx ON course_rubrics (course_id)`);
  ensured = true;
}
const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : (res?.rows ?? []));

// A criterion: { name, descriptor, points }. Total points = sum.
function cleanCriteria(input: unknown): { name: string; descriptor: string; points: number }[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((c: any) => ({ name: String(c?.name ?? "").slice(0, 200), descriptor: String(c?.descriptor ?? "").slice(0, 2000), points: Math.max(0, Math.round(Number(c?.points) || 0)) }))
    .filter((c) => c.name.trim())
    .slice(0, 30);
}
const total = (crit: { points: number }[]) => crit.reduce((s, c) => s + (c.points || 0), 0);
const shape = (r: any) => ({ id: r.id, courseId: r.course_id, title: r.title, criteria: r.criteria ?? [], totalPoints: total(r.criteria ?? []) });

// GET /courses/:courseId/rubrics
router.get("/courses/:courseId/rubrics", requireAuth, async (req, res) => {
  if (!(await canParticipateInCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const rows = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE course_id = ${req.params.courseId} ORDER BY created_at ASC`));
  res.json(rows.map(shape));
});

// POST /courses/:courseId/rubrics  { title, criteria }
router.post("/courses/:courseId/rubrics", requireAuth, async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const title = String((req.body ?? {}).title ?? "").trim().slice(0, 200);
  if (!title) { res.status(400).json({ error: "A rubric title is required." }); return; }
  const criteria = cleanCriteria((req.body ?? {}).criteria);
  const id = randomUUID();
  await db.execute(sql`INSERT INTO course_rubrics (id, course_id, title, criteria) VALUES (${id}, ${req.params.courseId}, ${title}, ${JSON.stringify(criteria)}::jsonb)`);
  const row = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE id = ${id} LIMIT 1`));
  res.status(201).json(shape(row[0]));
});

async function rubricCourse(id: string): Promise<string | null> {
  const r = rowsOf(await db.execute(sql`SELECT course_id FROM course_rubrics WHERE id = ${id} LIMIT 1`));
  return r[0]?.course_id ?? null;
}

// GET /rubrics/:id  (participants can read it, e.g. shown under an activity)
router.get("/rubrics/:id", requireAuth, async (req, res) => {
  await ensureTable();
  const courseId = await rubricCourse(req.params.id);
  if (!courseId) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const row = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE id = ${req.params.id} LIMIT 1`));
  res.json(shape(row[0]));
});

// PATCH /rubrics/:id  { title, criteria }
router.patch("/rubrics/:id", requireAuth, async (req, res) => {
  await ensureTable();
  const courseId = await rubricCourse(req.params.id);
  if (!courseId) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canStaffActOnCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const title = b.title !== undefined ? String(b.title).trim().slice(0, 200) : undefined;
  const criteria = b.criteria !== undefined ? cleanCriteria(b.criteria) : undefined;
  await db.execute(sql`
    UPDATE course_rubrics SET
      title = COALESCE(${title ?? null}, title),
      criteria = ${criteria === undefined ? sql`criteria` : sql`${JSON.stringify(criteria)}::jsonb`},
      updated_at = now()
    WHERE id = ${req.params.id}`);
  const row = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE id = ${req.params.id} LIMIT 1`));
  res.json(shape(row[0]));
});

// DELETE /rubrics/:id
router.delete("/rubrics/:id", requireAuth, async (req, res) => {
  await ensureTable();
  const courseId = await rubricCourse(req.params.id);
  if (courseId && !(await canStaffActOnCourse(req.dbUser!, courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.execute(sql`DELETE FROM course_rubrics WHERE id = ${req.params.id}`);
  res.status(204).send();
});

export default router;
