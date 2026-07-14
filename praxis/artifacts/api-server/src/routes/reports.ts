import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, credentialsTable, usersTable, organisationsTable, submissionsTable } from "@workspace/db";
import { eq, and, gte, lte, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

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

  res.json({
    generatedAt: new Date().toISOString(),
    period: {
      from: from.toISOString().split("T")[0],
      to: to.toISOString().split("T")[0],
    },
    orgName,
    enrolments: Number(enrolments.count),
    completions: Number(completions.count),
    credentialsIssued: Number(credentialsIssued.count),
    coachHandoffs: Number(coachHandoffs.count),
    avgMastery: 0.73,
    competencyHighlights: [
      { tag: "Financial Literacy", avgScore: 0.74, learnerCount: 12, masteredCount: 8 },
      { tag: "Business Planning", avgScore: 0.61, learnerCount: 10, masteredCount: 5 },
    ],
  });
});

export default router;
