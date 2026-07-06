import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  studyTutorConversationsTable,
  studyTutorMessagesTable,
  studyMaterialsTable,
  studyConceptsTable,
  studyLearnerProfilesTable,
} from "@workspace/paideia-db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { openai, PRIMARY_MODEL, generateJSON } from "../../lib/openai.js";
import { researchTopic } from "../../lib/extract.js";
import { redactContactInfo } from "../../lib/redact.js";
import { isPaidTier, isProTier, countTutorMessagesToday, FREE_LIMITS } from "../../lib/billing/limits.js";

const TUTOR_TURN_PREFIX = "<<TUTOR_TURN>>";
function encodeTurn(turn: unknown): string {
  return `${TUTOR_TURN_PREFIX}${JSON.stringify(turn)}`;
}
function decodeTurn(content: string): any | null {
  if (!content.startsWith(TUTOR_TURN_PREFIX)) return null;
  try {
    return JSON.parse(content.slice(TUTOR_TURN_PREFIX.length));
  } catch {
    return null;
  }
}

const router: IRouter = Router();
router.use(requireStudyUser);

const conversationInputSchema = z.object({
  title: z.string().min(1),
  socraticMode: z.boolean().default(false),
  scope: z.enum(["all_material", "specific_material"]).default("all_material"),
  scopeRefId: z.string().nullable().optional(),
});

const messageInputSchema = z.object({
  content: z.string().min(1),
});

// Coach voice, the four named personalities from "The Coach" spec. Voice/pressure only;
// never alters pedagogy or accuracy. Prepended to the existing tutor system prompt so the
// underlying socraticMode / grounding behaviour is unchanged.
type CoachPersonality = "drill" | "socratic" | "warm" | "analyst";
const COACH_VOICE: Record<CoachPersonality, string> = {
  drill:
    "You are The Drill Sergeant. Voice: direct, no fluff, time-boxed. You expect effort and call out avoidance immediately, but you are never cruel, you push because you believe the learner can do it. Keep responses short. End with a concrete next action (e.g. \"5 minutes. Go.\").",
  socratic:
    "You are The Socratic Mentor. Voice: patient, curious, deliberate. You never volunteer the answer; you ask the one question that lets the learner find it themselves. When they stall, narrow the question, never widen into a lecture.",
  warm:
    "You are The Warm Encourager. Voice: steady, supportive, human. You normalise struggle (\"that confusion means you're at the edge of new territory\"), celebrate small wins specifically, and keep the next step small enough to actually start.",
  analyst:
    "You are The Strategic Analyst. Voice: calm, precise, data-aware. You name what the evidence says about where the learner is, where the exam is, and what the highest-leverage next move is. Prefer numbers and short reasoned plans over pep talk.",
};
function coachVoiceFor(personality: string | null | undefined): string {
  const p = (personality ?? "warm") as CoachPersonality;
  return COACH_VOICE[p] ?? COACH_VOICE.warm;
}
async function getCoachPersonality(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ coachPersonality: studyLearnerProfilesTable.coachPersonality })
    .from(studyLearnerProfilesTable)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .limit(1);
  return row?.coachPersonality ?? null;
}

async function buildGroundingContext(userId: string): Promise<string> {
  const materials = await db
    .select()
    .from(studyMaterialsTable)
    .where(eq(studyMaterialsTable.userId, userId))
    .orderBy(desc(studyMaterialsTable.createdAt))
    .limit(5);

  const concepts = await db
    .select()
    .from(studyConceptsTable)
    .where(eq(studyConceptsTable.userId, userId))
    .limit(15);

  const profile = await db
    .select()
    .from(studyLearnerProfilesTable)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .limit(1);

  const parts: string[] = [];

  if (profile.length > 0) {
    const p = profile[0];
    // Free-text profile fields are learner-entered: scrub any contact details
    // (email/phone) before they reach the model. Enum-ish fields below are safe.
    parts.push(`Learner Profile:`);
    if (p.examTarget) parts.push(`- Exam Target: ${redactContactInfo(p.examTarget)}`);
    if (p.goals.length > 0) parts.push(`- Goals: ${redactContactInfo(p.goals.join(", "))}`);
    if (p.interests.length > 0) parts.push(`- Interests: ${redactContactInfo(p.interests.join(", "))}`);
    if (p.background) parts.push(`- Background: ${redactContactInfo(p.background)}`);
    parts.push(`- Study Style: ${p.studyStyle}`);
    parts.push(`- Preferred Difficulty: ${p.preferredDifficulty}`);
  }

  if (materials.length > 0) {
    parts.push(`\nStudy Materials:`);
    for (const m of materials) {
      parts.push(`- ${m.title} (${m.sourceType})`);
    }
  }

  if (concepts.length > 0) {
    parts.push(`\nKey Concepts:`);
    for (const c of concepts.slice(0, 10)) {
      parts.push(`- ${c.title}: ${c.explanation.slice(0, 150)}...`);
    }
  }

  return parts.join("\n");
}

