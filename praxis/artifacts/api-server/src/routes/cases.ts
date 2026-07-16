import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  caseScenariosTable,
  caseRubricsTable,
  caseSessionsTable,
  caseEmbedLinksTable,
  unitStandardMappingsTable,
  type CaseScenario,
  type RubricCriterion,
  type CaseMessage,
} from "@workspace/db";
import { eq, and, or, isNull, desc, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, hasHubAccess, canAdministerOrg } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  buildCaseSystemPrompt,
  generateCaseOpening,
  generateCaseAnalysis,
  generateRubricDraft,
  CASE_MODEL,
  type CaseContext,
} from "../lib/caseEngine";
import { ensureQuestion } from "../lib/socraticEngine";

const router = Router();

type U = { id: string; role: string; organisationId?: string | null; partnerId?: string | null; firstName?: string | null; lastName?: string | null; email: string };

/** Who may author cases: Hub roles (super admin + instructional designer) or a Facilitator. */
function canAuthorCases(role: string): boolean {
  return hasHubAccess(role) || canAdministerOrg(role);
}

/**
 * A case's `organisationId` is a generic tenant id that may be an organisation OR a
 * partner — exactly like a course's tenantId. Partner admins (transitional flatten) carry
 * partnerId with a null organisationId, so a case they author is tenant-scoped to their
 * partner. Scope checks therefore match EITHER the user's org or their partner.
 */
function userOwnsTenant(user: U, tenantId: string | null): boolean {
  if (!tenantId) return false;
  if (user.organisationId && tenantId === user.organisationId) return true;
  if (user.partnerId && tenantId === user.partnerId) return true;
  return false;
}

/** Author/manage scope for a specific case. */
function canManageCase(user: U, c: CaseScenario): boolean {
  if (hasHubAccess(user.role)) return true; // platform-wide authoring pool
  if (canAdministerOrg(user.role) && userOwnsTenant(user, c.organisationId)) return true;
  return false;
}

/** Visible-to-run scope: a case is runnable if in the user's tenant OR a shared library. */
function caseInScope(user: U, c: CaseScenario): boolean {
  if (hasHubAccess(user.role)) return true;
  if (userOwnsTenant(user, c.organisationId)) return true;
  if (c.isLibrary && !c.organisationId) return true;
  return false;
}

function caseResponse(c: CaseScenario) {
  return {
    id: c.id,
    organisationId: c.organisationId,
    moduleId: c.moduleId,
    createdBy: c.createdBy,
    createdByName: c.createdByName,
    title: c.title,
    learningObjective: c.learningObjective,
    contextBlock: c.contextBlock,
    openingQuestion: c.openingQuestion,
    focusAreas: c.focusAreas ?? [],
    aiConstraints: c.aiConstraints,
    guidingInstructions: c.guidingInstructions,
    aiPersona: c.aiPersona,
    difficulty: c.difficulty,
    bloomsLevel: c.bloomsLevel,
    promptLimit: c.promptLimit,
    socraticStyle: c.socraticStyle,
    aiTone: c.aiTone,
    isLibrary: c.isLibrary,
    status: c.status,
    tags: c.tags ?? [],
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/* ───────────────────────────── Authoring CRUD ───────────────────────────── */

// GET /cases — list cases visible to the caller.
router.get("/cases", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  let rows: CaseScenario[];
  if (hasHubAccess(u.role)) {
    rows = await db.select().from(caseScenariosTable).orderBy(desc(caseScenariosTable.updatedAt));
  } else {
    const conds: SQL[] = [and(eq(caseScenariosTable.isLibrary, true), isNull(caseScenariosTable.organisationId)) as SQL];
    if (u.organisationId) conds.unshift(eq(caseScenariosTable.organisationId, u.organisationId));
    if (u.partnerId) conds.unshift(eq(caseScenariosTable.organisationId, u.partnerId));
    rows = await db
      .select()
      .from(caseScenariosTable)
      .where(conds.length > 1 ? or(...conds) : conds[0])
      .orderBy(desc(caseScenariosTable.updatedAt));
    // Non-authors only see published cases.
    if (!canAuthorCases(u.role)) rows = rows.filter((c) => c.status === "published");
  }
  if (status) rows = rows.filter((c) => c.status === status);
  res.json(rows.map(caseResponse));
});

// GET /cases/:id — a single case (+ rubric).
router.get("/cases/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!caseInScope(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  if (c.status !== "published" && !canManageCase(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  const rubric = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, c.id) });
  res.json({ ...caseResponse(c), rubric: rubric ? { criteria: rubric.criteria, totalPoints: rubric.totalPoints } : null, canManage: canManageCase(u, c) });
});

