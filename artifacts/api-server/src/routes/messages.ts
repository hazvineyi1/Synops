import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import {
  coachMessagesTable,
  profilesTable,
  conceptsTable,
  dailyPlansTable,
  checkpointsTable,
} from "@workspace/db";
import { eq, lt, desc, and, lte } from "drizzle-orm";
import {
  createMessage,
  MODEL,
  buildSystemPrompt,
  checkRateLimit,
  FORMATTING_RULES,
  languageInstruction,
} from "../lib/anthropic";
import { buildLearnerContext } from "../lib/learnerContext";
import { matchDomainPack, domainPackContext } from "../lib/domainPacks";

const router = Router();

// Build the exam-domain-pack context for a profile, or "" when no pack matches.
function packContextFor(examName?: string | null): string {
  const pack = matchDomainPack(examName);
  return pack ? `\n\n${domainPackContext(pack)}` : "";
}

// Reads the learner's chosen UI language from the coach_lang cookie (set client-side).
function readLangCookie(req: any): string | undefined {
  const raw = (req.headers?.cookie as string) || "";
  const m = raw.match(/(?:^|;\s*)coach_lang=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

// GET /messages — conversation history
router.get("/messages", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const before = req.query.before ? Number(req.query.before) : undefined;

  let query = db
    .select()
    .from(coachMessagesTable)
    .where(
      before
        ? and(eq(coachMessagesTable.userId, userId), lt(coachMessagesTable.id, before))
        : eq(coachMessagesTable.userId, userId)
    )
    .orderBy(desc(coachMessagesTable.id))
    .limit(limit);

  const rows = await query;
  res.json(rows.reverse());
});

// POST /messages — send user message, get coach reply
router.post("/messages", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  // Validate/bound input before spending a rate unit or tokens.
  const { content } = req.body;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    res.status(400).json({ error: "Message cannot be empty." });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ error: "That message is too long. Please shorten it." });
    return;
  }

  if (!checkRateLimit(userId, !!(req as any).entitlement?.isPro)) {
    res.status(429).json({ error: "Daily AI call limit reached" });
    return;
  }

  // Save user message
  await db.insert(coachMessagesTable).values({ userId, role: "user", content: text });

  // Get profile for personality
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const personality = profiles[0]?.coachPersonality ?? "warm";
  const profileBase = profiles[0]
    ? `Learner profile: Goal=${profiles[0].goal}, Exam=${profiles[0].examName ?? "unspecified"}, ExamDate=${profiles[0].examDate ?? "none"}, HoursPerWeek=${profiles[0].hoursPerWeek}, Baseline=${profiles[0].baseline}, Calibration=${profiles[0].calibration}`
    : "No profile yet.";

  const learnerCtx = await buildLearnerContext(userId);
  const profileContext = `${profileBase}\n\n${learnerCtx}${packContextFor(profiles[0]?.examName)}`;

  // Get recent conversation history (last 20 messages)
  const history = await db
    .select()
    .from(coachMessagesTable)
    .where(eq(coachMessagesTable.userId, userId))
    .orderBy(desc(coachMessagesTable.id))
    .limit(20);

  const chatMessages = history
    .reverse()
    .filter((m) => m.role === "user" || m.role === "coach")
    .map((m) => ({
      role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  const teachingLoop = `

TEACH AND TEST LOOP:
You are leading the learner through their concepts one at a time. When you teach a concept, introduce it through a short real-world scenario relevant to their goal (do not just hand over a definition), then check understanding by issuing exactly ONE checkpoint: ask them to explain it back, apply it to a new case, or distinguish it from something similar. Emit the checkpoint as a JSON block on its own line, using the bracketed id from the learner notes above:
CHECKPOINT: {"conceptId": <id>, "prompt": "the exact question you are asking them to answer"}
Rules:
- At most one CHECKPOINT per message, and only for a concept listed in the learner notes (use its real id).
- Ask the question in your normal message too; the CHECKPOINT line is a machine-readable copy of that question.
- Do NOT reveal the answer in the same message — you are testing them.
- After the learner answers (you will see their answer and your graded feedback in the history), move on to the next due or weakest concept and teach it the same way.
- If the learner is just chatting or asking a question, answer normally and only issue a checkpoint when it makes sense to test them.`;

  const systemPrompt =
    buildSystemPrompt(personality, profileContext) + teachingLoop + languageInstruction(readLangCookie(req));

  const response = await createMessage({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: chatMessages,
  }, { label: "chat", userId });

  const replyContent = response.content[0]?.type === "text" ? response.content[0].text : "I'm here. What's on your mind?";

  // Parse an optional checkpoint the coach issued, honoring it only when the
  // concept belongs to this learner (guards against a hallucinated id).
  let richBlocks: Record<string, unknown> | null = null;
  const checkpointMatch = replyContent.match(/CHECKPOINT:\s*(\{[^\n]+\})/);
  if (checkpointMatch) {
    try {
      const cp = JSON.parse(checkpointMatch[1]);
      const conceptId = Number(cp.conceptId);
      const prompt = typeof cp.prompt === "string" ? cp.prompt.trim() : "";
      if (conceptId && prompt) {
        const owned = await db
          .select({ id: conceptsTable.id })
          .from(conceptsTable)
          .where(and(eq(conceptsTable.userId, userId), eq(conceptsTable.id, conceptId)))
          .limit(1);
        if (owned.length > 0) {
          richBlocks = { checkpoint: { conceptId, prompt } };
        }
      }
    } catch {
      // ignore a malformed checkpoint block
    }
  }

  // Strip the machine-readable CHECKPOINT line from what the learner sees.
  const displayContent = replyContent.replace(/CHECKPOINT:\s*\{[^\n]+\}\n?/, "").trim() || replyContent.trim();

  const [saved] = await db
    .insert(coachMessagesTable)
    .values({ userId, role: "coach", content: displayContent, richBlocks })
    .returning();

  res.json(saved);
});

// POST /messages/assessment — onboarding assessment conversation
router.post("/messages/assessment", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  if (!checkRateLimit(userId, !!(req as any).entitlement?.isPro)) {
    res.status(429).json({ error: "Daily AI call limit reached" });
    return;
  }

  const { messages } = req.body as { messages: { role: string; content: string }[] };

  const assessmentSystem = `You are Arete, running an onboarding assessment. Your job is to ask exactly 6 conversational questions to understand this learner, then recommend a coach personality.

Questions to ask (one at a time, conversationally):
1. What are you preparing for? (professional certification / university course / general mastery)
2. When is your exam or target date? (they can skip if general mastery)
3. How many hours per week can you realistically commit? (roughly 4 / 8 / 15 / 25)
4. Where are you starting from with this material? (near-zero / foundations but gaps / mostly solid / know it but rusty)
5. When you think you understand something, how often are you actually right? (almost always / mostly / I often overestimate / I actually underestimate myself)
6. Which kind of coach do you respond best to? (Push me hard / Make me think / Encourage me / Show me the strategy)

After all 6 answers, respond with a JSON block on its own line in this format:
COACH_RECOMMENDATION: {"recommended":"drill|socratic|warm|analyst","goal":"certification|university|general","examName":"the specific exam, certification, or credential the learner named, e.g. CompTIA Security+, PMP, MCAT, AWS Solutions Architect; for general mastery use a short subject like Spanish or Organic Chemistry","examDate":"YYYY-MM-DD or null","hoursPerWeek":8,"baseline":"zero|foundations|solid|rusty","calibration":"accurate|mostly|overestimate|underestimate","coachPersonality":"drill|socratic|warm|analyst","rationale":"one sentence why"}

When the learner answers question 1, capture the most specific name they give for examName. If they only give a broad category, ask a brief follow-up to get the specific exam or subject before moving on.

Then after the JSON, give a brief warm intro to the recommended personality in 2-3 sentences.

Rules:
- Ask one question at a time, naturally
- React to their answers before asking the next question
- Keep it conversational, not like a form
- After question 6, output the JSON recommendation line, then the intro
- Do not number your questions explicitly

${FORMATTING_RULES}`;

  const chatMessages = messages.map((m) => ({
    role: m.role === "coach" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  const response = await createMessage({
    model: MODEL,
    max_tokens: 800,
    system: assessmentSystem + languageInstruction(readLangCookie(req)),
    messages: chatMessages.length > 0 ? chatMessages : [{ role: "user", content: "Start the assessment" }],
  }, { label: "assessment", userId });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";

  // Parse recommendation if present
  let isComplete = false;
  let recommendedPersonality: string | null = null;
  let profileData: Record<string, unknown> | null = null;

  const recMatch = text.match(/COACH_RECOMMENDATION:\s*(\{[^\n]+\})/);
  if (recMatch) {
    try {
      const data = JSON.parse(recMatch[1]);
      isComplete = true;
      recommendedPersonality = data.recommended;
      profileData = data;
    } catch {
      // parse failed — keep going
    }
  }

  // Clean up the message (remove the JSON line for display)
  const displayMessage = text.replace(/COACH_RECOMMENDATION:\s*\{[^\n]+\}\n?/, "").trim();

  res.json({ message: displayMessage, isComplete, recommendedPersonality, profileData });
});

// POST /messages/daily-open — daily opening message + plan
router.post("/messages/daily-open", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  if (!checkRateLimit(userId, !!(req as any).entitlement?.isPro)) {
    res.status(429).json({ error: "Daily AI call limit reached" });
    return;
  }

  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const personality = profiles[0]?.coachPersonality ?? "warm";
  const profile = profiles[0];

  const today = new Date().toISOString().slice(0, 10);

  // Get concepts due today
  const dueConcepts = await db
    .select()
    .from(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), lte(conceptsTable.dueDate, today)))
    .orderBy(conceptsTable.mastery)
    .limit(5);

  // Get yesterday's plan
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayPlans = await db
    .select()
    .from(dailyPlansTable)
    .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, yesterdayStr)))
    .limit(1);

  const yesterdayPlan = yesterdayPlans[0];

  // Recent checkpoint performance
  const recentCheckpoints = await db
    .select()
    .from(checkpointsTable)
    .where(eq(checkpointsTable.userId, userId))
    .orderBy(desc(checkpointsTable.id))
    .limit(10);

  const avgGrade =
    recentCheckpoints.length > 0
      ? recentCheckpoints.filter((c) => c.coachGrade !== null).reduce((s, c) => s + (c.coachGrade ?? 0), 0) /
        Math.max(1, recentCheckpoints.filter((c) => c.coachGrade !== null).length)
      : null;

  const contextBlock = `
Today is ${today}.
${dueConcepts.length > 0 ? `Concepts due for review: ${dueConcepts.map((c) => c.title).join(", ")}` : "No concepts due yet — help them add material."}
${yesterdayPlan ? `Yesterday's plan status: ${yesterdayPlan.status}. Completed ${(yesterdayPlan.completedConceptIds as number[]).length}/${(yesterdayPlan.conceptIds as number[]).length} concepts.` : "No plan yesterday."}
${avgGrade !== null ? `Recent checkpoint average grade: ${avgGrade.toFixed(1)}/3.` : ""}
${profile ? `Exam date: ${profile.examDate ?? "none set"}. Hours/week: ${profile.hoursPerWeek}.` : ""}
`;

  const profileBase = profile
    ? `Goal: ${profile.goal}, Exam: ${profile.examName ?? "unspecified"}, ExamDate: ${profile.examDate ?? "none"}, HoursPerWeek: ${profile.hoursPerWeek}, Baseline: ${profile.baseline}`
    : "No profile yet.";
  const learnerCtxOpen = await buildLearnerContext(userId);
  const pack = matchDomainPack(profile?.examName);
  const profileContext = `${profileBase}\n\n${learnerCtxOpen}${pack ? `\n\n${domainPackContext(pack)}` : ""}`;

  const hasConcepts = dueConcepts.length > 0;

  const openInstruction = hasConcepts
    ? `You are opening the day. Generate a conversational greeting that references yesterday's performance (if any), names the focus for today, and presents a concrete study plan. Be specific — name the concepts, and the learner's exam when relevant. When an EXAM DOMAIN PACK is provided, weight the plan toward the heaviest domains and the learner's weak areas, and say which domain today's work sits in. Keep it under 160 words. After your message, output a JSON plan block on its own line:\nPLAN: {"goalText":"...","conceptIds":[...],"estimatedMinutes":30}`
    : pack
      ? `This learner has not added any study material yet, so you cannot build a concept-level plan. Do NOT output a PLAN block. Instead: warmly greet them in your voice, then lay out the ${pack.label} exam as a map using the EXAM DOMAIN PACK above — name its main weighted domains so they see the shape of what is ahead and where the points are. Then tell them the one thing you need to go deep: their study material (paste notes, share a link, or upload a file from the Material tab), and that you will map it onto these domains. Keep it under 170 words.`
      : `This learner has not added any study material yet, so you cannot build a real plan. Do NOT output a PLAN block. Instead, warmly greet them in your voice, name their goal and exam, and explain the one thing you need to begin: their study material. Tell them to add it from the Material tab — paste notes, share a link, or upload a file — and that the moment they do, you will turn it into their first plan. Keep it under 120 words.`;

  const systemPrompt =
    buildSystemPrompt(personality, profileContext) +
    `\n\n${openInstruction}\n\n${contextBlock}` +
    languageInstruction(readLangCookie(req));

  const response = await createMessage({
    model: MODEL,
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: "user", content: "Open the day" }],
  }, { label: "daily-open", userId });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "Ready when you are.";

  // Parse plan block. Only build a plan when there is material to plan over —
  // a brand-new learner with no concepts gets a welcome, not an empty plan.
  let plan = null;
  const planMatch = hasConcepts ? text.match(/PLAN:\s*(\{[^\n]+\})/) : null;
  if (planMatch) {
    try {
      const planData = JSON.parse(planMatch[1]);
      // Upsert daily plan
      const existing = await db
        .select()
        .from(dailyPlansTable)
        .where(and(eq(dailyPlansTable.userId, userId), eq(dailyPlansTable.date, today)))
        .limit(1);

      const conceptIds: number[] = Array.isArray(planData.conceptIds) ? planData.conceptIds : dueConcepts.map((c) => c.id);

      if (existing.length === 0) {
        const [inserted] = await db
          .insert(dailyPlansTable)
          .values({
            userId,
            date: today,
            goalText: planData.goalText ?? "Study session",
            conceptIds,
            estimatedMinutes: planData.estimatedMinutes ?? 30,
            status: "proposed",
            completedConceptIds: [],
          })
          .returning();
        plan = inserted;
      } else {
        plan = existing[0];
      }
    } catch {
      // ignore parse errors
    }
  }

  const displayMessage = text.replace(/PLAN:\s*\{[^\n]+\}\n?/, "").trim();

  const richBlocks = plan
    ? {
        plan_card: {
          goalText: plan.goalText,
          conceptIds: plan.conceptIds,
          estimatedMinutes: plan.estimatedMinutes,
          planId: plan.id,
        },
        quick_replies: ["Let's go", "I only have 20 minutes", "Show me what's due"],
      }
    : {
        quick_replies: ["How do I add my material?", "What should I study first?"],
      };

  const [savedMessage] = await db
    .insert(coachMessagesTable)
    .values({ userId, role: "coach", content: displayMessage, richBlocks })
    .returning();

  res.json({ message: savedMessage, plan });
});

export default router;