router.get("/conversations", async (req, res) => {
  const userId = req.studyUser!.id;
  const rows = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(eq(studyTutorConversationsTable.userId, userId))
    .orderBy(desc(studyTutorConversationsTable.updatedAt));

  const enriched = await Promise.all(
    rows.map(async (c) => {
      const count = await db
        .select({ count: sql<number>`count(*)` })
        .from(studyTutorMessagesTable)
        .where(eq(studyTutorMessagesTable.conversationId, c.id));
      return { ...c, messageCount: Number(count[0]?.count ?? 0) };
    }),
  );

  res.json(enriched);
});

router.post("/conversations", async (req, res) => {
  const parsed = conversationInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const userId = req.studyUser!.id;

  const [conv] = await db
    .insert(studyTutorConversationsTable)
    .values({
      userId,
      title: data.title,
      socraticMode: data.socraticMode,
      scope: data.scope,
      scopeRefId: data.scopeRefId ?? null,
    })
    .returning();

  // Send initial AI greeting.
  // Conflict resolution: if the conversation is in socraticMode, the user explicitly asked
  // for Socratic-style "no direct answers", so we force the Socratic voice regardless of the
  // profile's coach personality. Otherwise the profile personality wins.
  const grounding = await buildGroundingContext(userId);
  const voice = data.socraticMode ? coachVoiceFor("socratic") : coachVoiceFor(await getCoachPersonality(userId));
  const tutorRules = data.socraticMode
    ? `You are a Socratic tutor. You NEVER give direct answers. Instead, you ask guiding questions that help the learner discover the answer themselves. Be encouraging and patient. Adapt to the learner's background and interests when creating examples.`
    : `You are a knowledgeable and adaptive tutor. You explain concepts clearly, use real-world examples that relate to the learner's interests and background, and create immersive scenarios. When appropriate, ask the learner to apply concepts to their own life.`;
  const systemPrompt = `${voice}\n\n${tutorRules}\n\nStyle: write in clear American English. Never use em dashes (the "—" character); use commas, periods, or hyphens instead.\n\nGrounding context:\n${grounding}`;

  try {
    const response = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `The learner has started a new conversation: "${data.title}". Please introduce yourself warmly and ask how you can help them today.` },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "Hello! I'm your study tutor. How can I help you today?";
    await db.insert(studyTutorMessagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content,
      usedPersonalization: true,
    });
  } catch (err) {
    req.log?.warn({ err }, "tutor greeting failed");
    await db.insert(studyTutorMessagesTable).values({
      conversationId: conv.id,
      role: "assistant",
      content: "Hello! I'm your study tutor. How can I help you today?",
    });
  }

  res.status(201).json(conv);
});

