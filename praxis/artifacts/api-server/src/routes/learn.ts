import { Router } from "express";
import { db } from "@workspace/db";
import {
  enrolmentsTable,
  modulesTable,
  conceptMasteryTable,
  coachPlansTable,
  usersTable,
  sessionsTable,
  type CoachPlanItem,
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

// GET /learn/plan — today's coach-led plan (the spine)
router.get("/learn/plan", requireAuth, async (req, res) => {
  const plan = await getOrCreatePlan(req.dbUser!);
  res.json(plan);
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
