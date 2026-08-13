import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { interactiveActivitiesTable, modulesTable, coursesTable, moduleReadingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { canStaffActOnCourse, canParticipateInCourse } from "../lib/scope";
import { anthropic } from "@workspace/integrations-anthropic-ai";

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

// Ask the model for rubric criteria grounded in some content. Returns cleaned criteria.
async function generateCriteria(context: string, whatFor: string): Promise<{ title: string; criteria: { name: string; descriptor: string; points: number }[] }> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 1200,
    messages: [{ role: "user", content: `Write a clear grading RUBRIC for ${whatFor}, grounded in the content below. Use 4-6 criteria; each criterion has a short name, a one-sentence descriptor of what earns full marks, and a point value (whole numbers, sensible weights that total 100 or a clean number). Reply ONLY as JSON: { "title": "…", "criteria": [ { "name": "…", "descriptor": "…", "points": 25 } ] }\n\n=== CONTENT ===\n${context.slice(0, 12000)}` }],
  }, { timeout: 90000, maxRetries: 1 });
  const t = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = (() => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } })();
  return { title: String(parsed.title ?? "").slice(0, 200), criteria: cleanCriteria(parsed.criteria) };
}

// POST /courses/:courseId/rubrics/generate -- draft a rubric from the course + its modules, and save it.
router.post("/courses/:courseId/rubrics/generate", requireAuth, async (req, res) => {
  if (!(await canStaffActOnCourse(req.dbUser!, req.params.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, req.params.courseId) });
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const mods = await db.select({ title: modulesTable.title, objectives: modulesTable.objectives }).from(modulesTable).where(eq(modulesTable.courseId, req.params.courseId));
  const ctx = `Course: ${course.title}\n${course.description ?? ""}\nObjectives: ${(course.objectives ?? []).join("; ")}\nModules:\n${mods.map((m) => `- ${m.title}: ${(m.objectives ?? []).join("; ")}`).join("\n")}`;
  try {
    const g = await generateCriteria(ctx, `assessing learners' work across this course`);
    if (!g.criteria.length) { res.status(422).json({ error: "Could not derive rubric criteria from the course." }); return; }
    const id = randomUUID();
    await db.execute(sql`INSERT INTO course_rubrics (id, course_id, title, criteria) VALUES (${id}, ${req.params.courseId}, ${g.title || "Course rubric"}, ${JSON.stringify(g.criteria)}::jsonb)`);
    const row = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE id = ${id} LIMIT 1`));
    res.status(201).json(shape(row[0]));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("rubric gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not generate a rubric. Please try again." });
  }
});

// POST /activities/:activityId/rubric/generate -- draft a rubric grounded in THIS activity and attach it.
router.post("/activities/:activityId/rubric/generate", requireAuth, async (req, res) => {
  const act = await db.query.interactiveActivitiesTable.findFirst({ where: eq(interactiveActivitiesTable.id, req.params.activityId) });
  if (!act) { res.status(404).json({ error: "Activity not found" }); return; }
  if (!act.courseId) { res.status(400).json({ error: "Attach the activity to a course first." }); return; }
  if (!(await canStaffActOnCourse(req.dbUser!, act.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  // Ground it in the activity + (best effort) the module's reading, so criteria fit what's assessed.
  let readingText = "";
  if (act.moduleId) {
    const rs = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, act.moduleId));
    readingText = rs.map((r) => r.content ?? "").filter(Boolean).join("\n\n").slice(0, 6000);
  }
  const specText = (() => { try { return JSON.stringify((act as { spec?: unknown }).spec ?? {}).replace(/<[^>]+>/g, " ").slice(0, 3000); } catch { return ""; } })();
  const ctx = `Activity: ${act.title}\nType: ${act.kind}\nInstructions: ${act.instructions ?? ""}\nContent: ${specText}\n\nModule reading (context):\n${readingText}`;
  try {
    const g = await generateCriteria(ctx, `grading this "${act.kind}" activity`);
    if (!g.criteria.length) { res.status(422).json({ error: "Could not derive rubric criteria." }); return; }
    const id = randomUUID();
    await db.execute(sql`INSERT INTO course_rubrics (id, course_id, title, criteria) VALUES (${id}, ${act.courseId}, ${g.title || `${act.title} rubric`}, ${JSON.stringify(g.criteria)}::jsonb)`);
    await db.update(interactiveActivitiesTable).set({ rubricId: id } as any).where(eq(interactiveActivitiesTable.id, act.id));
    const row = rowsOf(await db.execute(sql`SELECT * FROM course_rubrics WHERE id = ${id} LIMIT 1`));
    res.status(201).json({ rubric: shape(row[0]), rubricId: id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("activity rubric gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not generate a rubric for this activity." });
  }
});

export default router;
