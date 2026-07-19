import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  caseScenariosTable,
  caseRubricsTable,
  caseSessionsTable,
  caseEmbedLinksTable,
  caseAssignmentsTable,
  unitStandardMappingsTable,
  organisationsTable,
  partnersTable,
  usersTable,
  coursesTable,
  modulesTable,
  courseGroupsTable,
  courseGroupMembersTable,
  gradebookItemsTable,
  type CaseScenario,
  type CaseAssignment,
  type RubricCriterion,
  type CaseMessage,
} from "@workspace/db";
import { eq, and, or, isNull, ne, inArray, desc, type SQL } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { canParticipateInCourse } from "../lib/scope";
import { isSuperAdmin, hasHubAccess, canAdministerOrg, isInstructionalDesigner } from "../lib/roles";
import { logAudit } from "../lib/audit";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  buildCaseSystemPrompt,
  generateCaseOpening,
  generateCaseAnalysis,
  generateRubricDraft,
  translateCaseFacts,
  translateTexts,
  CASE_MODEL,
  type CaseContext,
} from "../lib/caseEngine";
import { ensureQuestion } from "../lib/socraticEngine";
import { onGradeEvent } from "../lib/gradebookAlerts";

const router = Router();

const LANGS = ["en", "zu", "xh", "af", "sn"];
const validLang = (l: unknown): l is string => typeof l === "string" && LANGS.includes(l);

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
    tutorName: c.tutorName,
    tutorAvatar: c.tutorAvatar,
    language: c.language,
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

// GET /courses/:courseId/cases — case studies attached to a course (via gradebook case columns).
router.get("/courses/:courseId/cases", requireAuth, async (req, res) => {
  const items = await db.select().from(gradebookItemsTable)
    .where(and(eq(gradebookItemsTable.courseId, req.params.courseId), eq(gradebookItemsTable.sourceType, "case")));
  if (items.length === 0) { res.json([]); return; }
  const caseIds = items.map((i) => i.sourceId).filter((x): x is string => !!x);
  const cases = caseIds.length ? await db.select().from(caseScenariosTable).where(inArray(caseScenariosTable.id, caseIds)) : [];
  const byId = new Map(cases.map((c) => [c.id, c]));
  res.json(items.map((i) => ({
    itemId: i.id, caseId: i.sourceId,
    title: (i.sourceId && byId.get(i.sourceId)?.title) || "Case study",
    status: (i.sourceId && byId.get(i.sourceId)?.status) || null,
  })));
});

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

    // Also surface cases reached through the distribution chain (learner/org/partner grants),
    // even if the case sits outside the user's tenant (e.g. a platform-library case a Hub
    // author pushed down to this org). Additive to tenant + library visibility above.
    const accessConds: SQL[] = [];
    if (u.id) accessConds.push(and(eq(caseAssignmentsTable.userId, u.id), eq(caseAssignmentsTable.tier, "learner")) as SQL);
    if (u.organisationId) accessConds.push(and(eq(caseAssignmentsTable.organisationId, u.organisationId), eq(caseAssignmentsTable.tier, "organisation")) as SQL);
    if (u.partnerId) accessConds.push(and(eq(caseAssignmentsTable.partnerId, u.partnerId), eq(caseAssignmentsTable.tier, "partner")) as SQL);
    if (accessConds.length) {
      const grants = await db.select({ caseId: caseAssignmentsTable.caseId }).from(caseAssignmentsTable)
        .where(and(ne(caseAssignmentsTable.status, "revoked"), or(...accessConds)));
      const have = new Set(rows.map((r) => r.id));
      const missing = [...new Set(grants.map((g) => g.caseId))].filter((id) => !have.has(id));
      if (missing.length) {
        const extra = await db.select().from(caseScenariosTable).where(inArray(caseScenariosTable.id, missing));
        rows = [...rows, ...extra];
      }
    }
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
  if (!caseInScope(u, c) && !(await hasAssignmentAccess(u, c.id))) { res.status(404).json({ error: "Not found" }); return; }
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
      tutorName: b.tutorName ?? null,
      tutorAvatar: b.tutorAvatar ?? null,
      language: validLang(b.language) ? b.language : "en",
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
  assign("tutorName", b.tutorName);
  assign("tutorAvatar", b.tutorAvatar);
  if (validLang(b.language)) up.language = b.language;
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
      tutorName: c.tutorName,
      tutorAvatar: c.tutorAvatar,
      language: c.language,
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
    language: s.language,
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