// POST /cases — create a case.
router.post("/cases", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  if (!canAuthorCases(u.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  if (!b.title || typeof b.title !== "string") { res.status(400).json({ error: "title is required" }); return; }
  // Every dialogue must be grounded: a published case cannot exist without a fact pattern.
  if (b.status === "published" && !(b.contextBlock && String(b.contextBlock).trim())) {
    res.status(400).json({ error: "A published case needs a context / fact pattern so the tutor has something to ground its questions in." });
    return;
  }

  // Hub authors may publish to the shared library (org null); facilitators author for their org.
  const isLibrary = hasHubAccess(u.role) && b.isLibrary === true;
  // Tenant = org if present, else partner (transitional flatten), else explicit body value.
  const organisationId = isLibrary ? null : (u.organisationId ?? u.partnerId ?? b.organisationId ?? null);

  const [row] = await db
    .insert(caseScenariosTable)
    .values({
      organisationId,
      moduleId: b.moduleId ?? null,
      createdBy: u.id,
      createdByName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      title: b.title,
      learningObjective: b.learningObjective ?? null,
      contextBlock: b.contextBlock ?? "",
      openingQuestion: b.openingQuestion ?? null,
      focusAreas: Array.isArray(b.focusAreas) ? b.focusAreas : null,
      aiConstraints: b.aiConstraints ?? null,
      guidingInstructions: b.guidingInstructions ?? null,
      aiPersona: b.aiPersona ?? null,
      difficulty: ["foundational", "intermediate", "advanced"].includes(b.difficulty) ? b.difficulty : "intermediate",
      bloomsLevel: b.bloomsLevel ?? null,
      promptLimit: Number.isFinite(b.promptLimit) ? Math.max(3, Math.min(20, Math.round(b.promptLimit))) : 8,
      isLibrary,
      status: b.status === "published" ? "published" : "draft",
      tags: Array.isArray(b.tags) ? b.tags : null,
    })
    .returning();
  await logAudit(req, "case.create", "case", row.id, { title: row.title, organisationId });
  res.status(201).json(caseResponse(row));
});

// PUT /cases/:id — update a case.
router.put("/cases/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const up: Partial<typeof caseScenariosTable.$inferInsert> = { updatedAt: new Date() };
  const assign = <K extends keyof typeof caseScenariosTable.$inferInsert>(k: K, v: unknown) => { if (v !== undefined) (up as Record<string, unknown>)[k] = v; };
  assign("title", b.title);
  assign("learningObjective", b.learningObjective);
  assign("contextBlock", b.contextBlock);
  assign("openingQuestion", b.openingQuestion);
  if (b.focusAreas !== undefined) up.focusAreas = Array.isArray(b.focusAreas) ? b.focusAreas : null;
  assign("aiConstraints", b.aiConstraints);
  assign("guidingInstructions", b.guidingInstructions);
  assign("aiPersona", b.aiPersona);
  if (b.difficulty !== undefined && ["foundational", "intermediate", "advanced"].includes(b.difficulty)) up.difficulty = b.difficulty;
  assign("bloomsLevel", b.bloomsLevel);
  if (b.promptLimit !== undefined && Number.isFinite(b.promptLimit)) up.promptLimit = Math.max(3, Math.min(20, Math.round(b.promptLimit)));
  if (b.status !== undefined && ["draft", "published"].includes(b.status)) up.status = b.status;
  if (b.tags !== undefined) up.tags = Array.isArray(b.tags) ? b.tags : null;
  // Publishing requires a fact pattern — check the effective value (incoming or existing).
  if (up.status === "published") {
    const effectiveContext = b.contextBlock !== undefined ? b.contextBlock : c.contextBlock;
    if (!effectiveContext || !String(effectiveContext).trim()) {
      res.status(400).json({ error: "A published case needs a context / fact pattern so the tutor has something to ground its questions in." });
      return;
    }
  }
  const [row] = await db.update(caseScenariosTable).set(up).where(eq(caseScenariosTable.id, c.id)).returning();
  await logAudit(req, "case.update", "case", c.id, { title: row.title });
  res.json(caseResponse(row));
});

