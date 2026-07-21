import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  credentialsTable,
  funderScopesTable,
  organisationsTable,
  fundingAgreementsTable,
  fundedSeatAssignmentsTable,
} from "@workspace/db";
import { eq, and, inArray, count, desc, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { isSuperAdmin, isFunder, isFacilitator } from "../lib/roles";
import { funderOrgIds, orgCoachingHours } from "../lib/scope";
import { logAudit } from "../lib/audit";

/**
 * Funder / sponsor endpoints (decision doc §10.2).
 *
 * Strictly read-only and strictly AGGREGATE. A funder sees counts and rates for the
 * organizations they finance — never an individual learner's account, identity, or
 * personal data. The role is excluded from every delivery/Hub predicate, so it can reach
 * nothing else; these two endpoints are its entire surface.
 */
const router = Router();

function requireFunder(role: string): boolean {
  return isFunder(role) || isSuperAdmin(role);
}

// GET /funder/scope — which organisations (and optional programs) this funder may see.
router.get("/funder/scope", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (!requireFunder(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const scopes = await db.select().from(funderScopesTable).where(eq(funderScopesTable.funderId, user.id));
  const orgIds = [...new Set(scopes.map((s) => s.organisationId))];
  const orgs = orgIds.length
    ? await db.select().from(organisationsTable).where(inArray(organisationsTable.id, orgIds))
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  res.json(
    scopes.map((s) => ({
      id: s.id,
      organisationId: s.organisationId,
      organisationName: orgName.get(s.organisationId) ?? null,
      courseId: s.courseId,
      label: s.label,
    })),
  );
});

// GET /funder/report — aggregate outcomes for the funder's scoped organisations. Returns
// per-org counts (learners, completions, credentials) plus totals. No individual rows.
// A Super Admin may target a specific org via ?orgId= for support/QA.
router.get("/funder/report", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  if (!requireFunder(user.role)) { res.status(403).json({ error: "Forbidden" }); return; }

  const orgIds = isSuperAdmin(user.role)
    ? (req.query.orgId ? [String(req.query.orgId)] : [])
    : await funderOrgIds(user.id);

  if (orgIds.length === 0) {
    res.json({ organisations: [], totals: { learners: 0, completions: 0, credentials: 0 } });
    return;
  }

  type OrgReport = {
    organisationId: string;
    organisationName: string | null;
    learners: number;
    completions: number;
    credentials: number;
    coachingHours: number | null;
  };
  const organisations: OrgReport[] = [];
  let tLearners = 0;
  let tCompletions = 0;
  let tCredentials = 0;
  let tCoachingHours = 0;

  for (const orgId of orgIds) {
    const learnerRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.organisationId, orgId), eq(usersTable.role, "learner")));
    const learnerIds = learnerRows.map((r) => r.id);

    let completions = 0;
    let credentials = 0;
    if (learnerIds.length > 0) {
      const [c1] = await db
        .select({ count: count() })
        .from(sessionsTable)
        .where(and(inArray(sessionsTable.userId, learnerIds), eq(sessionsTable.status, "mastered")));
      completions = Number(c1.count);
      const [c2] = await db
        .select({ count: count() })
        .from(credentialsTable)
        .where(inArray(credentialsTable.userId, learnerIds));
      credentials = Number(c2.count);
    }

    const coachingHours = await orgCoachingHours(orgId);
    const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
    organisations.push({
      organisationId: orgId,
      organisationName: org?.name ?? null,
      learners: learnerIds.length,
      completions,
      credentials,
      coachingHours,
    });
    tLearners += learnerIds.length;
    tCompletions += completions;
    tCredentials += credentials;
    tCoachingHours += coachingHours;
  }

  res.json({
    organisations,
    totals: {
      learners: tLearners,
      completions: tCompletions,
      credentials: tCredentials,
      coachingHours: tCoachingHours,
    },
  });
});

// ── Provisioning (Super Admin only) ─────────────────────────────────────────────
// Funders are not org members, so they are created and scoped here rather than through
// the org member routes.

// GET /funders — list funder accounts with their scope count.
router.get("/funders", requireAuth, requireSuperAdmin, async (_req, res) => {
  const funders = await db.select().from(usersTable).where(eq(usersTable.role, "funder"));
  const scopes = await db.select().from(funderScopesTable);
  const countByFunder = new Map<string, number>();
  for (const s of scopes) countByFunder.set(s.funderId, (countByFunder.get(s.funderId) ?? 0) + 1);
  res.json(
    funders.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      status: u.status,
      scopeCount: countByFunder.get(u.id) ?? 0,
    })),
  );
});

// POST /funders — create a funder account (invited; sets a password via reset later).
router.post("/funders", requireAuth, requireSuperAdmin, async (req, res) => {
  const { email, firstName, lastName } = req.body;
  if (!email) { res.status(400).json({ error: "email is required" }); return; }
  const existing = await db.query.usersTable.findFirst({ where: eq(usersTable.email, email) });
  if (existing) { res.status(409).json({ error: "A user with that email already exists" }); return; }
  const [u] = await db
    .insert(usersTable)
    .values({ email, firstName: firstName ?? null, lastName: lastName ?? null, role: "funder", status: "invited" })
    .returning();
  await logAudit(req, "funder.create", "user", u.id, { email });
  res.status(201).json({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, status: u.status, scopeCount: 0 });
});