router.get("/conversations/:conversationId", async (req, res) => {
  const userId = req.studyUser!.id;
  const conversationId = req.params.conversationId;

  const convs = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(
      and(
        eq(studyTutorConversationsTable.userId, userId),
        eq(studyTutorConversationsTable.id, conversationId),
      ),
    )
    .limit(1);

  if (convs.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const messages = await db
    .select()
    .from(studyTutorMessagesTable)
    .where(eq(studyTutorMessagesTable.conversationId, conversationId))
    .orderBy(studyTutorMessagesTable.createdAt);

  res.json({ conversation: convs[0], messages });
});

router.delete("/conversations/:conversationId", async (req, res) => {
  const userId = req.studyUser!.id;
  const conversationId = req.params.conversationId;
  await db
    .delete(studyTutorConversationsTable)
    .where(
      and(
        eq(studyTutorConversationsTable.userId, userId),
        eq(studyTutorConversationsTable.id, conversationId),
      ),
    );
  res.json({ success: true });
});

router.post("/conversations/:conversationId/messages", async (req, res) => {
  const parsed = messageInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { content } = parsed.data;
  const userId = req.studyUser!.id;
  const conversationId = req.params.conversationId;

  // Free tier: capped tutor messages per day, then upgrade.
  if (!isPaidTier(req.studyUser!.subscriptionTier)) {
    const usedToday = await countTutorMessagesToday(userId);
    if (usedToday >= FREE_LIMITS.tutorMessagesPerDay) {
      res.status(402).json({
        error: `You've reached today's free tutor limit (${FREE_LIMITS.tutorMessagesPerDay} messages). Upgrade to Plus for unlimited tutoring.`,
        code: "upgrade_required",
        feature: "tutor",
      });
      return;
    }
  }

  const convs = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(
      and(
        eq(studyTutorConversationsTable.userId, userId),
        eq(studyTutorConversationsTable.id, conversationId),
      ),
    )
    .limit(1);

  if (convs.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const conv = convs[0];

  // Store user message
  await db.insert(studyTutorMessagesTable).values({
    conversationId,
    role: "user",
    content,
  });

  // Load conversation history for context
  const history = await db
    .select()
    .from(studyTutorMessagesTable)
    .where(eq(studyTutorMessagesTable.conversationId, conversationId))
    .orderBy(studyTutorMessagesTable.createdAt)
    .limit(20);

  // Same conflict resolution as on conversation creation: socraticMode pins the voice to
  // Socratic so the user's explicit pedagogy choice always wins over profile personality.
  const grounding = await buildGroundingContext(userId);
  const voice = conv.socraticMode ? coachVoiceFor("socratic") : coachVoiceFor(await getCoachPersonality(userId));
  const tutorRules = conv.socraticMode
    ? `You are a Socratic tutor. You NEVER give direct answers. Instead, you ask guiding questions that help the learner discover the answer themselves. Be encouraging and patient. Use the learner's profile and interests to make questions relatable.`
    : `You are a knowledgeable and adaptive tutor. Explain concepts clearly, use real-world examples that relate to the learner's interests and background, and create immersive scenarios. When appropriate, ask the learner to apply concepts to their own life. Be inclusive and adjust complexity to the learner's level.`;
  const systemPrompt = `${voice}\n\n${tutorRules}\n\nStyle: write in clear American English. Never use em dashes (the "—" character); use commas, periods, or hyphens instead.\n\nGrounding context:\n${grounding}`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      max_tokens: 4096,
      messages,
    });
    const aiContent = response.choices[0]?.message?.content ?? "I'm not sure about that. Could you rephrase or ask a different question?";

    const [msg] = await db
      .insert(studyTutorMessagesTable)
      .values({
        conversationId,
        role: "assistant",
        content: aiContent,
        usedPersonalization: true,
      })
      .returning();

    // Update conversation timestamp
    await db
      .update(studyTutorConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(studyTutorConversationsTable.id, conversationId));

    res.json(msg);
  } catch (err) {
    req.log?.error({ err }, "tutor AI call failed");
    res.status(500).json({ error: "AI tutor temporarily unavailable" });
  }
});

// =====================================================================
// Guided session: diagnose-first tutor flow
// =====================================================================

async function loadLearnerProfileText(userId: string): Promise<string> {
  const rows = await db
    .select()
    .from(studyLearnerProfilesTable)
    .where(eq(studyLearnerProfilesTable.userId, userId))
    .limit(1);
  if (rows.length === 0) return "(no learner profile on file)";
  const p = rows[0];
  // Scrub contact details from learner-entered free-text fields before this
  // profile is sent to the model.
  const lines = [
    p.examTarget ? `Goal: ${redactContactInfo(p.examTarget)}` : null,
    p.goals.length ? `Aspirations: ${redactContactInfo(p.goals.join(", "))}` : null,
    p.interests.length ? `Interests: ${redactContactInfo(p.interests.join(", "))}` : null,
    p.background ? `Background: ${redactContactInfo(p.background)}` : null,
    `Study style: ${p.studyStyle}`,
    `Preferred difficulty: ${p.preferredDifficulty}`,
  ].filter(Boolean);
  return lines.join("\n");
}