// DELETE /cases/:id
router.delete("/cases/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(204).send(); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(caseRubricsTable).where(eq(caseRubricsTable.caseId, c.id));
  await db.delete(unitStandardMappingsTable).where(and(eq(unitStandardMappingsTable.targetType, "case"), eq(unitStandardMappingsTable.targetId, c.id)));
  await db.delete(caseScenariosTable).where(eq(caseScenariosTable.id, c.id));
  await logAudit(req, "case.delete", "case", c.id, { title: c.title });
  res.status(204).send();
});

// POST /cases/:id/fork — duplicate an existing case into the author's scope.
router.post("/cases/:id/fork", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  if (!canAuthorCases(u.role)) { res.status(403).json({ error: "Forbidden" }); return; }
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c || !caseInScope(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  const [row] = await db
    .insert(caseScenariosTable)
    .values({
      organisationId: hasHubAccess(u.role) ? c.organisationId : (u.organisationId ?? u.partnerId ?? null),
      moduleId: c.moduleId,
      createdBy: u.id,
      createdByName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      title: `${c.title} (copy)`,
      learningObjective: c.learningObjective,
      contextBlock: c.contextBlock,
      openingQuestion: c.openingQuestion,
      focusAreas: c.focusAreas,
      aiConstraints: c.aiConstraints,
      guidingInstructions: c.guidingInstructions,
      aiPersona: c.aiPersona,
      difficulty: c.difficulty,
      bloomsLevel: c.bloomsLevel,
      promptLimit: c.promptLimit,
      isLibrary: false,
      status: "draft",
      tags: c.tags,
    })
    .returning();
  await logAudit(req, "case.fork", "case", row.id, { from: c.id });
  res.status(201).json(caseResponse(row));
});

/* ───────────────────────────── Rubric ───────────────────────────── */

// GET /cases/:id/rubric
router.get("/cases/:id/rubric", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c || !caseInScope(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  const rubric = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, c.id) });
  res.json(rubric ? { criteria: rubric.criteria, totalPoints: rubric.totalPoints } : { criteria: [], totalPoints: 100 });
});

// PUT /cases/:id/rubric — upsert; syncs unit-standard mappings so standard-linked criteria
// flow into the QCTO/SETA compliance report (target_type='case').
router.put("/cases/:id/rubric", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  const criteria: RubricCriterion[] = Array.isArray(req.body?.criteria) ? req.body.criteria : [];
  const totalPoints = Number.isFinite(req.body?.totalPoints) ? Math.round(req.body.totalPoints) : criteria.reduce((s, cr) => s + (Number(cr.maxPoints) || 0), 0) || 100;

  const existing = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, c.id) });
  if (existing) {
    await db.update(caseRubricsTable).set({ criteria, totalPoints, updatedAt: new Date() }).where(eq(caseRubricsTable.id, existing.id));
  } else {
    await db.insert(caseRubricsTable).values({ caseId: c.id, organisationId: c.organisationId, criteria, totalPoints });
  }

  // Re-sync standard mappings for this case from criterion.unitStandardId.
  await db.delete(unitStandardMappingsTable).where(and(eq(unitStandardMappingsTable.targetType, "case"), eq(unitStandardMappingsTable.targetId, c.id)));
  const stdIds = Array.from(new Set(criteria.map((cr) => cr.unitStandardId).filter((x): x is string => !!x)));
  if (stdIds.length) {
    await db.insert(unitStandardMappingsTable).values(stdIds.map((sid) => ({ unitStandardId: sid, targetType: "case" as const, targetId: c.id })));
  }
  await logAudit(req, "case.rubric_save", "case", c.id, { criteria: criteria.length, standards: stdIds.length });
  res.json({ criteria, totalPoints });
});

