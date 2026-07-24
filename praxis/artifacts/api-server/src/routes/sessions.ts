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
import { canParticipateInCourse } from "../lib/scope";
import {
  buildSocraticSystemPrompt,
  ensureQuestion,
  generateSocraticTurn,
  generateWorkedExample,
  generateAnswerOptions,
  generateSessionAnalysis,
  SOCRATIC_MODEL,
  type SocraticContext,
  type SessionAnalysis,
} from "../lib/socraticEngine";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { applyCheckpoint } from "../lib/mastery";

const router = Router();

// Fallback soft budget when the learner has not chosen an interaction count (older sessions).
const PROMPT_BUDGET = 8;
// The learner chooses how many interactions (their own answers) the session runs for, BEFORE they
// start. Clamped to a sane range: too few can't demonstrate mastery, too many becomes a marathon.
const INTERACTIONS_MIN = 3;
const INTERACTIONS_MAX = 20;
const clampInteractions = (n: number): number => Math.max(INTERACTIONS_MIN, Math.min(INTERACTIONS_MAX, Math.round(n)));

/** The adaptive difficulty tier (0-3) for a mastery score, the same breakpoints the UI meter uses. */
function difficultyTier(mastery: number): number {
  const pct = Math.round(Math.max(0, Math.min(1, mastery)) * 100);
  return pct >= 80 ? 3 : pct >= 50 ? 2 : pct >= 20 ? 1 : 0;
}

/** Count the learner's own answers so far (the interaction measure the learner chose a limit for). */
async function countInteractions(sessionId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dialogueTurnsTable)
    .where(and(eq(dialogueTurnsTable.sessionId, sessionId), eq(dialogueTurnsTable.role, "learner")));
  return Number(row?.n ?? 0);
}

function toSessionResponse(s: typeof sessionsTable.$inferSelect) {
  return {
    id: s.id,
    moduleId: s.moduleId,
    userId: s.userId,
    status: s.status,
    masteryScore: Number(s.masteryScore),
    currentBeatId: s.currentBeatId,
    turnCount: s.turnCount,
    plannedInteractions: s.plannedInteractions ?? null,
    endedReason: s.endedReason ?? null,
    analysis: (s.analysis as SessionAnalysis | null) ?? null,
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
  const remedialFocus = typeof req.body?.remedialFocus === "string" && req.body.remedialFocus.trim()
    ? req.body.remedialFocus.trim().slice(0, 300)
    : null;
  // The learner can set the interaction limit at creation; if omitted, the setup gate sets it via
  // PATCH before the first answer. Either way it is clamped to a sane range.
  const plannedInteractions =
    req.body?.plannedInteractions != null && Number.isFinite(Number(req.body.plannedInteractions))
      ? clampInteractions(Number(req.body.plannedInteractions))
      : null;
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
      remedialFocus,
      plannedInteractions,
    })
    .returning();

  // Create the opening turn using the hardened Socratic engine's opening
  // rule so it honours the learner's coach personality and accommodations.
  if (firstBeat) {
    const learner = req.dbUser!;
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
      promptBudget: plannedInteractions ?? PROMPT_BUDGET,
      remedialFocus,
    };
    let tutorOpening: string;
    try {
      tutorOpening = await generateSocraticTurn(
        ctx,
        [{ role: "user", content: "I'm ready to begin. Ask me the first question." }],
        true
      );
    } catch {
      tutorOpening = `Let's think about this together. ${firstBeat.narration} In your own words, how would you apply this idea in your work tomorrow?`;
    }
    const opts = await generateAnswerOptions(tutorOpening, ctx);
    await db.insert(dialogueTurnsTable).values({
      sessionId: session.id,
      role: "tutor",
      content: tutorOpening,
      beatId: firstBeat.id,
      options: opts.options.length ? opts.options : null,
      selectMode: opts.mode,
    });
    await db
      .update(sessionsTable)
      .set({ turnCount: sql`${sessionsTable.turnCount} + 1` })
      .where(eq(sessionsTable.id, session.id));
  }

  res.status(201).json(toSessionResponse(session));
});

