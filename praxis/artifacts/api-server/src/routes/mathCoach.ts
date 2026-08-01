import { Router } from "express";
import { db } from "@workspace/db";
import { moduleReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { mathHint, mathWorkedExample, generateMathSet } from "../lib/mathCoach";

/**
 * Math Coach — a Socratic hint layer for the interactive math game. The learner works a problem on
 * the frontend; when stuck they call /math-coach/hint, which returns ONE guiding question that never
 * reveals the answer, and after repeated misses /math-coach/worked-example models a similar problem.
 * /math-coach/generate builds a problem set from lesson content (authoring).
 */
const router = Router();
const requireAuthor = requireRole("coach", "org_admin", "partner_admin", "super_admin");

router.post("/math-coach/hint", requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const problem = String(b.problem ?? "").trim();
  if (!problem) { res.status(400).json({ error: "A problem is required." }); return; }
  const out = await mathHint({
    problem, answer: String(b.answer ?? ""), studentAnswer: b.studentAnswer ? String(b.studentAnswer) : undefined,
    attempts: Number(b.attempts) || 1, grade: b.grade ? String(b.grade) : undefined,
  });
  res.json(out);
});

router.post("/math-coach/worked-example", requireAuth, async (req, res) => {
  const b = req.body ?? {};
  const problem = String(b.problem ?? "").trim();
  if (!problem) { res.status(400).json({ error: "A problem is required." }); return; }
  const out = await mathWorkedExample({ problem, answer: String(b.answer ?? ""), grade: b.grade ? String(b.grade) : undefined });
  res.json(out);
});

router.post("/math-coach/generate", requireAuth, requireAuthor, async (req, res) => {
  const b = req.body ?? {};
  let content = String(b.content ?? "").trim();
  const moduleId = String(b.moduleId ?? "").trim();
  if (!content && moduleId) {
    const rows = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, moduleId));
    content = rows.map((r) => r.content).filter(Boolean).join("\n\n");
  }
  try {
    const out = await generateMathSet({
      subject: String(b.subject ?? ""), grade: String(b.grade ?? "a middle-school"),
      rigor: String(b.rigor ?? "intermediate"), content, topic: String(b.topic ?? ""),
    });
    res.json(out);
  } catch (e) {
    res.status(422).json({ error: e instanceof Error ? e.message : "Generation failed." });
  }
});

export default router;