function ctxFromCase(c: CaseScenario, learner: U | null, turnCount: number, language?: string | null): CaseContext {
  return {
    title: c.title,
    learningObjective: c.learningObjective,
    contextBlock: c.contextBlock,
    // The authored opener is written in the case's default language; if the learner chose a
    // different language, drop it so the engine generates the opener in that language.
    openingQuestion: (language && language !== c.language) ? null : c.openingQuestion,
    focusAreas: c.focusAreas,
    aiConstraints: c.aiConstraints,
    guidingInstructions: c.guidingInstructions,
    aiPersona: c.aiPersona,
    language: language ?? c.language,
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
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  if (!caseInScope(u, c) && !(await hasAssignmentAccess(u, c.id))) { res.status(404).json({ error: "Not found" }); return; }
  if (c.status !== "published" && !canManageCase(u, c)) { res.status(403).json({ error: "This case is not published yet." }); return; }

  // caseInScope() is a TENANT check -- it says the case belongs to your organisation, which
  // is not the same as saying you are on the course that teaches it. When the case is homed
  // in a module, the course applies. Library cases with no module stay open to the tenant,
  // which is what a shared library is for. Fixing it here also closes the follow-on session
  // routes (message/complete/language), since those only verify the session is yours.
  if (c.moduleId) {
    const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, c.moduleId) });
    // Fail CLOSED on a dangling moduleId: if the case claims a module that no longer exists
    // we cannot prove the caller belongs, so we deny rather than wave them through.
    if (!mod || !(await canParticipateInCourse(req.dbUser!, mod.courseId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const lang = validLang(req.body?.language) ? req.body.language : c.language;
  // The learner may enter their name on the pre-start screen; else use their account name.
  const enteredName = typeof req.body?.learnerName === "string" && req.body.learnerName.trim()
    ? req.body.learnerName.trim().slice(0, 80)
    : ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.email);

  const ctx = ctxFromCase(c, req.dbUser as unknown as U, 0, lang);
  ctx.learnerName = enteredName;
  const opening = await generateCaseOpening(ctx);

  // Translate the fact pattern into the session language when it differs from the default.
  const facts = lang !== c.language
    ? await translateCaseFacts(c.learningObjective, c.contextBlock, lang)
    : { objective: c.learningObjective, context: c.contextBlock };

  const messages: CaseMessage[] = [{ role: "tutor", content: opening, at: new Date().toISOString() }];
  const [s] = await db
    .insert(caseSessionsTable)
    .values({
      caseId: c.id, organisationId: c.organisationId, userId: u.id, learnerName: enteredName, language: lang,
      translatedContext: lang !== c.language ? facts.context : null,
      translatedObjective: lang !== c.language ? facts.objective : null,
      messages, promptLimit: c.promptLimit, status: "in_progress",
    })
    .returning();
  res.status(201).json({ ...sessionResponse(s), tutorName: c.tutorName, tutorAvatar: c.tutorAvatar, caseTitle: c.title, contextBlock: facts.context, learningObjective: facts.objective });
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
  const cs = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, s.caseId) });
  if (s.userId !== u.id) {
    if (!cs || !canManageCase(u, cs)) { res.status(404).json({ error: "Not found" }); return; }
  }
  res.json({
    ...sessionResponse(s),
    tutorName: cs?.tutorName ?? null,
    tutorAvatar: cs?.tutorAvatar ?? null,
    caseTitle: cs?.title ?? null,
    contextBlock: s.translatedContext ?? cs?.contextBlock ?? null,
    learningObjective: s.translatedObjective ?? cs?.learningObjective ?? null,
  });
});