// PATCH /sessions/:sessionId/plan
// The learner chooses how many interactions this session runs for, BEFORE they start answering. This
// is the setup gate: allowed only while the session is still active and the learner has not yet given
// an answer, so the chosen limit is a genuine up-front plan, not a mid-session change.
router.patch("/sessions/:sessionId/plan", requireAuth, async (req, res) => {
  const session = await db.query.sessionsTable.findFirst({ where: eq(sessionsTable.id, req.params.sessionId) });
  if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }
  if (session.status !== "active" || session.completedAt) { res.status(400).json({ error: "Session already started or ended" }); return; }
  const answered = await countInteractions(session.id);
  if (answered > 0) { res.status(400).json({ error: "Session already underway" }); return; }
  const n = Number(req.body?.plannedInteractions);
  if (!Number.isFinite(n)) { res.status(400).json({ error: "plannedInteractions required" }); return; }
  const planned = clampInteractions(n);
  const [updated] = await db
    .update(sessionsTable)
    .set({ plannedInteractions: planned })
    .where(eq(sessionsTable.id, session.id))
    .returning();
  res.json(toSessionResponse(updated));
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
    // How many of the learner's own answers have been given, so the UI can show "Question X of N".
    interactionsUsed: turns.filter((t) => t.role === "learner").length,
    turns: turns.map(t => ({
      id: t.id,
      role: t.role,
      content: t.content,
      beatId: t.beatId,
      reasoning: t.reasoning,
      masteryDelta: t.masteryDelta ? Number(t.masteryDelta) : null,
      options: t.options ?? null,
      selectMode: t.selectMode ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

// POST /sessions/:sessionId/respond — SSE streaming Socratic response
router.post("/sessions/:sessionId/respond", requireAuth, async (req, res) => {
  const { response, beatId } = req.body;
  const isSelection = req.body?.isSelection === true;
  const { sessionId } = req.params;

  const session = await db.query.sessionsTable.findFirst({
    where: eq(sessionsTable.id, sessionId),
  });
  if (!session || session.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // A session ends when mastery is reached OR the learner's chosen interaction limit is used up.
  // Either way completedAt is set; reject further answers so a finished session cannot be extended.
  if (session.status === "mastered" || session.completedAt) {
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

  // Interaction budget: the learner picked how many of their own answers this session runs for. This
  // answer counts; once the tally reaches the planned limit, the session ends after grading (hard cap)
  // and an end-of-session analysis is produced. Null planned => fall back to the soft default budget.
  const interactionsUsed = await countInteractions(sessionId);
  const budget = session.plannedInteractions ?? PROMPT_BUDGET;
  const reachedLimit = session.plannedInteractions != null && interactionsUsed >= session.plannedInteractions;

  // Setup SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const learner = req.dbUser!;
    const exchangeCount = Math.floor(Number(session.turnCount) / 2);

    // Adaptive cadence signal: read how the learner has actually been doing on recent graded
    // turns (masteryDelta per tutor turn). Two non-positive deltas in a row => struggling; a
    // strong last delta => thriving. This is fed to the coach so it genuinely changes pace.
    const tutorDeltas = historyOrdered.filter((t) => t.role === "tutor").map((t) => Number(t.masteryDelta ?? 0));
    const lastTwo = tutorDeltas.slice(-2);
    const recentPerformance: "struggling" | "steady" | "thriving" =
      lastTwo.length >= 2 && lastTwo.every((d) => d <= 0)
        ? "struggling"
        : tutorDeltas.length > 0 && tutorDeltas[tutorDeltas.length - 1] >= 0.12
        ? "thriving"
        : "steady";

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
      promptBudget: budget,
      remedialFocus: session.remedialFocus,
      recentPerformance,
    };
    const systemPrompt = buildSocraticSystemPrompt(socraticCtx, false);

    // Worked-example turns are stored as JSON; give the model a plain summary instead of the JSON.
    const asContext = (t: { role: string; content: string; reasoning?: string | null }) =>
      t.reasoning === "worked_example" ? "[The coach walked through a worked example to illustrate the idea.]" : t.content;
    const chatMessages: { role: "user" | "assistant"; content: string }[] = [
      ...historyOrdered.map(t => ({
        role: t.role === "tutor" ? ("assistant" as const) : ("user" as const),
        content: asContext(t),
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

    // Grade the answer AND generate the next question's answer-choices CONCURRENTLY. They are
    // independent (grading reads the learner's reply + history; options read the new tutor question),
    // so running them together instead of back-to-back fires the `done` event ~one AI round-trip
    // sooner - the main source of the dead gap before the buttons appeared. On the mastery turn the
    // session is over, so we discard the options we speculatively generated.
    const [result, generatedOpts] = await Promise.all([
      // Grade + SM-2 + credential issuance (shared with the WhatsApp channel).
      applyCheckpoint({
        userId: req.userId!,
        session,
        socraticCtx,
        learnerResponse: response,
        historyOrdered,
        tutorReply: fullResponse,
        isSelection,
        // A limited (web) session runs the full chosen count and certifies only on the final answer;
        // reachedLimit marks that final answer. No-limit sessions fall back to the pacing floor.
        pacing: { hasLimit: session.plannedInteractions != null, isFinalInteraction: reachedLimit },
      }),
      generateAnswerOptions(fullResponse, socraticCtx).catch(() => ({ mode: "free" as string, options: [] as string[] })),
    ]);

    const masteryDelta = result.newMastery - Number(session.masteryScore);

    // Scaffolding trigger (brief 7.4): three consecutive struggling items => offer a
    // worked example NOW, no waiting. A struggle = grade 0 or 1. For the two prior turns
    // we use masteryDelta <= 0 as the struggle proxy (grade isn't stored per turn), and
    // the current turn uses the actual grade. This only OFFERS support; it never blocks
    // or penalises, and the learner can ignore it.
    const recentTutor = historyOrdered.filter((t) => t.role === "tutor").slice(-2);
    const priorTwoStruggled =
      recentTutor.length === 2 && recentTutor.every((t) => Number(t.masteryDelta ?? 0) <= 0);
    const scaffold = result.grade <= 1 && priorTwoStruggled;

    // The session ends when the learner masters the concept OR uses up their chosen interactions.
    const ended = result.mastered || reachedLimit;
    const endedReason: "mastered" | "reached_limit" | null = result.mastered ? "mastered" : reachedLimit ? "reached_limit" : null;

    // Selectable answer choices for the NEW question. Once the session ends there is nothing more to
    // answer, so we drop the speculatively-generated options.
    const answerOpts = ended ? { mode: "free" as string, options: [] as string[] } : generatedOpts;

    // Save tutor turn
    await db.insert(dialogueTurnsTable).values({
      sessionId,
      role: "tutor",
      content: fullResponse,
      beatId: beatId ?? null,
      reasoning: result.reasoning,
      masteryDelta: masteryDelta.toFixed(4),
      options: answerOpts.options.length ? answerOpts.options : null,
      selectMode: answerOpts.mode,
    });

    // Adaptive difficulty tier (0-3) the coach is now pitching at, derived from live mastery. Emitted
    // authoritatively from the backend so the visible Level always matches the coach's real escalation.
    const difficulty = difficultyTier(result.newMastery);

    // On end, produce the analysis + recommendation ONCE and cache it on the session. For a
    // limit-reached end (no mastery), also stamp completedAt/endedReason here; the mastery path
    // already set completedAt via applyCheckpoint. Best-effort: a wrap-up hiccup must not fail the turn.
    let analysis: SessionAnalysis | null = null;
    if (ended) {
      try {
        analysis = await generateSessionAnalysis({
          ctx: socraticCtx,
          history: [...historyOrdered.map((t) => ({ role: t.role, content: t.content })), { role: "learner", content: response }, { role: "tutor", content: fullResponse }],
          finalMastery: result.newMastery,
          interactions: interactionsUsed,
          reachedLimit,
          mastered: result.mastered,
        });
      } catch {
        analysis = null;
      }
      await db
        .update(sessionsTable)
        .set({
          endedReason,
          analysis,
          completedAt: session.completedAt ?? new Date(),
        })
        .where(eq(sessionsTable.id, sessionId));
    }

    res.write(`data: ${JSON.stringify({ done: true, masteryScore: result.newMastery, grade: result.grade, reasoning: result.reasoning, mastered: result.mastered, scaffold, options: answerOpts.options, selectMode: answerOpts.mode, difficulty, interactionsUsed, plannedInteractions: session.plannedInteractions ?? null, ended, endedReason, analysis })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Session respond error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed", done: true })}\n\n`);
    res.end();
  }
});

/**
 * GET /sessions/:sessionId/analysis
 * The end-of-session analysis + recommendation. Returns the cached analysis if present; if the
 * session has ended but the analysis was never stored (e.g. a wrap-up hiccup at end time), it is
 * generated on demand and cached. While a session is still active, returns 409 with ready:false.
 */
router.get("/sessions/:sessionId/analysis", requireAuth, async (req, res) => {
  const session = await db.query.sessionsTable.findFirst({ where: eq(sessionsTable.id, req.params.sessionId) });
  if (!session || session.userId !== req.userId) { res.status(404).json({ error: "Not found" }); return; }

  const ended = session.status === "mastered" || !!session.completedAt;
  if (session.analysis) { res.json({ ready: true, analysis: session.analysis }); return; }
  if (!ended) { res.status(409).json({ ready: false, error: "Session still in progress" }); return; }

  // Ended but no cached analysis: build it now from the stored dialogue and final mastery, then cache.
  const turns = await db
    .select()
    .from(dialogueTurnsTable)
    .where(eq(dialogueTurnsTable.sessionId, session.id))
    .orderBy(asc(dialogueTurnsTable.createdAt));
  const beat = session.currentBeatId
    ? await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, session.currentBeatId) })
    : null;
  const interactions = turns.filter((t) => t.role === "learner").length;
  const ctx: SocraticContext = {
    beatTitle: beat?.title,
    moduleTitle: null,
    narration: beat?.narration,
    scenario: beat?.scenario,
    turnCount: interactions,
  };
  const analysis = await generateSessionAnalysis({
    ctx,
    history: turns.map((t) => ({ role: t.role, content: t.reasoning === "worked_example" ? "[worked example]" : t.content })),
    finalMastery: Number(session.masteryScore),
    interactions,
    reachedLimit: session.endedReason === "reached_limit",
    mastered: session.status === "mastered",
  });
  await db.update(sessionsTable).set({ analysis }).where(eq(sessionsTable.id, session.id));
  res.json({ ready: true, analysis });
});

/**
 * POST /sessions/:sessionId/worked-example — the deliberate scaffolding bump.
 *
 * When a learner has struggled several times, another Socratic question adds load
 * without adding support. This ONE turn relaxes the "questions only" rule and gives a
 * single clear worked example (the worked-example effect), then invites the learner to
 * try a similar one. It is offered, never forced, and framed as normal, not as failure.
 */
router.post("/sessions/:sessionId/worked-example", requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const session = await db.query.sessionsTable.findFirst({ where: eq(sessionsTable.id, sessionId) });
  if (!session || session.userId !== req.userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const beat = session.currentBeatId
    ? await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, session.currentBeatId) })
    : null;

  const history = await db
    .select()
    .from(dialogueTurnsTable)
    .where(eq(dialogueTurnsTable.sessionId, sessionId))
    .orderBy(desc(dialogueTurnsTable.createdAt))
    .limit(8);
  const historyOrdered = history
    .reverse()
    .map((t) => ({ role: t.role, content: t.reasoning === "worked_example" ? "[earlier worked example]" : t.content }));

  try {
    const learner = req.dbUser!;
    const worked = await generateWorkedExample(
      {
        beatTitle: beat?.title,
        narration: beat?.narration,
        scenario: beat?.scenario,
        moduleTitle: null,
        learnerName: learner.firstName,
        turnCount: 0,
      },
      historyOrdered
    );

    // Persist as a structured turn: content is the JSON, reasoning marks it as a worked example so
    // the UI renders it in its own interactive box and the model gets a plain summary in context.
    await db.insert(dialogueTurnsTable).values({
      sessionId,
      role: "tutor",
      content: JSON.stringify(worked),
      beatId: session.currentBeatId ?? null,
      reasoning: "worked_example",
    });

    res.json({ workedExample: worked });
  } catch (err) {
    req.log.error({ err }, "worked-example error");
    res.status(500).json({ error: "Could not build a worked example. Please try again." });
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
  // The module lookup result was never checked -- a bad moduleId silently produced a
  // submission with an empty moduleTitle. Now it 404s, and the caller must be on the course.
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canParticipateInCourse(req.dbUser!, mod.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
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
