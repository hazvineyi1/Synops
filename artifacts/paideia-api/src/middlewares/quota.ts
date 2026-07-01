import { type Request, type Response, type NextFunction } from "express";
import {
  db,
  lessonPlansTable,
  worksheetsTable,
  quizzesTable,
  parentDraftsTable,
  FREE_MONTHLY_GENERATIONS,
} from "@workspace/paideia-db";
import { and, eq, gte, sql } from "drizzle-orm";

function isSubscribed(status: string | undefined, periodEnd: Date | null | undefined): boolean {
  if (status !== "active" && status !== "trialing") return false;
  if (!periodEnd) return true;
  return periodEnd.getTime() > Date.now();
}

function isAdminEmail(email: string): boolean {
  const list = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function countMonthlyGenerations(teacherId: string): Promise<number> {
  const since = monthStart();
  const tables = [lessonPlansTable, worksheetsTable, quizzesTable, parentDraftsTable] as const;
  const results = await Promise.all(
    tables.map((t) =>
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(t)
        .where(and(eq(t.teacherId, teacherId), gte(t.createdAt, since))),
    ),
  );
  return results.reduce((sum, r) => sum + (r[0]?.c ?? 0), 0);
}

export async function getUsage(teacherId: string, subscriptionStatus: string, periodEnd: Date | null, email?: string) {
  const subscribed = isSubscribed(subscriptionStatus, periodEnd) || (email ? isAdminEmail(email) : false);
  const used = subscribed ? 0 : await countMonthlyGenerations(teacherId);
  return {
    subscribed,
    used,
    limit: FREE_MONTHLY_GENERATIONS,
    remaining: subscribed ? null : Math.max(0, FREE_MONTHLY_GENERATIONS - used),
    subscriptionStatus,
    periodEnd: periodEnd ? periodEnd.toISOString() : null,
  };
}

export function requireQuota(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const teacher = req.teacher!;
  if (isSubscribed(teacher.subscriptionStatus, teacher.subscriptionCurrentPeriodEnd) || isAdminEmail(teacher.email)) {
    next();
    return;
  }
  void countMonthlyGenerations(teacher.id).then((used) => {
    if (used >= FREE_MONTHLY_GENERATIONS) {
      res.status(402).json({
        error: "You have used all 10 free generations this month. Upgrade to keep building.",
        code: "quota_exceeded",
        used,
        limit: FREE_MONTHLY_GENERATIONS,
      });
      return;
    }
    next();
  }).catch((err: unknown) => {
    req.log?.error({ err }, "quota check failed");
    res.status(500).json({ error: "Could not check usage" });
  });
}