// POST /case-sessions/:id/language — switch the language of a live session. Everything the
// system produced (the fact pattern + every prior tutor turn) is re-translated into the new
// language and persisted, so the whole conversation reads in the chosen language immediately;
// subsequent turns are generated in it too. The learner's own typed messages are left exactly
// as they wrote them (translating a person's own reasoning could distort the end analysis).
router.post("/case-sessions/:id/language", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const lang = validLang(req.body?.language) ? req.body.language : null;
  if (!lang) { res.status(400).json({ error: "invalid language" }); return; }
  const s = await db.query.caseSessionsTable.findFirst({ where: eq(caseSessionsTable.id, req.params.id) });
  if (!s || s.userId !== u.id) { res.status(404).json({ error: "Not found" }); return; }
  if (s.status !== "in_progress") { res.status(400).json({ error: "Session already completed" }); return; }
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, s.caseId) });
  if (!c) { res.status(404).json({ error: "Case not found" }); return; }

  const src = (s.messages ?? []) as CaseMessage[];

  // No-op fast path: already in this language — return the current view unchanged.
  if (lang === (s.language ?? c.language)) {
    res.json({
      language: lang,
      messages: src,
      contextBlock: s.translatedContext ?? c.contextBlock,
      learningObjective: s.translatedObjective ?? c.learningObjective,
    });
    return;
  }

  // Re-translate the fact pattern (or revert to the authored originals when back to default).
  const facts = lang !== c.language
    ? await translateCaseFacts(c.learningObjective, c.contextBlock, lang)
    : { objective: c.learningObjective, context: c.contextBlock };

  // Re-translate every tutor turn in one call; zip back by index. Learner turns untouched.
  const tutorIdx = src.map((m, i) => (m.role === "tutor" ? i : -1)).filter((i) => i >= 0);
  const translated = tutorIdx.length ? await translateTexts(tutorIdx.map((i) => src[i].content), lang) : [];
  const newMessages = src.map((m) => ({ ...m }));
  tutorIdx.forEach((i, k) => { if (translated[k]) newMessages[i].content = translated[k]; });

  await db
    .update(caseSessionsTable)
    .set({
      language: lang,
      translatedContext: lang !== c.language ? facts.context : null,
      translatedObjective: lang !== c.language ? facts.objective : null,
      messages: newMessages,
    })
    .where(eq(caseSessionsTable.id, s.id));

  res.json({ language: lang, messages: newMessages, contextBlock: facts.context, learningObjective: facts.objective });
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

  // Learner may switch language mid-session; persist the change for later turns + analysis.
  const lang = validLang(req.body?.language) ? req.body.language : (s.language ?? c.language);
  if (validLang(req.body?.language) && req.body.language !== s.language) {
    await db.update(caseSessionsTable).set({ language: lang }).where(eq(caseSessionsTable.id, s.id));
  }

  const learnerMsg: CaseMessage = { role: "learner", content: response, at: new Date().toISOString() };
  const history = [...(s.messages ?? []), learnerMsg];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const ctx = ctxFromCase(c, req.dbUser as unknown as U, s.promptCount, lang);
    if (s.learnerName) ctx.learnerName = s.learnerName;
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

    // Roll a learner's assignment from "assigned" to "in_progress" on their first real turn.
    await db.update(caseAssignmentsTable)
      .set({ status: "in_progress", updatedAt: new Date() })
      .where(and(eq(caseAssignmentsTable.userId, u.id), eq(caseAssignmentsTable.caseId, s.caseId), eq(caseAssignmentsTable.tier, "learner"), eq(caseAssignmentsTable.status, "assigned")));

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
    { title: c.title, learningObjective: c.learningObjective, contextBlock: c.contextBlock, focusAreas: c.focusAreas, language: s.language ?? c.language },
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

  // Mark the learner's assignment complete so admin progress + compliance reporting roll up.
  await db.update(caseAssignmentsTable)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(caseAssignmentsTable.userId, u.id), eq(caseAssignmentsTable.caseId, s.caseId), eq(caseAssignmentsTable.tier, "learner"), ne(caseAssignmentsTable.status, "revoked")));

  // Refresh gradebook off-track state (+ auto plan / alerts) wherever this case is graded.
  void onGradeEvent({ sourceType: "case", sourceId: s.caseId, userId: u.id });

  res.json(sessionResponse(updated));
});

