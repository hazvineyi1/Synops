import { Router } from "express";
import { db } from "@workspace/db";
import {
  sessionsTable,
  dialogueTurnsTable,
  modulesTable,
  beatsTable,
  submissionsTable,
  enrolmentsTable,
} from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  buildSocraticSystemPrompt,
  ensureQuestion,
  generateSocraticTurn,
  SOCRATIC_MODEL,
  type SocraticContext,
} from "../lib/socraticEngine";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { applyCheckpoint } from "../lib/mastery";

const router = Router();

const PROMPT_BUDGET = 8;

function toSessionResponse(s: typeof sessionsTable.$inferSelect) {
  return {
    id: s.id,
    moduleId: s.moduleId,
    userId: s.userId,
    status: s.status,
    masteryScore: Number(s.masteryScore),
    currentBeatId: s.currentBeatId,
    turnCount: s.turnCount,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

// GET /sessions
router.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.userId, req.userId!))
    .orderBy(desc(sessionsTable.createdAt));
  res.json(sessions.map(toSessionResponse));
});

// POST /sessions
router.post("/sessions", requireAuth, async (req, res) => {
  const { moduleId } = req.body;
  if (!moduleId || typeof moduleId !== "string") {
    res.status(400).json({ error: "moduleId required" });
    return;
  }

  // Authorization: the module must exist and be published, and the learner
  // must have an active enrolment in its course. This keeps credentials
  // trustworthy — you can only earn one for content you are enrolled in.
  const module = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
  if (!module || module.status !== "published") {
    res.status(404).json({ error: "Module not available" });
    return;
  }
  if (module.courseId) {
    const enrolment = await db.query.enrolmentsTable.findFirst({
      where: and(
        eq(enrolmentsTable.userId, req.userId!),
        eq(enrolmentsTable.courseId, module.courseId),
        eq(enrolmentsTable.status, "active")
      ),
    });
    if (!enrolment) {
      res.status(403).json({ error: "Not enrolled in this course" });
      return;
    }
  }

  // Get first beat
  const [firstBeat] = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, moduleId))
    .orderBy(asc(beatsTable.order))
    .limit(1);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      moduleId,
      userId: req.userId!,
      status: "active",
      masteryScore: "0",
      currentBeatId: firstBeat?.id ?? null,
    })
    .returning();

  // Create the opening turn using the hardened Socratic engine's opening
  // rule so it honours the learner's coach personality and accommodations.
  if (firstBeat) {
    const learner = req.dbUser!;
    let tutorOpening: string;
    try {
      const ctx: SocraticContext = {
        beatTitle: firstBeat.title,
        beatType: firstBeat.type,
        narration: firstBeat.narration,
        scenario: firstBeat.scenario,
        bulletPoints: firstBeat.bulletPoints,
        learnerName: learner.firstName,
        personality: learner.coachPersonality,
        learningStyle: learner.learningStyle,
        accommodations: learner.accommodations,
        turnCount: 0,
        promptBudget: PROMPT_BUDGET,
      };
      tutorOpening = await generateSocraticTurn(
        ctx,
        [{ role: "user", content: "I'm ready to begin. Ask me the first question." }],
        true
      );
    } catch {
      tutorOpening = `Let's think about this together. ${firstBeat.narration} In your own words, how would you apply this idea in your work tomorrow?`;
    }
    await db.insert(dialogueTurnsTable).values({
      sessionId: session.id,
      role: "tutor",
      content: tutorOpening,
      beatId: firstBeat.id,
    });
    await db
      .update(sessionsTable)
      .set({ turnCount: sql`${sessionsTable.turnCount} + 1` })
      .where(eq(sessionsTable.id, session.id));
  }

  res.status(201).json(toSessionResponse(session));
});

