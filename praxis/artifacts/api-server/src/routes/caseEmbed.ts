import { Router } from "express";
import { db } from "@workspace/db";
import {
  caseScenariosTable,
  caseRubricsTable,
  caseSessionsTable,
  caseEmbedLinksTable,
  caseLinkAccessTable,
  type CaseEmbedLink,
  type CaseScenario,
  type CaseMessage,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  buildCaseSystemPrompt,
  generateCaseOpening,
  generateCaseAnalysis,
  CASE_MODEL,
  type CaseContext,
} from "../lib/caseEngine";
import { ensureQuestion } from "../lib/socraticEngine";

/**
 * Public, UNAUTHENTICATED case runner via a signed embed token. A learner outside Praxis
 * can open a shared case, hold the Socratic dialogue, and receive the end-of-session
 * analysis — without an account. Access is gated only by the opaque token, its active flag
 * and its expiry. Every open is logged (case_link_access) and the link's counter bumped.
 *
 * SECURITY: no auth middleware here by design; the token IS the credential. Nothing here
 * exposes org data beyond the single case the token points at.
 */
const router = Router();

async function resolveLink(token: string): Promise<{ link: CaseEmbedLink; caseRow: CaseScenario } | null> {
  const link = await db.query.caseEmbedLinksTable.findFirst({ where: eq(caseEmbedLinksTable.token, token) });
  if (!link || !link.isActive) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  const caseRow = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, link.caseId) });
  if (!caseRow || caseRow.status !== "published") return null;
  return { link, caseRow };
}

function ctx(c: CaseScenario, learnerName: string | null, turnCount: number): CaseContext {
  return {
    title: c.title,
    learningObjective: c.learningObjective,
    contextBlock: c.contextBlock,
    openingQuestion: c.openingQuestion,
    focusAreas: c.focusAreas,
    aiConstraints: c.aiConstraints,
    guidingInstructions: c.guidingInstructions,
    promptLimit: c.promptLimit,
    learnerName,
    turnCount,
  };
}

// GET /case-embed/:token — public case view (no answers, no constraints leaked).
router.get("/case-embed/:token", async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) { res.status(404).json({ error: "This link is not available." }); return; }
  const { link, caseRow } = resolved;

  // Log + count the access (fire-and-forget).
  void db.insert(caseLinkAccessTable).values({ embedLinkId: link.id, caseId: caseRow.id, ipAddress: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null }).catch(() => {});
  void db.update(caseEmbedLinksTable).set({ accessCount: link.accessCount + 1 }).where(eq(caseEmbedLinksTable.id, link.id)).catch(() => {});

  res.json({
    token: link.token,
    title: caseRow.title,
    learningObjective: caseRow.learningObjective,
    contextBlock: caseRow.contextBlock,
    difficulty: caseRow.difficulty,
    promptLimit: caseRow.promptLimit,
  });
});

// POST /case-embed/:token/start — create an embed session and return the opening question.
router.post("/case-embed/:token/start", async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) { res.status(404).json({ error: "This link is not available." }); return; }
  const { link, caseRow } = resolved;
  const learnerName = typeof req.body?.learnerName === "string" && req.body.learnerName.trim() ? req.body.learnerName.trim().slice(0, 80) : null;

  const opening = await generateCaseOpening(ctx(caseRow, learnerName, 0));
  const messages: CaseMessage[] = [{ role: "tutor", content: opening, at: new Date().toISOString() }];
  const [s] = await db
    .insert(caseSessionsTable)
    .values({ caseId: caseRow.id, organisationId: caseRow.organisationId, embedLinkId: link.id, learnerName, messages, promptLimit: caseRow.promptLimit, status: "in_progress" })
    .returning();
  res.status(201).json({ sessionId: s.id, messages, promptLimit: s.promptLimit, promptCount: 0 });
});

// POST /case-embed/:token/chat — SSE Socratic turn for an embed session.
router.post("/case-embed/:token/chat", async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) { res.status(404).json({ error: "This link is not available." }); return; }
  const { caseRow } = resolved;
  const { sessionId, response } = req.body ?? {};
  if (!sessionId || !response) { res.status(400).json({ error: "sessionId and response required" }); return; }

  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, sessionId) });
  if (!s || s.caseId !== caseRow.id) { res.status(404).json({ error: "Session not found" }); return; }
  if (s.status !== "in_progress") { res.status(400).json({ error: "Session completed" }); return; }

  const learnerMsg: CaseMessage = { role: "learner", content: String(response), at: new Date().toISOString() };
  const history = [...(s.messages ?? []), learnerMsg];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const system = buildCaseSystemPrompt(ctx(caseRow, s.learnerName, s.promptCount), false);
    const chat = history.map((m) => ({ role: m.role === "tutor" ? ("assistant" as const) : ("user" as const), content: m.content }));

    let full = "";
    const stream = anthropic.messages.stream({ model: CASE_MODEL, max_tokens: 1024, system, messages: chat });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        full += event.delta.text;
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }
    const cleaned = ensureQuestion(full);
    if (cleaned !== full) {
      const tail = cleaned.slice(full.length);
      if (tail) res.write(`data: ${JSON.stringify({ content: tail })}\n\n`);
      full = cleaned;
    }

    const newMessages = [...history, { role: "tutor" as const, content: full, at: new Date().toISOString() }];
    const newCount = s.promptCount + 1;
    await db.update(caseSessionsTable).set({ messages: newMessages, promptCount: newCount }).where(eq(caseSessionsTable.id, s.id));
    res.write(`data: ${JSON.stringify({ done: true, promptCount: newCount, promptLimit: s.promptLimit, budgetReached: newCount >= (s.promptLimit ?? 8) })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "case embed chat error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed", done: true })}\n\n`);
    res.end();
  }
});

// POST /case-embed/:token/analysis — generate + persist analysis for an embed session.
router.post("/case-embed/:token/analysis", async (req, res) => {
  const resolved = await resolveLink(req.params.token);
  if (!resolved) { res.status(404).json({ error: "This link is not available." }); return; }
  const { caseRow } = resolved;
  const { sessionId } = req.body ?? {};
  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, sessionId) });
  if (!s || s.caseId !== caseRow.id) { res.status(404).json({ error: "Session not found" }); return; }
  if (s.status === "completed" && s.engagementNarrative) {
    res.json({ engagementScore: s.engagementScore, engagementNarrative: s.engagementNarrative, conceptsAddressed: s.conceptsAddressed ?? [], reasoningStrengths: s.reasoningStrengths ?? [], developmentAreas: s.developmentAreas ?? [], rubricScores: s.rubricScores ?? [] });
    return;
  }
  const rubric = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, caseRow.id) });
  const analysis = await generateCaseAnalysis(
    { title: caseRow.title, learningObjective: caseRow.learningObjective, contextBlock: caseRow.contextBlock, focusAreas: caseRow.focusAreas },
    s.messages ?? [],
    rubric ? { criteria: rubric.criteria } : null
  );
  await db
    .update(caseSessionsTable)
    .set({ status: "completed", completedAt: new Date(), engagementScore: analysis.engagementScore, engagementNarrative: analysis.engagementNarrative, conceptsAddressed: analysis.conceptsAddressed, reasoningStrengths: analysis.reasoningStrengths, developmentAreas: analysis.developmentAreas, rubricScores: analysis.rubricScores })
    .where(eq(caseSessionsTable.id, s.id));
  res.json(analysis);
});

export default router;
