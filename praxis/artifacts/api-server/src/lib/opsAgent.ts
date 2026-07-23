import { and, eq, gte, inArray, count } from "drizzle-orm";
import { db, opsAnomaliesTable, loginEventsTable } from "@workspace/db";
import { healthSnapshot, type HealthSnapshot } from "./healthMetrics";
import { logger } from "./logger";

/**
 * Always-on ops agent. On an interval it gathers platform signals, evaluates them against a set
 * of deterministic rules, and maintains an anomaly feed: a new problem is flagged, a recurring one
 * has its last_seen_at bumped (never duplicated), and a cleared one is auto-resolved. Deterministic
 * on purpose - ops alerting has to be trustworthy and reproducible, not a model's guess.
 */

export interface DetectedAnomaly {
  kind: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface OpsSignals {
  health: HealthSnapshot;
  /** Failed login attempts in the recent window (bad password / unknown email / suspended). */
  recentLoginFailures: number;
  recentLoginTotal: number;
}

// Tunable thresholds. Kept conservative so a flag means something.
export const OPS_THRESHOLDS = {
  errorRatePct: 10, // 5xx share of the last minute
  errorRateMinRequests: 20, // ignore tiny samples
  dbLatencyWarnMs: 1000,
  dbLatencyCritMs: 3000,
  loginFailureMin: 15, // absolute failures before we care
  loginFailurePct: 60, // and what share of attempts they are
};

/**
 * Pure rules engine: given the signals, return the anomalies that are currently firing. No DB, no
 * clock - fully unit-testable. Callers reconcile the result against the stored feed.
 */
export function evaluateAnomalies(s: OpsSignals): DetectedAnomaly[] {
  const out: DetectedAnomaly[] = [];
  const h = s.health;

  if (h.db === "down") {
    out.push({ kind: "db_down", severity: "critical", title: "Database unreachable", detail: "The health check could not reach the database." });
  } else if (h.dbLatencyMs !== null && h.dbLatencyMs >= OPS_THRESHOLDS.dbLatencyCritMs) {
    out.push({ kind: "db_latency", severity: "critical", title: "Database very slow", detail: `Query latency ${h.dbLatencyMs} ms.`, metadata: { latencyMs: h.dbLatencyMs } });
  } else if (h.dbLatencyMs !== null && h.dbLatencyMs >= OPS_THRESHOLDS.dbLatencyWarnMs) {
    out.push({ kind: "db_latency", severity: "warning", title: "Database latency elevated", detail: `Query latency ${h.dbLatencyMs} ms.`, metadata: { latencyMs: h.dbLatencyMs } });
  }

  if (h.window.requests >= OPS_THRESHOLDS.errorRateMinRequests && h.window.errorRatePct >= OPS_THRESHOLDS.errorRatePct) {
    out.push({
      kind: "error_rate",
      severity: h.window.errorRatePct >= 25 ? "critical" : "warning",
      title: "Elevated server error rate",
      detail: `${h.window.errorRatePct}% of the last ${h.window.requests} requests returned 5xx.`,
      metadata: { errorRatePct: h.window.errorRatePct, requests: h.window.requests },
    });
  }

  if (
    s.recentLoginFailures >= OPS_THRESHOLDS.loginFailureMin &&
    s.recentLoginTotal > 0 &&
    (s.recentLoginFailures / s.recentLoginTotal) * 100 >= OPS_THRESHOLDS.loginFailurePct
  ) {
    out.push({
      kind: "login_failure_spike",
      severity: "warning",
      title: "Login-failure spike",
      detail: `${s.recentLoginFailures} of ${s.recentLoginTotal} recent sign-in attempts failed - possible credential stuffing or an auth outage.`,
      metadata: { failures: s.recentLoginFailures, total: s.recentLoginTotal },
    });
  }

  return out;
}

const FAILURE_OUTCOMES = ["bad_password", "unknown_email", "suspended"] as const;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Gather the live signals the rules need. Never throws; DB errors degrade to zero-failure counts. */
export async function gatherSignals(): Promise<OpsSignals> {
  const health = await healthSnapshot();
  let recentLoginFailures = 0;
  let recentLoginTotal = 0;
  try {
    const since = new Date(Date.now() - LOGIN_WINDOW_MS);
    const [failRow] = await db
      .select({ n: count() })
      .from(loginEventsTable)
      .where(and(gte(loginEventsTable.createdAt, since), inArray(loginEventsTable.outcome, [...FAILURE_OUTCOMES])));
    const [totalRow] = await db.select({ n: count() }).from(loginEventsTable).where(gte(loginEventsTable.createdAt, since));
    recentLoginFailures = Number(failRow?.n ?? 0);
    recentLoginTotal = Number(totalRow?.n ?? 0);
  } catch {
    /* leave zero */
  }
  return { health, recentLoginFailures, recentLoginTotal };
}

/**
 * One scan pass: evaluate the rules and reconcile against the stored feed. Returns the set of
 * currently-firing anomalies. Never throws.
 */
export async function runOpsScan(): Promise<DetectedAnomaly[]> {
  try {
    const signals = await gatherSignals();
    const firing = evaluateAnomalies(signals);
    const firingKinds = new Set(firing.map((a) => a.kind));
    const now = new Date();

    const active = await db.select().from(opsAnomaliesTable).where(eq(opsAnomaliesTable.status, "active"));
    const activeByKind = new Map(active.map((a) => [a.kind, a]));

    for (const a of firing) {
      const existing = activeByKind.get(a.kind);
      if (existing) {
        await db.update(opsAnomaliesTable)
          .set({ lastSeenAt: now, severity: a.severity, title: a.title, detail: a.detail, metadata: a.metadata ?? null })
          .where(eq(opsAnomaliesTable.id, existing.id));
      } else {
        await db.insert(opsAnomaliesTable).values({
          kind: a.kind, severity: a.severity, title: a.title, detail: a.detail, metadata: a.metadata ?? null,
          status: "active", firstSeenAt: now, lastSeenAt: now,
        });
      }
    }
    // Auto-resolve anything that is no longer firing.
    const stale = active.filter((a) => !firingKinds.has(a.kind));
    if (stale.length) {
      await db.update(opsAnomaliesTable)
        .set({ status: "resolved", resolvedAt: now })
        .where(inArray(opsAnomaliesTable.id, stale.map((a) => a.id)));
    }
    return firing;
  } catch (err) {
    logger.warn({ err }, "ops scan failed");
    return [];
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the always-on scan loop. Idempotent; the interval is unref'd so it never holds the process. */
export function startOpsAgent(intervalMs = 60_000): void {
  if (timer) return;
  void runOpsScan(); // one immediate pass on boot
  timer = setInterval(() => void runOpsScan(), intervalMs);
  timer.unref?.();
}
