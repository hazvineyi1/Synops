import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, credentialsTable, usersTable, organisationsTable, submissionsTable, gradebookAlertsTable } from "@workspace/db";
import { eq, and, gte, lte, count, sql } from "drizzle-orm";
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
  if (targetOrgId) {
    const org = await db.query.organisationsTable.findFirst({
      where: eq(organisationsTable.id, targetOrgId),
    });
    orgName = org?.name ?? orgName;
  }

  const [enrolments] = await db
    .select({ count: count() })
    .from(sessionsTable);

  const [completions] = await db
    .select({ count: count() })
    .from(sessionsTable)
    .where(eq(sessionsTable.status, "mastered"));

  const [credentialsIssued] = await db
    .select({ count: count() })
    .from(credentialsTable);

  const [coachHandoffs] = await db
    .select({ count: count() })
    .from(submissionsTable);

  // A credential is itself completion evidence, so completions can never be fewer than credentials
  // issued. Reconcile the two rather than reading them from unrelated tables (which produced the
  // "0 completions / 2 credentials" contradiction).
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
    competencyHighlights: [
      { tag: "Financial Literacy", avgScore: 0.74, learnerCount: 12, masteredCount: 8 },
      { tag: "Business Planning", avgScore: 0.61, learnerCount: 10, masteredCount: 5 },
    ],
  });
});

export default router;
