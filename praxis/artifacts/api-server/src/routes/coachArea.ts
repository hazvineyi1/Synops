import { Router } from "express";
import { db } from "@workspace/db";
import {
  coachPlansTable,
  coursesTable,
  conceptMasteryTable,
  sessionsTable,
  modulesTable,
  beatsTable,
  caseScenariosTable,
  interactiveActivitiesTable,
  remedialSetsTable,
  remedialFlashcardsTable,
  remedialQuestionsTable,
  type StudyPlanItem,
} from "@workspace/db";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isDue, sm2Update } from "../lib/sm2";
import { ensureRemediationSet, bumpGamification, getGamification } from "../lib/remediationEngine";

/**
 * The in-LMS "Coach" area for off-track learners: a native, remedial-scoped surface
 * that composes what Praxis already has — the off-track study plan (Materials), the
 * concept-mastery map (Progress), and the Socratic session engine (Tutor). Everything
 * here is scoped to the signed-in learner's ACTIVE gradebook-alert (remedial) plans, so
 * it only ever shows the gap the learner is bridging. All routes are userId-scoped.
 */
const router = Router();

type Plan = { p: typeof coachPlansTable.$inferSelect; courseTitle: string | null };

/** The learner's active remedial (gradebook_alert) plans, newest first, with course title. */
async function activeRemedialPlans(userId: string): Promise<Plan[]> {
  return db
    .select({ p: coachPlansTable, courseTitle: coursesTable.title })
    .from(coachPlansTable)
    .leftJoin(coursesTable, eq(coachPlansTable.courseId, coursesTable.id))
    .where(
      and(
        eq(coachPlansTable.userId, userId),
        eq(coachPlansTable.source, "gradebook_alert"),
        eq(coachPlansTable.status, "active"),
      ),
    )
    .orderBy(desc(coachPlansTable.updatedAt));
}

function planItems(p: typeof coachPlansTable.$inferSelect): StudyPlanItem[] {
  return (Array.isArray(p.items) ? p.items : []) as StudyPlanItem[];
}

// GET /learn/coach/overview — the remedial context that powers the Coach landing +
// Materials list + Tutor's recent sessions. Active = the learner has remedial work.
router.get("/learn/coach/overview", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const plans = await activeRemedialPlans(userId);

  const gapSet = new Set<string>();
  let materialCount = 0;
  const outPlans = plans.map(({ p, courseTitle }) => {
    const items = planItems(p).map((it, index) => {
      if (it.category) gapSet.add(it.category);
      return {
        index,
        refType: it.refType,
        refId: it.refId,
        title: it.title,
        why: it.why,
        category: it.category,
        done: !!it.done,
      };
    });
    materialCount += items.length;
    const gaps = [...new Set(items.map((i) => i.category).filter(Boolean))] as string[];
    return {
      planId: p.id,
      courseId: p.courseId,
      courseTitle: courseTitle ?? "Your course",
      rationale: p.rationale,
      coachUrl: p.coachUrl ?? null,
      gaps,
      items,
    };
  });

  // Recent remedial tutor sessions (Socratic sessions started with a remedial focus).
  const sessRows = await db
    .select({
      id: sessionsTable.id,
      moduleId: sessionsTable.moduleId,
      moduleTitle: modulesTable.title,
      remedialFocus: sessionsTable.remedialFocus,
      status: sessionsTable.status,
      masteryScore: sessionsTable.masteryScore,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .leftJoin(modulesTable, eq(sessionsTable.moduleId, modulesTable.id))
    .where(eq(sessionsTable.userId, userId))
    .orderBy(desc(sessionsTable.createdAt))
    .limit(20);
  const recentSessions = sessRows
    .filter((s) => s.remedialFocus)
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      moduleId: s.moduleId,
      moduleTitle: s.moduleTitle ?? "Session",
      remedialFocus: s.remedialFocus,
      status: s.status,
      masteryScore: s.masteryScore != null ? Number(s.masteryScore) : null,
      createdAt: s.createdAt?.toISOString() ?? null,
    }));

  res.json({
    active: outPlans.length > 0,
    learnerName: (req.dbUser as { firstName?: string } | undefined)?.firstName ?? null,
    plans: outPlans,
    materialCount,
    gapCount: gapSet.size,
    gaps: [...gapSet],
    recentSessions,
  });
});