// POST /cases/:id/rubric/generate — AI draft (does not persist).
router.post("/cases/:id/rubric/generate", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  const draft = await generateRubricDraft({ title: c.title, learningObjective: c.learningObjective, contextBlock: c.contextBlock, focusAreas: c.focusAreas });
  res.json(draft);
});

/* ───────────────────────────── Embed links ───────────────────────────── */

// GET /cases/:id/embed-links
router.get("/cases/:id/embed-links", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  const links = await db.select().from(caseEmbedLinksTable).where(eq(caseEmbedLinksTable.caseId, c.id)).orderBy(desc(caseEmbedLinksTable.createdAt));
  res.json(links.map((l) => ({ id: l.id, token: l.token, label: l.label, isActive: l.isActive, accessCount: l.accessCount, expiresAt: l.expiresAt?.toISOString() ?? null, createdAt: l.createdAt.toISOString() })));
});

// POST /cases/:id/embed-links
router.post("/cases/:id/embed-links", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (c.status !== "published") { res.status(400).json({ error: "Publish the case before sharing an embed link." }); return; }
  const expiresAt = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const [link] = await db
    .insert(caseEmbedLinksTable)
    .values({ caseId: c.id, organisationId: c.organisationId, createdBy: u.id, token: randomBytes(24).toString("hex"), label: req.body?.label ?? null, expiresAt })
    .returning();
  await logAudit(req, "case.embed_link_create", "case", c.id, { linkId: link.id });
  res.status(201).json({ id: link.id, token: link.token, label: link.label, isActive: link.isActive, accessCount: 0, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() });
});

// DELETE /cases/:id/embed-links/:linkId — deactivate (soft) a link.
router.delete("/cases/:id/embed-links/:linkId", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(caseEmbedLinksTable).set({ isActive: false }).where(and(eq(caseEmbedLinksTable.id, req.params.linkId), eq(caseEmbedLinksTable.caseId, c.id)));
  await logAudit(req, "case.embed_link_revoke", "case", c.id, { linkId: req.params.linkId });
  res.status(204).send();
});

/* ───────────────────────────── Authenticated sessions ───────────────────────────── */

function sessionResponse(s: typeof caseSessionsTable.$inferSelect) {
  return {
    id: s.id,
    caseId: s.caseId,
    status: s.status,
    messages: s.messages,
    promptCount: s.promptCount,
    promptLimit: s.promptLimit,
    engagementScore: s.engagementScore,
    engagementNarrative: s.engagementNarrative,
    conceptsAddressed: s.conceptsAddressed ?? [],
    reasoningStrengths: s.reasoningStrengths ?? [],
    developmentAreas: s.developmentAreas ?? [],
    rubricScores: s.rubricScores ?? [],
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

function ctxFromCase(c: CaseScenario, learner: U | null, turnCount: number): CaseContext {
  return {
    title: c.title,
    learningObjective: c.learningObjective,
    contextBlock: c.contextBlock,
    openingQuestion: c.openingQuestion,
    focusAreas: c.focusAreas,
    aiConstraints: c.aiConstraints,
    guidingInstructions: c.guidingInstructions,
    aiPersona: c.aiPersona,
    promptLimit: c.promptLimit,
    learnerName: learner?.firstName ?? null,
    personality: (learner as unknown as { coachPersonality?: string } | null)?.coachPersonality ?? null,
    learningStyle: (learner as unknown as { learningStyle?: string } | null)?.learningStyle ?? null,
    accommodations: (learner as unknown as { accommodations?: string[] } | null)?.accommodations ?? null,
    turnCount,
  };
}

// POST /cases/:id/sessions — start an authenticated attempt.
router.post("/cases/:id/sessions", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c || !caseInScope(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  if (c.status !== "published" && !canManageCase(u, c)) { res.status(403).json({ error: "This case is not published yet." }); return; }

  const opening = await generateCaseOpening(ctxFromCase(c, req.dbUser as unknown as U, 0));
  const messages: CaseMessage[] = [{ role: "tutor", content: opening, at: new Date().toISOString() }];
  const [s] = await db
    .insert(caseSessionsTable)
    .values({ caseId: c.id, organisationId: c.organisationId, userId: u.id, learnerName: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email, messages, promptLimit: c.promptLimit, status: "in_progress" })
    .returning();
  res.status(201).json(sessionResponse(s));
});

// GET /case-sessions/my
router.get("/case-sessions/my", requireAuth, async (req, res) => {
  const rows = await db.select().from(caseSessionsTable).where(eq(caseSessionsTable.userId, req.userId!)).orderBy(desc(caseSessionsTable.createdAt));
  res.json(rows.map(sessionResponse));
});

// GET /cases/:id/sessions — author/admin review of attempts on a case.
router.get("/cases/:id/sessions", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!canManageCase(u, c)) { res.status(403).json({ error: "Forbidden" }); return; }
  const rows = await db.select().from(caseSessionsTable).where(eq(caseSessionsTable.caseId, c.id)).orderBy(desc(caseSessionsTable.createdAt));
  res.json(rows.map(sessionResponse));
});