/* ───────────────────────────── Distribution / assignment chain ─────────────────────────────
 * Partner -> Organisation -> Learner, explicit at each tier. A Hub author seeds the chain by
 * granting to partners; a partner_admin passes it to orgs under their partner; an org_admin
 * passes it to learners (individually or by cohort). Each downward step requires an active
 * upstream grant to exist (super admins bypass, holding all-tier access).
 * ────────────────────────────────────────────────────────────────────────────────────────── */

const TIERS = ["partner", "organisation", "learner"] as const;
type Tier = (typeof TIERS)[number];
const isTier = (x: unknown): x is Tier => typeof x === "string" && (TIERS as readonly string[]).includes(x);

/** The tier a non-super-admin actor distributes at, derived from their role. */
function roleTier(role: string): Tier | null {
  if (isInstructionalDesigner(role)) return "partner"; // Hub author seeds the chain
  if (role === "partner_admin") return "organisation";
  if (role === "org_admin") return "learner";
  return null;
}

/** Active (non-revoked) grants for a case — used for chain enforcement + dedup. */
async function activeAssignments(caseId: string): Promise<CaseAssignment[]> {
  return db.select().from(caseAssignmentsTable).where(and(eq(caseAssignmentsTable.caseId, caseId), ne(caseAssignmentsTable.status, "revoked")));
}

/** Does this user have run access to a case via an active assignment (learner/org/partner tier)? */
async function hasAssignmentAccess(u: U, caseId: string): Promise<boolean> {
  const conds: SQL[] = [];
  if (u.id) conds.push(and(eq(caseAssignmentsTable.userId, u.id), eq(caseAssignmentsTable.tier, "learner")) as SQL);
  if (u.organisationId) conds.push(and(eq(caseAssignmentsTable.organisationId, u.organisationId), eq(caseAssignmentsTable.tier, "organisation")) as SQL);
  if (u.partnerId) conds.push(and(eq(caseAssignmentsTable.partnerId, u.partnerId), eq(caseAssignmentsTable.tier, "partner")) as SQL);
  if (!conds.length) return false;
  const row = await db.select().from(caseAssignmentsTable)
    .where(and(eq(caseAssignmentsTable.caseId, caseId), ne(caseAssignmentsTable.status, "revoked"), or(...conds)))
    .limit(1);
  return row.length > 0;
}

function assignmentResponse(a: CaseAssignment) {
  return {
    id: a.id,
    caseId: a.caseId,
    tier: a.tier,
    partnerId: a.partnerId,
    organisationId: a.organisationId,
    userId: a.userId,
    groupId: a.groupId,
    status: a.status,
    dueDate: a.dueDate?.toISOString() ?? null,
    assignedByName: a.assignedByName,
    assignedAt: a.assignedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
  };
}