type LessonShape = {
  explanation_md: string;
  example: string;
  check: { question: string; options: string[]; correctIndex: number; explanation: string };
};

async function generateLesson(opts: {
  socratic: boolean;
  profileText: string;
  target: { title: string; explanation: string };
  contextNote: string;
}): Promise<LessonShape> {
  const { socratic, profileText, target, contextNote } = opts;
  const sourceExcerpt = target.explanation.slice(0, 1800);

  if (socratic) {
    return await generateJSON<LessonShape>(
      `You are a Socratic tutor. You teach by asking the learner short, progressively deeper guiding questions, never lecturing first. Then you reveal the key insight. Return strict JSON only.`,
      `Learner profile:
${profileText}
${contextNote ? `\n${contextNote}\n` : ""}
Concept to teach now: "${target.title}"
Source excerpt the learner has saved:
"""${sourceExcerpt}"""

Write a SOCRATIC mini-lesson in markdown (200-350 words). Structure it as:
1. Open with a single short framing sentence.
2. Ask 2-3 numbered Socratic questions of increasing depth. After EACH question, give a 1-2 sentence "Think:" prompt that nudges the learner without revealing the answer.
3. End with a short "Key insight" paragraph (2-4 sentences) that ties the questions together and states the core idea.

Then ONE concrete example tailored to the learner, and ONE multiple-choice check question (4 options, one clearly correct) that requires applying the insight.

Return JSON exactly:
{"explanation_md":"...","example":"...","check":{"question":"...","options":["","","",""],"correctIndex":0,"explanation":"..."}}`,
      { kind: "tutor_guided_lesson_socratic" },
    );
  }

  return await generateJSON<LessonShape>(
    `You are an expert tutor. Teach ONE concept in depth, tailored to the learner's profile. Return strict JSON only.`,
    `Learner profile:
${profileText}
${contextNote ? `\n${contextNote}\n` : ""}
Concept to teach now: "${target.title}"
Source excerpt the learner has saved:
"""${sourceExcerpt}"""

Write a clear, layered explanation (250-400 words) using their study style. Use plain markdown (headings, short paragraphs, bullets if helpful). Then ONE concrete example tailored to their interests/background, and ONE multiple-choice check question (4 options, one clearly correct).

Return JSON exactly:
{"explanation_md":"...","example":"...","check":{"question":"...","options":["","","",""],"correctIndex":0,"explanation":"..."}}`,
    { kind: "tutor_guided_lesson" },
  );
}

function materialIdFromScopeRef(scopeRefId: string | null): string | null {
  if (!scopeRefId) return null;
  // Guided conversations stash a tag like "guided:<materialId-or-empty>" in scopeRefId.
  if (scopeRefId.startsWith("guided:")) {
    const m = scopeRefId.slice("guided:".length);
    return m && /^[0-9a-f-]{36}$/i.test(m) ? m : null;
  }
  return /^[0-9a-f-]{36}$/i.test(scopeRefId) ? scopeRefId : null;
}

async function pickFocusConcepts(userId: string, materialId: string | null, limit: number) {
  const where = materialId
    ? and(eq(studyConceptsTable.userId, userId), eq(studyConceptsTable.materialId, materialId))
    : eq(studyConceptsTable.userId, userId);
  const rows = await db
    .select()
    .from(studyConceptsTable)
    .where(where)
    .orderBy(desc(studyConceptsTable.createdAt))
    .limit(limit);
  return rows;
}

const startGuidedSchema = z.object({
  materialId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).optional(),
  socratic: z.boolean().optional().default(false),
  conceptId: z.string().uuid().nullable().optional(),
});

