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
import { requireAuth } from "../middlewares/requireAuth";
import { isSuperAdmin, isFunder } from "../lib/roles";
import { funderOrgIds } from "../lib/scope";

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

    const org = await db.query.organisationsTable.findFirst({ where: eq(organisationsTable.id, orgId) });
    organisations.push({
      organisationId: orgId,
      organisationName: org?.name ?? null,
      learners: learnerIds.length,
      completions,
      credentials,
      // Coaching-hour totals arrive with the blended-delivery tracking phase (§10.3).
      coachingHours: null as number | null,
    });
    tLearners += learnerIds.length;
    tCompletions += completions;
    tCredentials += credentials;
  }

  res.json({
    organisations,
    totals: { learners: tLearners, completions: tCompletions, credentials: tCredentials },
  });
});

export default router;