// GET /funders/:id/scopes — a funder's assigned organisations.
router.get("/funders/:id/scopes", requireAuth, requireSuperAdmin, async (req, res) => {
  const scopes = await db.select().from(funderScopesTable).where(eq(funderScopesTable.funderId, req.params.id));
  const orgIds = [...new Set(scopes.map((s) => s.organisationId))];
  const orgs = orgIds.length ? await db.select().from(organisationsTable).where(inArray(organisationsTable.id, orgIds)) : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  res.json(scopes.map((s) => ({
    id: s.id,
    organisationId: s.organisationId,
    organisationName: orgName.get(s.organisationId) ?? null,
    courseId: s.courseId,
    label: s.label,
  })));
});

// POST /funders/:id/scopes — grant a funder visibility into an organisation.
router.post("/funders/:id/scopes", requireAuth, requireSuperAdmin, async (req, res) => {
  const { organisationId, courseId, label } = req.body;
  if (!organisationId) { res.status(400).json({ error: "organisationId is required" }); return; }
  const [s] = await db
    .insert(funderScopesTable)
    .values({ funderId: req.params.id, organisationId, courseId: courseId ?? null, label: label ?? null })
    .returning();
  await logAudit(req, "funder.scope_grant", "funder_scope", s.id, { funderId: req.params.id, organisationId });
  res.status(201).json(s);
});

// DELETE /funder-scopes/:scopeId — revoke a scope.
router.delete("/funder-scopes/:scopeId", requireAuth, requireSuperAdmin, async (req, res) => {
  await db.delete(funderScopesTable).where(eq(funderScopesTable.id, req.params.scopeId));
  await logAudit(req, "funder.scope_revoke", "funder_scope", req.params.scopeId);
  res.status(204).send();
});

// ── Funding agreements (real, per partner) ───────────────────────────────────
// The Partner Funders Hub's real backing store. Super admin manages any partner; a partner_admin
// manages their own. Endpoints self-create the table so no separate migration step is needed.

async function ensureFundingTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS funding_agreements (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      funder_name text NOT NULL,
      funder_type text NOT NULL DEFAULT 'SETA',
      org_id text,
      org_name text,
      seats_funded integer NOT NULL DEFAULT 0,
      value integer NOT NULL DEFAULT 0,
      start_date text,
      expiry text,
      status text NOT NULL DEFAULT 'active',
      conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

function canManagePartner(user: { role: string; partnerId?: string | null }, partnerId: string) {
  return isSuperAdmin(user.role) || (isFacilitator(user.role) && user.partnerId === partnerId);
}

const cleanConditions = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim()) : [];

// GET /partners/:partnerId/funding — list a partner's funding agreements.
router.get("/partners/:partnerId/funding", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db
      .select()
      .from(fundingAgreementsTable)
      .where(eq(fundingAgreementsTable.partnerId, partnerId))
      .orderBy(desc(fundingAgreementsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]); // table not created yet
  }
});