router.post("/guided/start", async (req, res) => {
  const parsed = startGuidedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const userId = req.studyUser!.id;
  const { materialId, title, socratic, conceptId: focusConceptId } = parsed.data;

  let concepts = await pickFocusConcepts(userId, materialId ?? null, 12);
  // If a specific concept was requested ("today's focus" shortcut), bring it to the front.
  if (focusConceptId) {
    const idx = concepts.findIndex((c) => c.id === focusConceptId);
    if (idx > 0) {
      const [picked] = concepts.splice(idx, 1);
      concepts = [picked, ...concepts];
    }
  }
  concepts = concepts.slice(0, 8);
  if (concepts.length === 0) {
    res.status(422).json({
      error:
        "I need at least one studied concept to start a guided session. Upload a material or research a topic first.",
    });
    return;
  }

  const profileText = await loadLearnerProfileText(userId);
  const conceptList = concepts
    .map((c) => `- [${c.id}] ${c.title}: ${c.explanation.slice(0, 220).replace(/\s+/g, " ")}`)
    .join("\n");

  let diagnostic: any;
  try {
    diagnostic = await generateJSON<{
      intro: string;
      questions: Array<{
        id: string;
        conceptId: string;
        conceptTitle: string;
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;
    }>(
      `You are a warm, expert tutor designing a SHORT diagnostic to find what a learner already knows before teaching. Return strict JSON only.`,
      `Pick the 3 MOST CENTRAL concepts from the list below and write one multiple-choice question for each (exactly 4 plausible options, one clearly correct). Each question should test core understanding, not trivia. Tailor wording to the learner's profile.

Learner profile:
${profileText}

Concepts available (format: [id] title: explanation):
${conceptList}

Return JSON exactly:
{
  "intro": "1-2 short sentences greeting the learner by reference to their goal and explaining you'll start with a quick diagnostic.",
  "questions": [
    {
      "id": "q1",
      "conceptId": "the [id] from the list above",
      "conceptTitle": "the concept title",
      "question": "the question text",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "explanation": "one sentence on why that option is correct"
    }
  ]
}`,
      { kind: "tutor_guided_diagnostic" },
    );
  } catch (err) {
    req.log?.error({ err }, "guided diagnostic generation failed");
    res.status(500).json({ error: "Could not start guided session. Try again in a moment." });
    return;
  }

  if (!Array.isArray(diagnostic?.questions) || diagnostic.questions.length === 0) {
    res.status(500).json({ error: "Tutor could not assemble a diagnostic. Try again." });
    return;
  }
  // Sanitize: clamp options to 4, ensure correctIndex in range, ensure conceptIds are real.
  const conceptIdSet = new Set(concepts.map((c) => c.id));
  diagnostic.questions = diagnostic.questions.slice(0, 5).map((q: any, i: number) => ({
    id: q.id || `q${i + 1}`,
    conceptId: conceptIdSet.has(q.conceptId) ? q.conceptId : concepts[i % concepts.length].id,
    conceptTitle: String(q.conceptTitle ?? "").slice(0, 120),
    question: String(q.question ?? "").slice(0, 500),
    options: Array.isArray(q.options) ? q.options.slice(0, 4).map((o: any) => String(o).slice(0, 200)) : [],
    correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
    explanation: String(q.explanation ?? "").slice(0, 400),
  })).filter((q: any) => q.options.length === 4 && q.question.length > 0);

  // Tag guided conversations so the list view can route them to the guided page,
  // not the free-form chat (which would render raw <<TUTOR_TURN>> JSON).
  const guidedTag = `guided:${materialId ?? ""}`;
  const [conv] = await db
    .insert(studyTutorConversationsTable)
    .values({
      userId,
      title: title || (socratic ? `Socratic session` : (materialId ? `Guided session` : `Guided study session`)),
      socraticMode: !!socratic,
      scope: materialId ? "specific_material" : "all_material",
      scopeRefId: guidedTag,
    })
    .returning();

  const turn = {
    v: 1,
    kind: "diagnostic" as const,
    intro: String(diagnostic.intro ?? "Let's start with a quick diagnostic so I can teach you exactly what you need."),
    questions: diagnostic.questions,
  };

  const [msg] = await db
    .insert(studyTutorMessagesTable)
    .values({
      conversationId: conv.id,
      role: "assistant",
      content: encodeTurn(turn),
      usedPersonalization: true,
    })
    .returning();

  res.status(201).json({ conversation: conv, message: msg, turn });
});

const guidedReplySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("diagnostic_answers"),
    answers: z.array(z.object({ questionId: z.string(), selectedIndex: z.number().int().min(0).max(3) })),
  }),
  z.object({
    kind: z.literal("check_answer"),
    lessonMessageId: z.number().int(),
    selectedIndex: z.number().int().min(0).max(3),
  }),
  z.object({ kind: z.literal("teach_next"), conceptId: z.string().nullable().optional() }),
  z.object({ kind: z.literal("research_deeper"), conceptTitle: z.string() }),
  z.object({ kind: z.literal("done") }),
]);