// GET /learn/coach/material?refType=&refId= — read one remedial material's content as a
// lesson. Ownership is enforced: the ref must appear in one of the learner's active
// remedial plans, so a learner can only read their own catch-up content.
router.get("/learn/coach/material", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const refType = String(req.query.refType ?? "");
  const refId = String(req.query.refId ?? "");
  if (!refId || !["case", "activity", "module"].includes(refType)) {
    res.status(400).json({ error: "refType (case|activity|module) and refId are required." });
    return;
  }

  const plans = await activeRemedialPlans(userId);
  let owned: StudyPlanItem | undefined;
  for (const { p } of plans) {
    const it = planItems(p).find((i) => i.refType === refType && i.refId === refId);
    if (it) {
      owned = it;
      break;
    }
  }
  if (!owned) {
    res.status(404).json({ error: "Material not found in your remedial plan." });
    return;
  }

  type Section = { heading: string; body: string };
  const sections: Section[] = [];
  let concepts: string[] = [];
  let title = owned.title;
  let tutorModuleId: string | null = null;
  let launch: { type: string; path: string } | null = null;

  if (refType === "case") {
    const [c] = await db.select().from(caseScenariosTable).where(eq(caseScenariosTable.id, refId)).limit(1);
    if (c) {
      title = c.title;
      tutorModuleId = c.moduleId ?? null;
      if (c.learningObjective) sections.push({ heading: "What you'll master", body: c.learningObjective });
      if (c.contextBlock) sections.push({ heading: "The situation", body: c.contextBlock });
      if (c.openingQuestion) sections.push({ heading: "Where the coach will start", body: c.openingQuestion });
      concepts = (Array.isArray(c.focusAreas) ? c.focusAreas : []) as string[];
      launch = { type: "case", path: `/cases/${refId}/begin` };
    }
  } else if (refType === "activity") {
    const [a] = await db
      .select()
      .from(interactiveActivitiesTable)
      .where(eq(interactiveActivitiesTable.id, refId))
      .limit(1);
    if (a) {
      title = a.title;
      tutorModuleId = a.moduleId ?? null;
      if (a.instructions) sections.push({ heading: "Instructions", body: a.instructions });
      concepts = (Array.isArray(a.tags) ? a.tags : []) as string[];
      launch = { type: "activity", path: `/activities/${refId}/play` };
    }
  } else if (refType === "module") {
    const [m] = await db.select().from(modulesTable).where(eq(modulesTable.id, refId)).limit(1);
    const beats = await db
      .select()
      .from(beatsTable)
      .where(eq(beatsTable.moduleId, refId))
      .orderBy(asc(beatsTable.order));
    if (m) title = m.title;
    tutorModuleId = refId;
    for (const b of beats) {
      const parts: string[] = [];
      if (b.narration) parts.push(b.narration);
      if (b.scenario) parts.push(b.scenario);
      const bullets = (Array.isArray(b.bulletPoints) ? b.bulletPoints : []) as string[];
      if (bullets.length) parts.push(bullets.map((x) => `• ${x}`).join("\n"));
      if (parts.length) sections.push({ heading: b.title || "Key idea", body: parts.join("\n\n") });
      if (b.title) concepts.push(b.title);
    }
  }

  res.json({
    refType,
    refId,
    title,
    why: owned.why,
    category: owned.category,
    sections,
    concepts: concepts.slice(0, 12),
    launch, // case/activity runtime; null for module (use the tutor)
    tutor: { moduleId: tutorModuleId, focus: owned.category || title },
  });
});

// GET /learn/coach/progress — concept (module) mastery for the remedial course(s) plus
// the gap categories being bridged, so the learner sees where they are and what's left.
router.get("/learn/coach/progress", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const plans = await activeRemedialPlans(userId);
  const courseIds = [...new Set(plans.map(({ p }) => p.courseId).filter(Boolean))] as string[];

  const masteryRows = await db
    .select()
    .from(conceptMasteryTable)
    .where(eq(conceptMasteryTable.userId, userId))
    .orderBy(desc(conceptMasteryTable.updatedAt));
  const concepts = masteryRows
    .filter((r) => courseIds.length === 0 || (r.courseId != null && courseIds.includes(r.courseId)))
    .map((r) => ({
      moduleId: r.moduleId,
      moduleTitle: r.moduleTitle,
      courseId: r.courseId,
      mastery: Number(r.mastery),
      reps: r.reps,
      due: isDue(r.dueDate),
    }));

  const gaps: Array<{ category: string; courseId: string | null; courseTitle: string }> = [];
  const seen = new Set<string>();
  for (const { p, courseTitle } of plans) {
    for (const it of planItems(p)) {
      const key = `${p.courseId}::${it.category}`;
      if (it.category && !seen.has(key)) {
        seen.add(key);
        gaps.push({ category: it.category, courseId: p.courseId, courseTitle: courseTitle ?? "Your course" });
      }
    }
  }

  res.json({ hasData: concepts.length > 0 || gaps.length > 0, concepts, gaps });
});

