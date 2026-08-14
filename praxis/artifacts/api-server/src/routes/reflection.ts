import { Router } from "express";
import { db } from "@workspace/db";
import { modulesTable, coursesTable, moduleReadingsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { anthropic } from "@workspace/integrations-anthropic-ai";

/**
 * Guided reflection, the module's "assignment" as a reflective experience rather than a graded task.
 *
 * The learner is walked through a few AI-generated, content-grounded reflection prompts; on submit an
 * AI coach synthesises their reflection warmly, names their growth, and points to one next step. The
 * finished reflection is saved per learner (one row per module) so they can revisit it.
 *
 * Persistence uses a self-creating table so no migration is needed (mirrors setup-platform).
 */
const router = Router();

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS module_reflections (
      id text PRIMARY KEY,
      module_id text NOT NULL,
      course_id text NOT NULL,
      user_id text NOT NULL,
      answers jsonb NOT NULL DEFAULT '[]'::jsonb,
      feedback text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS module_reflections_user_module_uidx ON module_reflections (user_id, module_id)`);
  // Cache the AI-generated prompts per module so they are generated ONCE, not on every open
  // (the prior version hit the model on every reflection-tab load, which is what made it slow).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS module_reflection_prompts (
      module_id text PRIMARY KEY,
      prompts jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  ensured = true;
}

function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : (res?.rows ?? []);
}

async function getCachedPrompts(moduleId: string): Promise<string[] | null> {
  try {
    const r = rowsOf(await db.execute(sql`SELECT prompts FROM module_reflection_prompts WHERE module_id = ${moduleId} LIMIT 1`));
    const p = r[0]?.prompts;
    const arr = Array.isArray(p) ? p.map((x: any) => String(x)).filter(Boolean) : [];
    return arr.length >= 3 ? arr : null;
  } catch { return null; }
}

async function setCachedPrompts(moduleId: string, prompts: string[]): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO module_reflection_prompts (module_id, prompts, created_at)
      VALUES (${moduleId}, ${JSON.stringify(prompts)}::jsonb, now())
      ON CONFLICT (module_id) DO UPDATE SET prompts = EXCLUDED.prompts, created_at = now()`);
  } catch { /* non-fatal */ }
}

async function moduleCorpus(moduleId: string, mod: { title: string; description: string | null; objectives: string[] | null }): Promise<string> {
  const readings = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, moduleId));
  const text = readings.map((r) => r.content ?? "").filter(Boolean).join("\n\n").trim();
  return [
    `Module: ${mod.title}`,
    mod.description ? `Overview: ${mod.description}` : "",
    (mod.objectives?.length ? `Objectives:\n${mod.objectives.map((o) => `- ${o}`).join("\n")}` : ""),
    text ? `Reading:\n${text.slice(0, 12000)}` : "",
  ].filter(Boolean).join("\n\n");
}

async function generatePrompts(corpus: string, title: string): Promise<string[]> {
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 450,
      messages: [{ role: "user", content: `Write 4 short, guided REFLECTION prompts for a learner who has just finished the module "${title}". They should invite honest personal reflection on what was learned, how it connects to the learner's own goals/experience, what was challenging, and how they'll apply it, grounded in the module content below. Warm and open-ended, not quiz questions. Reply ONLY as JSON: { "prompts": ["...","...","...","..."] }\n\n=== MODULE ===\n${corpus.slice(0, 9000)}` }],
    }, { timeout: 25000, maxRetries: 1 });
    const t = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = (() => { try { return JSON.parse(t); } catch { const m = t.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } })();
    const prompts = Array.isArray(parsed.prompts) ? parsed.prompts.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 5) : [];
    if (prompts.length >= 3) return prompts;
  } catch { /* fall through to defaults */ }
  return [
    `What is the most important thing you took from "${title}", and why does it matter to you?`,
    "Where does this connect to your own experience, work, or goals?",
    "What felt unclear or challenging, and what would help you master it?",
    "What is one concrete way you will apply this in the next two weeks?",
  ];
}

// GET /modules/:moduleId/reflection -- guided prompts + this learner's saved reflection (if any).
router.get("/modules/:moduleId/reflection", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  let saved: any = null;
  try {
    const r = rowsOf(await db.execute(sql`SELECT answers, feedback, created_at FROM module_reflections WHERE user_id = ${req.userId} AND module_id = ${mod.id} LIMIT 1`));
    if (r[0]) saved = { answers: r[0].answers ?? [], feedback: r[0].feedback ?? null, createdAt: r[0].created_at };
  } catch { /* table empty/new */ }
  // Cached-first: only call the model the first time this module's reflection is opened.
  let prompts = await getCachedPrompts(mod.id);
  if (!prompts) {
    const corpus = await moduleCorpus(mod.id, mod);
    prompts = await generatePrompts(corpus, mod.title);
    await setCachedPrompts(mod.id, prompts);
  }
  res.json({ moduleTitle: mod.title, prompts, saved });
});

// POST /modules/:moduleId/reflection -- save answers, return warm AI synthesis. Body { answers:[{prompt,answer}] }.
router.post("/modules/:moduleId/reflection", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answers = rawAnswers
    .map((a: any) => ({ prompt: String(a?.prompt ?? "").slice(0, 500), answer: String(a?.answer ?? "").trim().slice(0, 4000) }))
    .filter((a: any) => a.answer);
  if (!answers.length) { res.status(400).json({ error: "Write at least one reflection before saving." }); return; }
  await ensureTable();

  let feedback = "";
  try {
    const body = answers.map((a: any, i: number) => `Q${i + 1}: ${a.prompt}\nA${i + 1}: ${a.answer}`).join("\n\n");
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      messages: [{ role: "user", content: `You are a warm, insightful learning coach responding to a learner's written reflection on the module "${mod.title}". In 3 short paragraphs: (1) reflect back what you notice in their thinking and affirm a genuine strength, (2) gently surface one insight or blind spot to consider, (3) offer one specific, encouraging next step. Speak directly to them ("you"). Warm, human, never generic or shaming. No headings.\n\n=== THEIR REFLECTION ===\n${body}` }],
    }, { timeout: 60000, maxRetries: 1 });
    feedback = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch { feedback = "Thank you for reflecting so honestly. Sit with what you noticed here, and carry your one next step into the coming week, that is where real learning takes hold."; }

  const id = `refl_${req.userId}_${mod.id}`.slice(0, 120);
  try {
    await db.execute(sql`
      INSERT INTO module_reflections (id, module_id, course_id, user_id, answers, feedback, created_at)
      VALUES (${id}, ${mod.id}, ${mod.courseId}, ${req.userId}, ${JSON.stringify(answers)}::jsonb, ${feedback}, now())
      ON CONFLICT (user_id, module_id) DO UPDATE SET answers = EXCLUDED.answers, feedback = EXCLUDED.feedback, created_at = now()`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("reflection save failed:", err instanceof Error ? err.message : err);
  }
  res.status(201).json({ feedback });
});

export default router;
