import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  credentialsTable,
  funderScopesTable,
  organisationsTable,
} from "@workspace/db";
import { eq, and, inArray, count } from "drizzle-orm";
import { requireAuth, requireSuperAdmin } from "../middlewares/requireAuth";
import { isSuperAdmin, isFunder } from "../lib/roles";
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

export default router;