router.post("/guided/:conversationId/reply", async (req, res) => {
  const userId = req.studyUser!.id;
  const conversationId = req.params.conversationId;
  const parsed = guidedReplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reply payload" });
    return;
  }
  const reply = parsed.data;

  // Free tier: capped tutor messages per day (the "done" action is always allowed
  // so a learner is never stuck mid-session).
  if (reply.kind !== "done" && !isPaidTier(req.studyUser!.subscriptionTier)) {
    const usedToday = await countTutorMessagesToday(userId);
    if (usedToday >= FREE_LIMITS.tutorMessagesPerDay) {
      res.status(402).json({
        error: `You've reached today's free tutor limit (${FREE_LIMITS.tutorMessagesPerDay} messages). Upgrade to Plus for unlimited tutoring.`,
        code: "upgrade_required",
        feature: "tutor",
      });
      return;
    }
  }

  // Web-search-backed deep dives ("research deeper") are a Pro feature.
  if (reply.kind === "research_deeper" && !isProTier(req.studyUser!.subscriptionTier)) {
    res.status(402).json({
      error: "Web-search-backed deep dives are a Pro feature. Upgrade to Pro to research beyond your materials.",
      code: "upgrade_required",
      feature: "web_search",
    });
    return;
  }

  const convs = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(and(eq(studyTutorConversationsTable.userId, userId), eq(studyTutorConversationsTable.id, conversationId)))
    .limit(1);
  if (convs.length === 0) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const conv = convs[0];

  // Store the user's structured reply as a user message
  await db.insert(studyTutorMessagesTable).values({
    conversationId,
    role: "user",
    content: encodeTurn({ v: 1, kind: "user_reply", reply }),
  });

  const concepts = await pickFocusConcepts(userId, materialIdFromScopeRef(conv.scopeRefId), 12);
  const profileText = await loadLearnerProfileText(userId);

  let assistantTurn: any = null;
  let extraMsgs: any[] = [];

  try {
    if (reply.kind === "diagnostic_answers") {
      // Find the last diagnostic turn to grade against
      const recent = await db
        .select()
        .from(studyTutorMessagesTable)
        .where(eq(studyTutorMessagesTable.conversationId, conversationId))
        .orderBy(desc(studyTutorMessagesTable.createdAt))
        .limit(20);
      const decoded = recent.map((m) => decodeTurn(m.content));
      const diagMsg = decoded.find((t) => t?.kind === "diagnostic");
      if (!diagMsg) {
        res.status(400).json({ error: "No diagnostic to grade." });
        return;
      }
      // Reject re-submission: if feedback already exists, the diagnostic is closed.
      if (decoded.some((t) => t?.kind === "feedback")) {
        res.status(409).json({ error: "Diagnostic has already been submitted." });
        return;
      }
      const graded = diagMsg.questions.map((q: any) => {
        const ans = reply.answers.find((a) => a.questionId === q.id);
        const selectedIndex = ans?.selectedIndex ?? -1;
        return {
          questionId: q.id,
          conceptId: q.conceptId,
          conceptTitle: q.conceptTitle,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          selectedIndex,
          correct: selectedIndex === q.correctIndex,
          explanation: q.explanation,
        };
      });
      const wrong = graded.filter((g: any) => !g.correct);
      const correctCount = graded.length - wrong.length;

      // Pick focus concept = first wrong; else lowest-scoring concept's title
      const focus = wrong[0] ?? graded[0];
      const focusConcept = concepts.find((c) => c.id === focus.conceptId) ?? concepts[0];

      // Generate a tailored lesson grounded in the focus concept's stored explanation
      const lesson = await generateLesson({
        socratic: conv.socraticMode,
        profileText,
        target: focusConcept,
        contextNote: `Diagnostic results: ${correctCount}/${graded.length} correct. ${
          wrong.length
            ? `They got these wrong: ${wrong.map((w: any) => w.conceptTitle).join("; ")}.`
            : `They got everything right, go DEEPER on the most important one.`
        }`,
      });

      // Save a "feedback" turn first, then a "lesson" turn, two assistant messages.
      const feedbackTurn = {
        v: 1,
        kind: "feedback" as const,
        summary: `You got ${correctCount} of ${graded.length} right.`,
        items: graded,
        focusConceptTitle: focusConcept.title,
        focusConceptId: focusConcept.id,
      };
      const [fbMsg] = await db
        .insert(studyTutorMessagesTable)
        .values({ conversationId, role: "assistant", content: encodeTurn(feedbackTurn), usedPersonalization: true })
        .returning();

      const lessonTurn = {
        v: 1,
        kind: "lesson" as const,
        conceptId: focusConcept.id,
        conceptTitle: focusConcept.title,
        explanation_md: String(lesson.explanation_md ?? "").slice(0, 5000),
        example: String(lesson.example ?? "").slice(0, 800),
        check: {
          question: String(lesson.check?.question ?? "").slice(0, 500),
          options: Array.isArray(lesson.check?.options)
            ? lesson.check.options.slice(0, 4).map((o: any) => String(o).slice(0, 200))
            : [],
          correctIndex: Math.max(0, Math.min(3, Number(lesson.check?.correctIndex) || 0)),
          explanation: String(lesson.check?.explanation ?? "").slice(0, 400),
        },
        sources: [] as string[],
      };
      const [lsMsg] = await db
        .insert(studyTutorMessagesTable)
        .values({ conversationId, role: "assistant", content: encodeTurn(lessonTurn), usedPersonalization: true })
        .returning();

      assistantTurn = lessonTurn;
      extraMsgs = [fbMsg, lsMsg];
    } else if (reply.kind === "check_answer") {
      // Bind to the exact lesson message the learner is answering, and reject if
      // it was already graded.
      const lessonRow = await db
        .select()
        .from(studyTutorMessagesTable)
        .where(
          and(
            eq(studyTutorMessagesTable.conversationId, conversationId),
            eq(studyTutorMessagesTable.id, reply.lessonMessageId),
          ),
        )
        .limit(1);
      const lessonTurn = lessonRow[0] ? decodeTurn(lessonRow[0].content) : null;
      if (!lessonTurn || lessonTurn.kind !== "lesson") {
        res.status(400).json({ error: "Lesson not found." });
        return;
      }
      const laterMsgs = await db
        .select({ content: studyTutorMessagesTable.content })
        .from(studyTutorMessagesTable)
        .where(
          and(
            eq(studyTutorMessagesTable.conversationId, conversationId),
            sql`${studyTutorMessagesTable.id} > ${reply.lessonMessageId}`,
          ),
        );
      const alreadyChecked = laterMsgs
        .map((m) => decodeTurn(m.content))
        .some((t) => t?.kind === "check_result");
      if (alreadyChecked) {
        res.status(409).json({ error: "This check question has already been answered." });
        return;
      }
      const correct = reply.selectedIndex === lessonTurn.check.correctIndex;
      const allMsgs = await db
        .select({ content: studyTutorMessagesTable.content })
        .from(studyTutorMessagesTable)
        .where(eq(studyTutorMessagesTable.conversationId, conversationId));
      const usedConceptIds = allMsgs
        .map((m) => decodeTurn(m.content))
        .filter((t) => t?.kind === "lesson")
        .map((t: any) => t.conceptId as string);
      const remaining = concepts.filter((c) => !usedConceptIds.includes(c.id));
      const proposedNext = remaining[0];

      assistantTurn = {
        v: 1,
        kind: "check_result" as const,
        correct,
        explanation: lessonTurn.check.explanation ?? "",
        correctIndex: lessonTurn.check.correctIndex ?? 0,
        selectedIndex: reply.selectedIndex,
        proposedNext: proposedNext
          ? { conceptId: proposedNext.id, conceptTitle: proposedNext.title }
          : null,
      };
      const [m] = await db
        .insert(studyTutorMessagesTable)
        .values({ conversationId, role: "assistant", content: encodeTurn(assistantTurn) })
        .returning();
      extraMsgs = [m];
    } else if (reply.kind === "teach_next") {
      const recent = await db
        .select()
        .from(studyTutorMessagesTable)
        .where(eq(studyTutorMessagesTable.conversationId, conversationId))
        .orderBy(desc(studyTutorMessagesTable.createdAt))
        .limit(20);
      const usedConceptIds = recent
        .map((m) => decodeTurn(m.content))
        .filter((t) => t?.kind === "lesson")
        .map((t: any) => t.conceptId as string);
      const target = reply.conceptId
        ? concepts.find((c) => c.id === reply.conceptId)
        : concepts.find((c) => !usedConceptIds.includes(c.id));
      if (!target) {
        const doneTurn = {
          v: 1,
          kind: "done" as const,
          summary: "You've worked through every concept in this material. Excellent.",
        };
        const [m] = await db
          .insert(studyTutorMessagesTable)
          .values({ conversationId, role: "assistant", content: encodeTurn(doneTurn) })
          .returning();
        assistantTurn = doneTurn;
        extraMsgs = [m];
      } else {
        const lesson = await generateLesson({
          socratic: conv.socraticMode,
          profileText,
          target,
          contextNote: "",
        });
        const lessonTurn = {
          v: 1,
          kind: "lesson" as const,
          conceptId: target.id,
          conceptTitle: target.title,
          explanation_md: String(lesson.explanation_md ?? "").slice(0, 5000),
          example: String(lesson.example ?? "").slice(0, 800),
          check: {
            question: String(lesson.check?.question ?? "").slice(0, 500),
            options: Array.isArray(lesson.check?.options)
              ? lesson.check.options.slice(0, 4).map((o: any) => String(o).slice(0, 200))
              : [],
            correctIndex: Math.max(0, Math.min(3, Number(lesson.check?.correctIndex) || 0)),
            explanation: String(lesson.check?.explanation ?? "").slice(0, 400),
          },
          sources: [] as string[],
        };
        const [m] = await db
          .insert(studyTutorMessagesTable)
          .values({ conversationId, role: "assistant", content: encodeTurn(lessonTurn), usedPersonalization: true })
          .returning();
        assistantTurn = lessonTurn;
        extraMsgs = [m];
      }
    } else if (reply.kind === "research_deeper") {
      try {
        const researched = await researchTopic(
          `${reply.conceptTitle}, give a learner-friendly deep dive with authoritative sources.`,
        );
        // Pull citation URLs out of the appended "Sources consulted" block, if any.
        const srcMatch = researched.text.match(/Sources consulted:\n([\s\S]+)$/);
        const sources = srcMatch
          ? srcMatch[1]
              .split("\n")
              .map((l) => l.replace(/^- /, "").trim())
              .filter((u) => /^https?:\/\//.test(u))
          : [];
        assistantTurn = {
          v: 1,
          kind: "research" as const,
          conceptTitle: reply.conceptTitle,
          text_md: researched.text,
          sources,
        };
        const [m] = await db
          .insert(studyTutorMessagesTable)
          .values({ conversationId, role: "assistant", content: encodeTurn(assistantTurn), usedPersonalization: true })
          .returning();
        extraMsgs = [m];
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Web research failed.";
        assistantTurn = { v: 1, kind: "error" as const, message: msg };
        const [m] = await db
          .insert(studyTutorMessagesTable)
          .values({ conversationId, role: "assistant", content: encodeTurn(assistantTurn) })
          .returning();
        extraMsgs = [m];
      }
    } else if (reply.kind === "done") {
      assistantTurn = { v: 1, kind: "done" as const, summary: "Great session. Come back any time to keep building on this." };
      const [m] = await db
        .insert(studyTutorMessagesTable)
        .values({ conversationId, role: "assistant", content: encodeTurn(assistantTurn) })
        .returning();
      extraMsgs = [m];
    }
  } catch (err) {
    req.log?.error({ err }, "guided reply generation failed");
    res.status(500).json({ error: "Tutor stumbled. Try again." });
    return;
  }

  await db
    .update(studyTutorConversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(studyTutorConversationsTable.id, conversationId));

  res.json({ messages: extraMsgs, turn: assistantTurn });
});

router.get("/guided/:conversationId", async (req, res) => {
  const userId = req.studyUser!.id;
  const conversationId = req.params.conversationId;
  const convs = await db
    .select()
    .from(studyTutorConversationsTable)
    .where(and(eq(studyTutorConversationsTable.userId, userId), eq(studyTutorConversationsTable.id, conversationId)))
    .limit(1);
  if (convs.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(studyTutorMessagesTable)
    .where(eq(studyTutorMessagesTable.conversationId, conversationId))
    .orderBy(studyTutorMessagesTable.createdAt);
  const enriched = msgs.map((m) => ({ ...m, turn: decodeTurn(m.content) }));
  res.json({ conversation: convs[0], messages: enriched });
});

export default router;