// POST /partners/:partnerId/funding — create an agreement.
router.post("/partners/:partnerId/funding", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (!canManagePartner(user, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  if (!b.funderName || !String(b.funderName).trim()) { res.status(400).json({ error: "A funder name is required." }); return; }
  await ensureFundingTable();
  const [row] = await db
    .insert(fundingAgreementsTable)
    .values({
      partnerId,
      funderName: String(b.funderName).trim(),
      funderType: b.funderType ? String(b.funderType) : "SETA",
      orgId: b.orgId ? String(b.orgId) : null,
      orgName: b.orgName ? String(b.orgName) : null,
      seatsFunded: Number.isFinite(+b.seatsFunded) ? Math.max(0, Math.trunc(+b.seatsFunded)) : 0,
      value: Number.isFinite(+b.value) ? Math.max(0, Math.trunc(+b.value)) : 0,
      startDate: b.startDate ? String(b.startDate) : null,
      expiry: b.expiry ? String(b.expiry) : null,
      status: b.status ? String(b.status) : "active",
      conditions: cleanConditions(b.conditions),
      createdBy: user.id,
    })
    .returning();
  await logAudit(req, "funding.create", "funding_agreement", row.id, { funder: row.funderName, value: row.value });
  res.status(201).json(row);
});

// PATCH /partners/:partnerId/funding/:id — edit an agreement.
router.patch("/partners/:partnerId/funding/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const b = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (b.funderName !== undefined) patch.funderName = String(b.funderName).trim();
  if (b.funderType !== undefined) patch.funderType = String(b.funderType);
  if (b.orgId !== undefined) patch.orgId = b.orgId ? String(b.orgId) : null;
  if (b.orgName !== undefined) patch.orgName = b.orgName ? String(b.orgName) : null;
  if (b.seatsFunded !== undefined) patch.seatsFunded = Math.max(0, Math.trunc(+b.seatsFunded) || 0);
  if (b.value !== undefined) patch.value = Math.max(0, Math.trunc(+b.value) || 0);
  if (b.startDate !== undefined) patch.startDate = b.startDate ? String(b.startDate) : null;
  if (b.expiry !== undefined) patch.expiry = b.expiry ? String(b.expiry) : null;
  if (b.status !== undefined) patch.status = String(b.status);
  if (b.conditions !== undefined) patch.conditions = cleanConditions(b.conditions);
  const [row] = await db
    .update(fundingAgreementsTable)
    .set(patch)
    .where(and(eq(fundingAgreementsTable.id, id), eq(fundingAgreementsTable.partnerId, partnerId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// DELETE /partners/:partnerId/funding/:id — remove an agreement.
router.delete("/partners/:partnerId/funding/:id", requireAuth, async (req, res) => {
  const { partnerId, id } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(fundingAgreementsTable).where(and(eq(fundingAgreementsTable.id, id), eq(fundingAgreementsTable.partnerId, partnerId)));
  await logAudit(req, "funding.delete", "funding_agreement", id);
  res.status(204).send();
});

// ── Funded-seat assignments (learners occupying a funding agreement's seats) ──
async function ensureSeatsTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS funded_seat_assignments (
      id text PRIMARY KEY,
      partner_id text NOT NULL,
      agreement_id text NOT NULL,
      learner_id text NOT NULL,
      learner_name text,
      assigned_by text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
}

// GET /partners/:partnerId/funding-usage — { agreementId: usedSeatCount } for the partner.
router.get("/partners/:partnerId/funding-usage", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select({ agreementId: fundedSeatAssignmentsTable.agreementId })
      .from(fundedSeatAssignmentsTable).where(eq(fundedSeatAssignmentsTable.partnerId, partnerId));
    const used: Record<string, number> = {};
    for (const r of rows) used[r.agreementId] = (used[r.agreementId] ?? 0) + 1;
    res.json({ used });
  } catch {
    res.json({ used: {} });
  }
});

// GET /partners/:partnerId/funding/:agreementId/seats — learners assigned to an agreement.
router.get("/partners/:partnerId/funding/:agreementId/seats", requireAuth, async (req, res) => {
  const { partnerId, agreementId } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  try {
    const rows = await db.select().from(fundedSeatAssignmentsTable)
      .where(and(eq(fundedSeatAssignmentsTable.partnerId, partnerId), eq(fundedSeatAssignmentsTable.agreementId, agreementId)))
      .orderBy(desc(fundedSeatAssignmentsTable.createdAt));
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// POST /partners/:partnerId/funding/:agreementId/seats — assign a learner (capacity + dup guarded).
router.post("/partners/:partnerId/funding/:agreementId/seats", requireAuth, async (req, res) => {
  const { partnerId, agreementId } = req.params;
  const user = req.dbUser!;
  if (!canManagePartner(user, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  const learnerId = req.body?.learnerId ? String(req.body.learnerId) : "";
  if (!learnerId) { res.status(400).json({ error: "A learnerId is required." }); return; }
  await ensureSeatsTable();
  const agreement = await db.query.fundingAgreementsTable.findFirst({ where: eq(fundingAgreementsTable.id, agreementId) });
  if (!agreement || agreement.partnerId !== partnerId) { res.status(404).json({ error: "Agreement not found." }); return; }
  const existing = await db.select().from(fundedSeatAssignmentsTable)
    .where(and(eq(fundedSeatAssignmentsTable.partnerId, partnerId), eq(fundedSeatAssignmentsTable.agreementId, agreementId)));
  if (existing.some((r) => r.learnerId === learnerId)) { res.status(409).json({ error: "That learner already occupies a seat on this agreement." }); return; }
  if (existing.length >= (agreement.seatsFunded || 0)) { res.status(409).json({ error: "No funded seats left on this agreement." }); return; }
  const [row] = await db.insert(fundedSeatAssignmentsTable).values({
    partnerId, agreementId, learnerId,
    learnerName: req.body?.learnerName ? String(req.body.learnerName) : null,
    assignedBy: user.id,
  }).returning();
  await logAudit(req, "funding.seat_assign", "funded_seat", row.id, { agreementId, learnerId });
  res.status(201).json(row);
});

// DELETE /partners/:partnerId/funding/:agreementId/seats/:id — unassign.
router.delete("/partners/:partnerId/funding/:agreementId/seats/:id", requireAuth, async (req, res) => {
  const { partnerId, agreementId, id } = req.params;
  if (!canManagePartner(req.dbUser!, partnerId)) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(fundedSeatAssignmentsTable).where(and(
    eq(fundedSeatAssignmentsTable.id, id),
    eq(fundedSeatAssignmentsTable.partnerId, partnerId),
    eq(fundedSeatAssignmentsTable.agreementId, agreementId),
  ));
  res.status(204).send();
});

export default router;