// GET /sessions/:sessionId
router.get("/sessions/:sessionId", requireAuth, async (req, res) => {
  const session = await db.query.sessionsTable.findFirst({
    where: eq(sessionsTable.id, req.params.sessionId),
  });
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  if (session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }

  const turns = await db
    .select()
    .from(dialogueTurnsTable)
    .where(eq(dialogueTurnsTable.sessionId, session.id))
    .orderBy(asc(dialogueTurnsTable.createdAt));

  res.json({
    ...toSessionResponse(session),
    turns: turns.map(t => ({
      id: t.id,
      role: t.role,
      content: t.content,
      beatId: t.beatId,
      reasoning: t.reasoning,
      masteryDelta: t.masteryDelta ? Number(t.masteryDelta) : null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// POST /sessions/:sessionId/respond — SSE streaming Socratic response
router.post("/sessions/:sessionId/respond", requireAuth, async (req, res) => {
  const { response, beatId } = req.body;
  const { sessionId } = req.params;

  const session = await db.query.sessionsTable.findFirst({
    where: eq(sessionsTable.id, sessionId),
  });
  if (!session || session.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (session.status === "mastered") {
    res.status(400).json({ error: "Session already completed" });
    return;
  }

  // Get beat context
  const beat = beatId
    ? await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, beatId) })
    : null;

  // Get recent dialogue history (last 8 turns for context)
  const history = await db
    .select()
    .from(dialogueTurnsTable)
    .where(eq(dialogueTurnsTable.sessionId, sessionId))
    .orderBy(desc(dialogueTurnsTable.createdAt))
    .limit(8);
  const historyOrdered = history.reverse();

  // Save learner turn
  await db.insert(dialogueTurnsTable).values({
    sessionId,
    role: "learner",
    content: response,
    beatId: beatId ?? null,
  });

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const learner = req.dbUser!;
    const exchangeCount = Math.floor(Number(session.turnCount) / 2);
    const socraticCtx: SocraticContext = {
      beatTitle: beat?.title,
      beatType: beat?.type,
      narration: beat?.narration,
      scenario: beat?.scenario,
      bulletPoints: beat?.bulletPoints,
      learnerName: learner.firstName,
      personality: learner.coachPersonality,
      learningStyle: learner.learningStyle,
      accommodations: learner.accommodations,
      turnCount: exchangeCount,
      promptBudget: PROMPT_BUDGET,
    };
    const systemPrompt = buildSocraticSystemPrompt(socraticCtx, false);

    const chatMessages: { role: "user" | "assistant"; content: string }[] = [
      ...historyOrdered.map(t => ({
        role: t.role === "tutor" ? ("assistant" as const) : ("user" as const),
        content: t.content,
      })),
      { role: "user", content: response },
    ];

    let fullResponse = "";
    const stream = anthropic.messages.stream({
      model: SOCRATIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    // Guarantee the turn ends on a question so the dialogue never stalls.
    const cleaned = ensureQuestion(fullResponse);
    if (cleaned !== fullResponse) {
      const tail = cleaned.slice(fullResponse.length);
      if (tail) res.write(`data: ${JSON.stringify({ content: tail })}\n\n`);
      fullResponse = cleaned;
    }

    // Grade + SM-2 + credential issuance (shared with the WhatsApp channel).
    const result = await applyCheckpoint({
      userId: req.userId!,
      session,
      socraticCtx,
      learnerResponse: response,
      historyOrdered,
      tutorReply: fullResponse,
    });

    const masteryDelta = result.newMastery - Number(session.masteryScore);

    // Save tutor turn
    await db.insert(dialogueTurnsTable).values({
      sessionId,
      role: "tutor",
      content: fullResponse,
      beatId: beatId ?? null,
      reasoning: result.reasoning,
      masteryDelta: masteryDelta.toFixed(4),
    });

    res.write(`data: ${JSON.stringify({ done: true, masteryScore: result.newMastery, grade: result.grade, mastered: result.mastered })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Session respond error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed", done: true })}\n\n`);
    res.end();
  }
});

// GET /sessions/:sessionId/progress
router.get("/sessions/:sessionId/progress", requireAuth, async (req, res) => {
  const session = await db.query.sessionsTable.findFirst({
    where: eq(sessionsTable.id, req.params.sessionId),
  });
  if (!session) { res.status(404).json({ error: "Not found" }); return; }
  if (session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }

  const [beatCountResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, session.moduleId));

  const masteryScore = Number(session.masteryScore);
  const beatsCompleted = Math.floor(masteryScore * Number(beatCountResult.count ?? 0));

  res.json({
    sessionId: session.id,
    masteryScore,
    beatsCompleted,
    totalBeats: Number(beatCountResult.count ?? 0),
    status: session.status,
    competencyScores: [],
  });
});

// POST /learner/submit-work
router.post("/learner/submit-work", requireAuth, async (req, res) => {
  const { moduleId, title, contentText } = req.body;
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
  const [submission] = await db
    .insert(submissionsTable)
    .values({
      userId: req.userId!,
      moduleId,
      moduleTitle: mod?.title ?? "",
      title,
      contentText,
      status: "submitted",
    })
    .returning();
  res.status(201).json({
    id: submission.id,
    userId: submission.userId,
    moduleId: submission.moduleId,
    moduleTitle: submission.moduleTitle,
    title: submission.title,
    contentText: submission.contentText,
    status: submission.status,
    coachFeedback: submission.coachFeedback,
    createdAt: submission.createdAt.toISOString(),
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
  });
});

export default router;
