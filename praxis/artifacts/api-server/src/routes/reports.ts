import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, credentialsTable, usersTable, organisationsTable, submissionsTable, gradebookAlertsTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

/**
 * Average mastery across all learners, computed from the SAME real source the Overview dashboard
 * uses (gradebook_alerts.masteryPct, kept current by the off-track recompute), returned 0..1.
 * Previously both this report and the Overview hardcoded slightly different constants (0.73 vs
 * 0.72), which is why the two screens disagreed. Null when there is nothing to average.
 */
export async function computeAvgMastery(): Promise<number> {
  try {
    const r: any = await db.execute(sql`
      SELECT AVG(mastery_pct)::float AS avg FROM gradebook_alerts WHERE mastery_pct IS NOT NULL`);
    const avg = r.rows?.[0]?.avg;
    if (avg === null || avg === undefined) return 0;
    // masteryPct is stored as a percentage (0..100); normalise to a fraction.
    return Math.round(Number(avg)) / 100;
  } catch {
    return 0;
  }
}

// GET /reports/funder
router.get("/reports/funder", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const { orgId, fromDate, toDate } = req.query;

  const from = fromDate ? new Date(fromDate as string) : (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d; })();
  const to = toDate ? new Date(toDate as string) : new Date();

  const targetOrgId = (orgId as string) ?? user.organisationId;

  let orgName = "All Organisations";
  // Scope the whole report to the target org's learners — it previously counted the WHOLE platform
  // regardless of org, so two funders scoped to different orgs each saw platform-wide totals.
  let learnerIds: string[] | null = null; // null = all (no org filter)
  if (targetOrgId) {
    const org = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, targetOrgId),
    });
    orgName = org?.name ?? orgName;
    const rows = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.organisationId, targetOrgId));
    learnerIds = rows.map((r) => r.id);
  }
  // Helper: count a table's rows for the scoped learners (or all if unscoped).
  const scoped = (col: any) => (learnerIds === null ? undefined : inArray(col, learnerIds.length ? learnerIds : ["__none__"]));

  const [enrolments] = await db.select({ count: count() }).from(sessionsTable).where(scoped(sessionsTable.userId));
  const [completions] = await db.select({ count: count() }).from(sessionsTable)
    .where(learnerIds === null ? eq(sessionsTable.status, "mastered") : and(eq(sessionsTable.status, "mastered"), scoped(sessionsTable.userId)));
  // Only VALID credentials count as issued outcomes (exclude expired/revoked).
  const [credentialsIssued] = await db.select({ count: count() }).from(credentialsTable)
    .where(learnerIds === null ? eq(credentialsTable.status, "valid") : and(eq(credentialsTable.status, "valid"), scoped(credentialsTable.userId)));
  const [coachHandoffs] = await db.select({ count: count() }).from(submissionsTable).where(scoped(submissionsTable.userId));

  // A credential is itself completion evidence, so completions can never be fewer than credentials.
  const completionsCount = Math.max(Number(completions.count), Number(credentialsIssued.count));
  const avgMastery = await computeAvgMastery();

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    },
    orgName,
    enrolments: Number(enrolments.count),
    completions: completionsCount,
    credentialsIssued: Number(credentialsIssued.count),
    coachHandoffs: Number(coachHandoffs.count),
    avgMastery,
    // Competency highlights are omitted until computed from real per-tag mastery — a funder-facing
    // report must never show fabricated figures. (Was hardcoded demo data.)
    competencyHighlights: [] as { tag: string; avgScore: number; learnerCount: number; masteredCount: number }[],
  });
});

export default router;
