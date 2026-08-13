import { Router } from "express";
import { db } from "@workspace/db";
import { modulesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { buildLessonCoachContext, coachReply, deterministicOpener } from "../lib/lessonCoach";

const router = Router();

/**
 * The in-lesson Coach: a learner's always-available AI guide for a specific module. Grounded in the
 * module's own content, aware of the learner's gaps, and adaptive to their coaching profile.
 */

// GET /modules/:moduleId/coach -- opener message + this learner's current gaps for the lesson.
router.get("/modules/:moduleId/coach", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const ctx = await buildLessonCoachContext(req.params.moduleId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Module not found" }); return; }
  res.json({ opener: deterministicOpener(ctx), gaps: ctx.gaps, masteryPct: ctx.masteryPct, learnerName: ctx.learnerName });
});

// POST /modules/:moduleId/coach -- one coaching turn. Body: { messages: [{role,content}, ...] }.
router.post("/modules/:moduleId/coach", requireAuth, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 4000) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    res.status(400).json({ error: "Send the conversation with the learner's latest message last." });
    return;
  }
  const ctx = await buildLessonCoachContext(req.params.moduleId, req.userId!);
  if (!ctx) { res.status(404).json({ error: "Module not found" }); return; }
  try {
    const reply = await coachReply(ctx, messages);
    res.json({ reply });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("lesson coach failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "The coach is unavailable right now. Please try again." });
  }
});

export default router;