// GET /learn/coach/practice?planId=&category= — the adaptive, multi-modal practice for one gap:
// flashcards + knowledge questions generated (once) from the learner's OWN course content, plus
// the course cases/activities that target the gap, plus gamification. Addressed by name.
router.get("/learn/coach/practice", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const planId = String(req.query.planId ?? "");
  const category = String(req.query.category ?? "");
  if (!category) {
    res.status(400).json({ error: "category is required." });
    return;
  }
  const firstName = (req.dbUser as { firstName?: string } | undefined)?.firstName ?? null;

  const plans = await activeRemedialPlans(userId);
  const match = plans.find(({ p }) => (planId ? p.id === planId : true) && planItems(p).some((i) => i.category === category));
  if (!match) {
    res.status(404).json({ error: "That gap is not in your remedial plan." });
    return;
  }
  const courseId = match.p.courseId;

  let set: { setId: string; status: string };
  try {
    set = await ensureRemediationSet({ userId, planId: match.p.id, courseId, category, learnerName: firstName });
  } catch {
    res.status(500).json({ error: "Could not build your practice set. Please try again." });
    return;
  }

  const [flashRows, qRows] = await Promise.all([
    db.select().from(remedialFlashcardsTable).where(eq(remedialFlashcardsTable.setId, set.setId)).orderBy(asc(remedialFlashcardsTable.order)),
    db.select().from(remedialQuestionsTable).where(eq(remedialQuestionsTable.setId, set.setId)).orderBy(asc(remedialQuestionsTable.order)),
  ]);

  const flashcards = flashRows.map((f) => ({ id: f.id, front: f.front, back: f.back, hint: f.hint, mastery: f.mastery, due: isDue(f.dueDate) }));
  const questions = qRows.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options,
    difficulty: q.difficulty,
    // Only reveal the answer + explanation once the learner has attempted it.
    answered: q.attempts > 0 ? { choice: q.lastChoice, correct: q.lastCorrect, correctIndex: q.correctIndex, explanation: q.explanation } : null,
  }));

  // "Different methods": the course cases/activities on this learner's plan that target the gap.
  const methods = planItems(match.p)
    .filter((it) => it.category === category && (it.refType === "case" || it.refType === "activity") && it.refId)
    .map((it) => ({ title: it.title, type: it.refType, path: it.refType === "case" ? `/cases/${it.refId}/begin` : `/activities/${it.refId}/play` }));

  const gamification = await getGamification(userId);
  const name = firstName || "there";
  const intro = set.status === "empty"
    ? `${name}, let's rebuild ${category} together — start a coaching session and we'll work through it step by step.`
    : `${name}, here's your practice to close ${category}. Flip through the cards, test yourself, and watch your streak grow.`;

  res.json({
    setId: set.setId,
    status: set.status,
    category,
    courseTitle: match.courseTitle ?? "Your course",
    learnerName: name,
    intro,
    flashcards,
    questions,
    methods,
    gamification,
  });
});

// POST /learn/coach/flashcard/:id/review { grade: 0-3 } — grade a flashcard, advance its SM-2
// schedule, award XP + streak. The learner experiences this as Again/Hard/Good/Easy.
router.post("/learn/coach/flashcard/:id/review", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const grade = Math.max(0, Math.min(3, Number(req.body?.grade)));
  if (!Number.isFinite(grade)) {
    res.status(400).json({ error: "grade (0-3) is required." });
    return;
  }
  const [card] = await db.select().from(remedialFlashcardsTable).where(eq(remedialFlashcardsTable.id, req.params.id)).limit(1);
  if (!card || card.userId !== userId) {
    res.status(404).json({ error: "Card not found." });
    return;
  }
  const next = sm2Update(card.mastery, card.ef, card.interval, card.reps, grade);
  await db
    .update(remedialFlashcardsTable)
    .set({ mastery: next.mastery, ef: next.ef, interval: next.interval, reps: next.reps, dueDate: next.dueDate, lastReviewedAt: new Date() })
    .where(eq(remedialFlashcardsTable.id, card.id));
  const gamification = await bumpGamification(userId, grade >= 2 ? 6 : 3);
  res.json({ mastery: next.mastery, due: next.dueDate, gamification });
});

// POST /learn/coach/question/:id/answer { choice } — check a knowledge question, reveal the
// answer + explanation, award XP + streak.
router.post("/learn/coach/question/:id/answer", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const choice = Number(req.body?.choice);
  const [q] = await db.select().from(remedialQuestionsTable).where(eq(remedialQuestionsTable.id, req.params.id)).limit(1);
  if (!q || q.userId !== userId) {
    res.status(404).json({ error: "Question not found." });
    return;
  }
  if (!Number.isInteger(choice) || choice < 0 || choice >= (q.options as string[]).length) {
    res.status(400).json({ error: "A valid choice index is required." });
    return;
  }
  const correct = choice === q.correctIndex;
  await db
    .update(remedialQuestionsTable)
    .set({ attempts: q.attempts + 1, lastChoice: choice, lastCorrect: correct })
    .where(eq(remedialQuestionsTable.id, q.id));
  const gamification = await bumpGamification(userId, correct ? 10 : 3);
  res.json({ correct, correctIndex: q.correctIndex, explanation: q.explanation, gamification });
});

// GET /learn/coach/gamification — the learner's XP + streak for the Coach header.
router.get("/learn/coach/gamification", requireAuth, async (req, res) => {
  res.json(await getGamification(req.userId!));
});

export default router;