// GET /cases/:id/assign/targets — the eligible recipients for the actor's next tier, each
// flagged if already assigned; learner tier also returns the org's cohorts (course groups).
router.get("/cases/:id/assign/targets", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  const superA = isSuperAdmin(u.role);
  const tier: Tier | null = superA ? (isTier(req.query.tier) ? req.query.tier : "partner") : roleTier(u.role);
  if (!tier) { res.status(403).json({ error: "Your role cannot assign cases." }); return; }
  const existing = await activeAssignments(c.id);

  if (tier === "partner") {
    const partners = await db.select().from(partnersTable).orderBy(partnersTable.name);
    const set = new Set(existing.filter((a) => a.tier === "partner").map((a) => a.partnerId));
    res.json({ tier, targets: partners.map((p) => ({ id: p.id, name: p.name, alreadyAssigned: set.has(p.id) })), groups: [] });
    return;
  }
  if (tier === "organisation") {
    const partnerId = superA ? (typeof req.query.partnerId === "string" ? req.query.partnerId : null) : (u.partnerId ?? null);
    const orgs = partnerId
      ? await db.select().from(organisationsTable).where(eq(organisationsTable.partnerId, partnerId)).orderBy(organisationsTable.name)
      : (superA ? await db.select().from(organisationsTable).orderBy(organisationsTable.name) : []);
    const set = new Set(existing.filter((a) => a.tier === "organisation").map((a) => a.organisationId));
    res.json({ tier, targets: orgs.map((o) => ({ id: o.id, name: o.name, alreadyAssigned: set.has(o.id) })), groups: [] });
    return;
  }
  // learner tier
  const orgId = superA ? (typeof req.query.organisationId === "string" ? req.query.organisationId : (u.organisationId ?? null)) : (u.organisationId ?? u.partnerId ?? null);
  const learners = orgId
    ? await db.select().from(usersTable).where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner"))).orderBy(usersTable.firstName)
    : [];
  const set = new Set(existing.filter((a) => a.tier === "learner").map((a) => a.userId));
  let groups: { id: string; name: string; courseTitle: string | null; memberCount: number }[] = [];
  if (orgId) {
    const courses = await db.select().from(coursesTable).where(eq(coursesTable.tenantId, orgId));
    const courseIds = courses.map((cc) => cc.id);
    if (courseIds.length) {
      const cgs = await db.select().from(courseGroupsTable).where(inArray(courseGroupsTable.courseId, courseIds));
      const titleById = new Map(courses.map((cc) => [cc.id, cc.title]));
      const gm = cgs.length ? await db.select().from(courseGroupMembersTable).where(inArray(courseGroupMembersTable.groupId, cgs.map((g) => g.id))) : [];
      const counts = new Map<string, number>();
      gm.forEach((m) => counts.set(m.groupId, (counts.get(m.groupId) ?? 0) + 1));
      groups = cgs.map((g) => ({ id: g.id, name: g.name, courseTitle: titleById.get(g.courseId) ?? null, memberCount: counts.get(g.id) ?? 0 }));
    }
  }
  res.json({ tier, targets: learners.map((l) => ({ id: l.id, name: [l.firstName, l.lastName].filter(Boolean).join(" ") || l.email, alreadyAssigned: set.has(l.id) })), groups });
});

