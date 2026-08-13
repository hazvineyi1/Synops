import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { modulesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { buildLessonCoachContext, coachReply, deterministicOpener } from "../lib/lessonCoach";

const router = Router();

/**
 * The in-lesson Coach: a learner's always-available AI guide for a specific module. Grounded in the
 * module's own content, aware of the learner's real activity results, and adaptive to their profile.
 * Conversation history is saved per (learner, module) so the coach remembers across visits.
 */

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lesson_coach_messages (
      id text PRIMARY KEY,
      module_id text NOT NULL,
      user_id text NOT NULL,
      role text NOT NULL,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS lesson_coach_messages_user_module_idx ON lesson_coach_messages (user_id, module_id, created_at)`);
  ensured = true;
}
const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : (res?.rows ?? []));

type Turn = { role: "user" | "assistant"; content: string };
async function loadHistory(userId: string, moduleId: string, limit = 40): Promise<Turn[]> {
  try {
    const rows = rowsOf(await db.execute(sql`
      SELECT role, content FROM lesson_coach_messages
      WHERE user_id = ${userId} AND module_id = ${moduleId}
      ORDER BY created_at ASC LIMIT ${limit}`));
    return rows
      .filter((r: any) => (r.role === "user" || r.role === "assistant") && typeof r.content === "string")
      .map((r: any) => ({ role: r.role, content: r.content }));
  } catch { return []; }
}
async function saveTurn(userId: string, moduleId: string, role: "user" | "assistant", content: string) {
  try {
    await db.execute(sql`
      INSERT INTO lesson_coach_messages (id, module_id, user_id, role, content)
      VALUES (${randomUUID()}, ${moduleId}, ${userId}, ${role}, ${content})`);
  } catch { /* non-fatal: a lost log line must not break the reply */ }
}

// GET /modules/:moduleId/coach -- opener + gaps + saved conversation history for this learner.
router.get("/modules/:moduleId/coach", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  await ensureTable();
  const ctx = await buildLessonCoachContext(req.params.moduleId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Module not found" }); return; }
  const history = await loadHistory(req.userId!, req.params.moduleId);
  res.json({ opener: deterministicOpener(ctx), gaps: ctx.gaps, masteryPct: ctx.masteryPct, learnerName: ctx.learnerName, history });
});

// GET /modules/:moduleId/coach/nudge -- a short PROACTIVE message the coach surfaces without being
// opened, ONLY when there is a concrete reason (a low activity score or a real gap). Null otherwise,
// so the coach never nags. Cheap: no AI call, just the learner's signals.
router.get("/modules/:moduleId/coach/nudge", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const ctx = await buildLessonCoachContext(req.params.moduleId, req.userId!);
  const nudge = ctx?.weakSpot ? `I noticed ${ctx.weakSpot}. Want to work through it together?` : null;
  res.json({ nudge });
});

// POST /modules/:moduleId/coach -- one coaching turn. Body: { message: string } (preferred) or
// { messages: [...] }. Uses stored history for memory, and persists both sides of the exchange.
router.post("/modules/:moduleId/coach", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Accept a single new message (preferred) or the last user message of a messages array.
  let userText = typeof req.body?.message === "string" ? req.body.message : "";
  if (!userText && Array.isArray(req.body?.messages)) {
    const last = [...req.body.messages].reverse().find((m: any) => m?.role === "user" && typeof m?.content === "string");
    userText = last?.content ?? "";
  }
  userText = String(userText).trim().slice(0, 4000);
  if (!userText) { res.status(400).json({ error: "Send the learner's message." }); return; }

  await ensureTable();
  const ctx = await buildLessonCoachContext(req.params.moduleId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Module not found" }); return; }
  const history = await loadHistory(req.userId!, req.params.moduleId);
  const convo: Turn[] = [...history, { role: "user", content: userText }];
  try {
    const reply = await coachReply(ctx, convo);
    await saveTurn(req.userId!, req.params.moduleId, "user", userText);
    await saveTurn(req.userId!, req.params.moduleId, "assistant", reply);
    res.json({ reply });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("lesson coach failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "The coach is unavailable right now. Please try again." });
  }
});

export default router;
