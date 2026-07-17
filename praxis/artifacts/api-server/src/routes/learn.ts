import { Router } from "express";
import { db } from "@workspace/db";
import {
  enrolmentsTable,
  modulesTable,
  conceptMasteryTable,
  coachPlansTable,
  usersTable,
  sessionsTable,
  coursesTable,
  type CoachPlanItem,
  type StudyPlanItem,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { SOCRATIC_MODEL } from "../lib/socraticEngine";
import { isDue } from "../lib/sm2";

const router = Router();

const PERSONALITY_VOICE: Record<string, string> = {
  socratic_mentor: "calm, curious and patient",
  drill_sergeant: "direct, demanding and high-tempo (pressure on the work, never the person)",
  warm_encourager: "warm, affirming and human",
  strategic_analyst: "precise, structured and evidence-driven",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildPlanItems(userId: string): Promise<CoachPlanItem[]> {
  const enrolments = await db
    .select()
    .from(enrolmentsTable)
    .where(and(eq(enrolmentsTable.userId, userId), eq(enrolmentsTable.status, "active")));
  const courseIds = enrolments.map((e) => e.courseId);

  const modules = courseIds.length
    ? await db
        .select()
        .from(modulesTable)
        .where(and(inArray(modulesTable.courseId, courseIds), eq(modulesTable.status, "published")))
    : [];

  const mastery = await db
    .select()
    .from(conceptMasteryTable)
    .where(eq(conceptMasteryTable.userId, userId));
  const masteryByModule = new Map(mastery.map((m) => [m.moduleId, m]));

  const due: CoachPlanItem[] = [];
  const weak: CoachPlanItem[] = [];
  const fresh: CoachPlanItem[] = [];

  for (const mod of modules) {
    const m = masteryByModule.get(mod.id);
    const item = (kind: CoachPlanItem["kind"], reason: string): CoachPlanItem => ({
      moduleId: mod.id,
      moduleTitle: mod.title,
      courseId: mod.courseId,
      kind,
      reason,
      done: false,
    });
    if (!m) {
      fresh.push(item("new", "New ground you have not started yet."));
    } else if (isDue(m.dueDate)) {
      due.push(item("review", "Due for review before it fades - let us keep it sharp."));
    } else if (Number(m.mastery) < 0.5) {
      weak.push(item("weak", "Still shaky - worth another pass to lock it in."));
    }
  }

  // Reviews first (protects credentials from decay), then weak spots, then new.
  return [...due, ...weak, ...fresh].slice(0, 5);
}

async function generateRationale(
  user: typeof usersTable.$inferSelect,
  items: CoachPlanItem[],
  yesterday: { rationale: string; items: CoachPlanItem[] } | null
): Promise<string> {
  if (items.length === 0) {
    return "Nothing is due today and you are on top of your modules. Rest counts - come back tomorrow, or start something new from the catalogue.";
  }
  const voice = PERSONALITY_VOICE[user.coachPersonality] ?? PERSONALITY_VOICE.socratic_mentor;
  const name = user.firstName ? `, ${user.firstName}` : "";
  const yList = yesterday
    ? `Yesterday's plan: ${yesterday.items.map((i) => i.moduleTitle).join(", ") || "none"}.`
    : "This is an early day together.";
  const todayList = items
    .map((i) => `- ${i.moduleTitle} (${i.kind}): ${i.reason}`)
    .join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: SOCRATIC_MODEL,
      max_tokens: 220,
      system: `You are a study coach whose voice is ${voice}. Write a short daily opening (2-3 sentences, under 65 words) that hands the learner today's plan with a clear rationale that references continuity from yesterday. Warm but never gushing. South African English. No em dashes or en dashes. Do not use bullet points. Do not restate the whole list mechanically; give the reasoning that ties it together.`,
      messages: [
        {
          role: "user",
          content: `Learner${name}. ${yList}\nToday's concepts:\n${todayList}\n\nWrite the opening now.`,
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (text) return text;
  } catch {
    // fall through
  }
  return `Here is today's plan${name}. We start with what is due so your credentials stay sharp, then shore up the shaky spots. One concept at a time.`;
}

async function getOrCreatePlan(user: typeof usersTable.$inferSelect, force = false) {
  const day = today();
  const existing = await db.query.coachPlansTable.findFirst({
    where: and(eq(coachPlansTable.userId, user.id), eq(coachPlansTable.planDate, day)),
  });
  if (existing && !force) return existing;

  const [yesterday] = await db
    .select()
    .from(coachPlansTable)
    .where(eq(coachPlansTable.userId, user.id))
    .orderBy(desc(coachPlansTable.planDate))
    .limit(1);

  const items = await buildPlanItems(user.id);
  const rationale = await generateRationale(
    user,
    items,
    yesterday && yesterday.planDate !== day
      ? { rationale: yesterday.rationale, items: yesterday.items as CoachPlanItem[] }
      : null
  );

  if (existing) {
    const [updated] = await db
      .update(coachPlansTable)
      .set({ items, rationale, status: "active", updatedAt: new Date() })
      .where(eq(coachPlansTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(coachPlansTable)
    .values({ userId: user.id, planDate: day, items, rationale, status: "active" })
    .returning();
  return created;
}

/**
 * The learner's active off-track remedial plans (source='gradebook_alert') mapped into coach-plan
 * items, so the AI coach can lead with catch-up work. Read-time only — never persisted into the
 * daily source='coach' row, keeping the two sources cleanly separated in storage.
 */
async function getRemedialCatchUp(userId: string) {
  const rows = await db
    .select({ p: coachPlansTable, courseTitle: coursesTable.title })
    .from(coachPlansTable)
    .leftJoin(coursesTable, eq(coachPlansTable.courseId, coursesTable.id))
    .where(and(eq(coachPlansTable.userId, userId), eq(coachPlansTable.source, "gradebook_alert"), eq(coachPlansTable.status, "active")))
    .orderBy(desc(coachPlansTable.updatedAt));
  if (!rows.length) return null;

  const items: any[] = [];
  let rationale = "";
  for (const r of rows) {
    const its = (Array.isArray(r.p.items) ? r.p.items : []) as StudyPlanItem[];
    if (!rationale && r.p.rationale) rationale = r.p.rationale;
    for (const it of its) {
      if (it.done) continue; // only open catch-up work leads the path
      items.push({
        moduleId: it.refType === "module" ? it.refId : null,
        moduleTitle: it.title,
        courseId: r.p.courseId,
        courseTitle: r.courseTitle ?? null,
        kind: "catchup",
        reason: it.why,
        done: false,
        remedial: true,
        refType: it.refType,
        refId: it.refId,
        category: it.category,
        planId: r.p.id,
      });
    }
  }
  if (!items.length) return null;
  // The magic-link URL The Coach returned for this learner's pushed plan (most-recent active row),
  // so the learner can open the AI coach straight onto the remedial work. Null until pushed/configured.
  const coachUrl = rows.find((r) => r.p.coachUrl)?.p.coachUrl ?? null;
  return { items, rationale, courseTitle: rows[0].courseTitle ?? null, coachUrl };
}

// GET /learn/plan — today's coach-led plan (the spine), with any off-track catch-up work led first.
router.get("/learn/plan", requireAuth, async (req, res) => {
  const plan = await getOrCreatePlan(req.dbUser!);
  const remedial = await getRemedialCatchUp(req.dbUser!.id);
  const spine = (Array.isArray(plan.items) ? plan.items : []) as CoachPlanItem[];
  res.json({
    ...plan,
    items: remedial ? [...remedial.items, ...spine] : spine,
    catchUp: remedial
      ? { active: true, rationale: remedial.rationale, courseTitle: remedial.courseTitle, coachUrl: remedial.coachUrl }
      : { active: false },
  });
});

// POST /learn/plan/regenerate — negotiate / rebuild today's plan
router.post("/learn/plan/regenerate", requireAuth, async (req, res) => {
  const plan = await getOrCreatePlan(req.dbUser!, true);
  res.json(plan);
});

// PATCH /learn/plan/item — mark a plan item done
router.patch("/learn/plan/item", requireAuth, async (req, res) => {
  const { moduleId, done } = req.body as { moduleId: string; done: boolean };
  const plan = await getOrCreatePlan(req.dbUser!);
  const items = (plan.items as CoachPlanItem[]).map((i) =>
    i.moduleId === moduleId ? { ...i, done: !!done } : i
  );
  const allDone = items.length > 0 && items.every((i) => i.done);
  const [updated] = await db
    .update(coachPlansTable)
    .set({ items, status: allDone ? "completed" : "active", updatedAt: new Date() })
    .where(eq(coachPlansTable.id, plan.id))
    .returning();
  res.json(updated);
});

// GET /learn/mastery — concept mastery map (learner-facing progress)
router.get("/learn/mastery", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(conceptMasteryTable)
    .where(eq(conceptMasteryTable.userId, req.userId!))
    .orderBy(desc(conceptMasteryTable.updatedAt));
  res.json(
    rows.map((r) => ({
      moduleId: r.moduleId,
      moduleTitle: r.moduleTitle,
      courseId: r.courseId,
      mastery: Number(r.mastery),
      reps: r.reps,
      lastGrade: r.lastGrade,
      dueDate: r.dueDate,
      due: isDue(r.dueDate),
      lastReviewedAt: r.lastReviewedAt?.toISOString() ?? null,
    }))
  );
});

/**
 * GET /learn/density — recommends Focus vs Full-view interface density from REAL
 * behavioural signals (how many sessions the learner has had, and how many of their
 * studied concepts currently sit below mastery), never from a self-reported label.
 *
 * IMPORTANT: the two thresholds below are THEORY-DERIVED STARTING GUESSES from the
 * cognitive-load brief, not validated setpoints. They are exactly the numbers that
 * should be run as a small multi-armed-bandit pilot before being trusted (see the brief,
 * Section 7.5). Until then they set the DEFAULT density only; the client persists the
 * learner's explicit choice, which always overrides this. This keeps the visible layout
 * stable (it never flips under the learner once they've chosen) while the model updates
 * underneath.
 */
router.get("/learn/density", requireAuth, async (req, res) => {
  const sessions = await db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, req.userId!));

  const mastery = await db
    .select({ m: conceptMasteryTable.mastery })
    .from(conceptMasteryTable)
    .where(eq(conceptMasteryTable.userId, req.userId!));

  const conceptsStudied = mastery.length;
  const belowMastery = mastery.filter((r) => Number(r.m) < 0.5).length;
  const lowMasteryRate = conceptsStudied > 0 ? belowMastery / conceptsStudied : 0;

  const NEW_LEARNER_SESSIONS = 3; // pilot-tunable (brief 3.4 / 7.5)
  const STRUGGLING_RATE = 0.3; // pilot-tunable

  // New to the system, or currently struggling => Focus (protect working memory).
  const focus = sessions.length < NEW_LEARNER_SESSIONS || lowMasteryRate > STRUGGLING_RATE;

  res.json({
    density: focus ? "focus" : "full",
    signals: {
      sessions: sessions.length,
      conceptsStudied,
      lowMasteryRate: Math.round(lowMasteryRate * 100) / 100,
    },
  });
});

// GET /learn/profile — coach personalisation
router.get("/learn/profile", requireAuth, async (req, res) => {
  const u = req.dbUser!;
  res.json({
    coachPersonality: u.coachPersonality,
    learningStyle: u.learningStyle,
    accommodations: u.accommodations,
    phone: u.phone,
    whatsappOptIn: u.whatsappOptIn,
  });
});

// PATCH /learn/profile — update coach personality, VARK, accommodations, WhatsApp
router.patch("/learn/profile", requireAuth, async (req, res) => {
  const { coachPersonality, learningStyle, accommodations, phone, whatsappOptIn } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const personalities = ["socratic_mentor", "drill_sergeant", "warm_encourager", "strategic_analyst"];
  if (personalities.includes(coachPersonality)) patch.coachPersonality = coachPersonality;
  if (learningStyle === null || ["visual", "auditory", "kinesthetic", "reading_writing"].includes(learningStyle))
    patch.learningStyle = learningStyle;
  if (Array.isArray(accommodations)) patch.accommodations = accommodations;
  if (typeof phone === "string") patch.phone = phone;
  if (typeof whatsappOptIn === "boolean") patch.whatsappOptIn = whatsappOptIn;

  const [updated] = await db
    .update(usersTable)
    .set(patch)
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json({
    coachPersonality: updated.coachPersonality,
    learningStyle: updated.learningStyle,
    accommodations: updated.accommodations,
    phone: updated.phone,
    whatsappOptIn: updated.whatsappOptIn,
  });
});

export default router;