// POST /cases/:id/assign — grant a case down one tier of the chain.
router.post("/cases/:id/assign", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }

  const superA = isSuperAdmin(u.role);
  const tier: Tier | null = superA ? (isTier(req.body?.tier) ? req.body.tier : null) : roleTier(u.role);
  if (!tier) { res.status(403).json({ error: superA ? "Specify a tier: partner, organisation or learner." : "Your role cannot assign cases." }); return; }

  const targetIds: string[] = Array.isArray(req.body?.targetIds) ? req.body.targetIds.filter((x: unknown) => typeof x === "string") : [];
  const groupId: string | null = typeof req.body?.groupId === "string" ? req.body.groupId : null;
  const dueDate = req.body?.dueDate ? new Date(req.body.dueDate) : null;

  const existing = await activeAssignments(c.id);
  const assignerName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
  const rows: (typeof caseAssignmentsTable.$inferInsert)[] = [];
  let skipped = 0;

  if (tier === "partner") {
    if (!hasHubAccess(u.role)) { res.status(403).json({ error: "Only Hub roles assign to partners." }); return; }
    const partners = targetIds.length ? await db.select().from(partnersTable).where(inArray(partnersTable.id, targetIds)) : [];
    const already = new Set(existing.filter((a) => a.tier === "partner").map((a) => a.partnerId));
    for (const p of partners) {
      if (already.has(p.id)) { skipped++; continue; }
      rows.push({ caseId: c.id, tier: "partner", partnerId: p.id, assignedBy: u.id, assignedByName: assignerName, dueDate });
    }
  } else if (tier === "organisation") {
    const partnerId = superA ? (typeof req.body?.partnerId === "string" ? req.body.partnerId : null) : (u.partnerId ?? null);
    if (!superA) {
      const upstream = existing.some((a) => a.tier === "partner" && a.partnerId === partnerId);
      if (!partnerId || !upstream) { res.status(403).json({ error: "This case has not been assigned to your partner yet." }); return; }
    }
    const orgs = targetIds.length ? await db.select().from(organisationsTable).where(inArray(organisationsTable.id, targetIds)) : [];
    const parent = existing.find((a) => a.tier === "partner" && a.partnerId === partnerId);
    const already = new Set(existing.filter((a) => a.tier === "organisation").map((a) => a.organisationId));
    for (const o of orgs) {
      if (!superA && o.partnerId !== partnerId) { skipped++; continue; }
      if (already.has(o.id)) { skipped++; continue; }
      rows.push({ caseId: c.id, tier: "organisation", organisationId: o.id, partnerId: o.partnerId, parentAssignmentId: parent?.id ?? null, assignedBy: u.id, assignedByName: assignerName, dueDate });
    }
  } else {
    const orgId = superA ? (typeof req.body?.organisationId === "string" ? req.body.organisationId : (u.organisationId ?? null)) : (u.organisationId ?? u.partnerId ?? null);
    if (!superA) {
      const upstream = existing.some((a) => a.tier === "organisation" && a.organisationId === orgId);
      if (!orgId || !upstream) { res.status(403).json({ error: "This case has not been assigned to your organisation yet." }); return; }
    }
    const learnerIds = new Set<string>(targetIds);
    if (groupId) {
      const members = await db.select().from(courseGroupMembersTable).where(eq(courseGroupMembersTable.groupId, groupId));
      members.forEach((m) => learnerIds.add(m.userId));
    }
    const ids = Array.from(learnerIds);
    const learners = ids.length ? await db.select().from(usersTable).where(inArray(usersTable.id, ids)) : [];
    const parent = existing.find((a) => a.tier === "organisation" && a.organisationId === orgId);
    const already = new Set(existing.filter((a) => a.tier === "learner").map((a) => a.userId));
    for (const l of learners) {
      if (l.role !== "learner") { skipped++; continue; }
      if (!superA && l.organisationId !== orgId) { skipped++; continue; }
      if (already.has(l.id)) { skipped++; continue; }
      rows.push({ caseId: c.id, tier: "learner", userId: l.id, organisationId: l.organisationId ?? orgId, groupId: groupId ?? null, parentAssignmentId: parent?.id ?? null, assignedBy: u.id, assignedByName: assignerName, dueDate });
    }
  }

  if (!rows.length) { res.status(200).json({ created: 0, skipped, assignments: [] }); return; }
  const inserted = await db.insert(caseAssignmentsTable).values(rows).returning();
  await logAudit(req, "case.assign", "case", c.id, { tier, created: inserted.length, skipped });
  res.status(201).json({ created: inserted.length, skipped, assignments: inserted.map(assignmentResponse) });
});