// GET /case-sessions/:id
router.get("/case-sessions/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, req.params.id) });
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  if (s.userId !== u.id) {
    const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, s.caseId) });
    if (!c || !canManageCase(u, c)) { res.status(404).json({ error: "Not found" }); return; }
  }
  res.json(sessionResponse(s));
});

// POST /case-sessions/:id/message — SSE streaming Socratic turn.
router.post("/case-sessions/:id/message", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const { response } = req.body ?? {};
  if (!response || typeof response !== "string") { res.status(400).json({ error: "response required" }); return; }
  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, req.params.id) });
  if (!s || s.userId !== u.id) { res.status(404).json({ error: "Not found" }); return; }
  if (s.status !== "in_progress") { res.status(400).json({ error: "Session already completed" }); return; }
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, s.caseId) });
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }

  const learnerMsg: CaseMessage = { role: "learner", content: response, at: new Date().toISOString() };
  const history = [...(s.messages ?? []), learnerMsg];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const ctx = ctxFromCase(c, req.dbUser as unknown as U, s.promptCount);
    const system = buildCaseSystemPrompt(ctx, false);
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

    const tutorMsg: CaseMessage = { role: "tutor", content: full, at: new Date().toISOString() };
    const newMessages = [...history, tutorMsg];
    const newCount = s.promptCount + 1;
    await db.update(caseSessionsTable).set({ messages: newMessages, promptCount: newCount }).where(eq(caseSessionsTable.id, s.id));

    const budgetReached = newCount >= (s.promptLimit ?? 8);
    res.write(`data: ${JSON.stringify({ done: true, promptCount: newCount, promptLimit: s.promptLimit, budgetReached })}\n\n`);
    res.end();
  } catch (err) {
    req.log?.error({ err }, "case message error");
    res.write(`data: ${JSON.stringify({ error: "Generation failed", done: true })}\n\n`);
    res.end();
  }
});

// POST /case-sessions/:id/complete — generate + persist the end-of-session analysis.
router.post("/case-sessions/:id/complete", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, req.params.id) });
  if (!s || s.userId !== u.id) { res.status(404).json({ error: "Not found" }); return; }
  if (s.status === "completed" && s.engagementNarrative) { res.json(sessionResponse(s)); return; }
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, s.caseId) });
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }
  const rubric = await db.query.caseRubricsTable.findFirst({ where: eq(caseRubricsTable.caseId, c.id) });

  const analysis = await generateCaseAnalysis(
    { title: c.title, learningObjective: c.learningObjective, contextBlock: c.contextBlock, focusAreas: c.focusAreas },
    s.messages ?? [],
    rubric ? { criteria: rubric.criteria } : null
  );

  const [updated] = await db
    .update(caseSessionsTable)
    .set({
      status: "completed",
      completedAt: new Date(),
      engagementScore: analysis.engagementScore,
      engagementNarrative: analysis.engagementNarrative,
      conceptsAddressed: analysis.conceptsAddressed,
      reasoningStrengths: analysis.reasoningStrengths,
      developmentAreas: analysis.developmentAreas,
      rubricScores: analysis.rubricScores,
    })
    .where(eq(caseSessionsTable.id, s.id))
    .returning();
  res.json(sessionResponse(updated));
});

export default router;
