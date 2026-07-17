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
  type StudyPlanItem,
} from "@workspace/db";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isDue } from "../lib/sm2";

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

export default router;