// GET /cases/:id/assignments — grants on this case within the actor's scope, with target names.
router.get("/cases/:id/assignments", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const c = await db.query.caseScenariosTable.findFirst({ where: eq(caseScenariosTable.id, req.params.id) });
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  let all = await db.select().from(caseAssignmentsTable).where(eq(caseAssignmentsTable.caseId, c.id)).orderBy(desc(caseAssignmentsTable.assignedAt));
  if (!hasHubAccess(u.role)) {
    all = all.filter((a) =>
      (!!u.partnerId && a.partnerId === u.partnerId) ||
      (!!u.organisationId && a.organisationId === u.organisationId));
  }
  const partnerIds = [...new Set(all.map((a) => a.partnerId).filter(Boolean))] as string[];
  const orgIds = [...new Set(all.map((a) => a.organisationId).filter(Boolean))] as string[];
  const userIds = [...new Set(all.map((a) => a.userId).filter(Boolean))] as string[];
  const [ps, os, us] = await Promise.all([
    partnerIds.length ? db.select().from(partnersTable).where(inArray(partnersTable.id, partnerIds)) : Promise.resolve([]),
    orgIds.length ? db.select().from(organisationsTable).where(inArray(organisationsTable.id, orgIds)) : Promise.resolve([]),
    userIds.length ? db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
  ]);
  const pN = new Map(ps.map((p) => [p.id, p.name]));
  const oN = new Map(os.map((o) => [o.id, o.name]));
  const uN = new Map(us.map((x) => [x.id, [x.firstName, x.lastName].filter(Boolean).join(" ") || x.email]));
  res.json(all.map((a) => ({
    ...assignmentResponse(a),
    targetName: a.tier === "partner" ? (pN.get(a.partnerId!) ?? null) : a.tier === "organisation" ? (oN.get(a.organisationId!) ?? null) : (uN.get(a.userId!) ?? null),
  })));
});

// GET /case-assignments/my — the current learner's assigned cases (+ due date + status).
router.get("/case-assignments/my", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const rows = await db.select().from(caseAssignmentsTable)
    .where(and(eq(caseAssignmentsTable.userId, u.id), eq(caseAssignmentsTable.tier, "learner"), ne(caseAssignmentsTable.status, "revoked")))
    .orderBy(desc(caseAssignmentsTable.assignedAt));
  const caseIds = [...new Set(rows.map((r) => r.caseId))];
  const cs = caseIds.length ? await db.select().from(caseScenariosTable).where(inArray(caseScenariosTable.id, caseIds)) : [];
  const byId = new Map(cs.map((cc) => [cc.id, cc]));
  res.json(rows
    .map((a) => {
      const cc = byId.get(a.caseId);
      return { ...assignmentResponse(a), caseTitle: cc?.title ?? null, learningObjective: cc?.learningObjective ?? null, difficulty: cc?.difficulty ?? null, caseStatus: cc?.status ?? null };
    })
    .filter((r) => r.caseTitle));
});

// DELETE /case-assignments/:id — revoke a grant (soft) and cascade-revoke its descendants.
router.delete("/case-assignments/:id", requireAuth, async (req, res) => {
  const u = req.dbUser! as U;
  const a = await db.query.caseAssignmentsTable.findFirst({ where: eq(caseAssignmentsTable.id, req.params.id) });
  if (!a) { res.status(204).send(); return; }
  const can = hasHubAccess(u.role)
    || (!!u.partnerId && a.partnerId === u.partnerId)
    || (!!u.organisationId && a.organisationId === u.organisationId);
  if (!can) { res.status(403).json({ error: "Forbidden" }); return; }
  const revoke = new Set<string>([a.id]);
  let frontier = [a.id];
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const kids = await db.select().from(caseAssignmentsTable).where(inArray(caseAssignmentsTable.parentAssignmentId, frontier));
    frontier = kids.map((k) => k.id).filter((id) => !revoke.has(id));
    frontier.forEach((id) => revoke.add(id));
  }
  await db.update(caseAssignmentsTable).set({ status: "revoked", updatedAt: new Date() }).where(inArray(caseAssignmentsTable.id, Array.from(revoke)));
  await logAudit(req, "case.assign_revoke", "case", a.caseId, { assignmentId: a.id, revoked: revoke.size });
  res.status(204).send();
});

export default router;
