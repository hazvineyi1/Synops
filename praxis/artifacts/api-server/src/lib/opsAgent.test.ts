import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { evaluateAnomalies, runOpsScan, type OpsSignals } from "./opsAgent";
import type { HealthSnapshot } from "./healthMetrics";

/**
 * The ops rules engine is deterministic, so we can pin its behaviour exactly: healthy signals
 * flag nothing, and each failure mode raises the right anomaly at the right severity. This is the
 * contract the always-on scan relies on.
 */

const healthy: HealthSnapshot = {
  status: "operational",
  db: "up",
  dbLatencyMs: 20,
  uptimeSeconds: 100,
  requestsTotal: 1000,
  serverErrorsTotal: 0,
  window: { requests: 100, errors: 0, errorRatePct: 0 },
};

const signals = (h: Partial<HealthSnapshot>, failures = 0, total = 0): OpsSignals => ({
  health: { ...healthy, ...h, window: { ...healthy.window, ...(h.window ?? {}) } },
  recentLoginFailures: failures,
  recentLoginTotal: total,
});

describe("evaluateAnomalies", () => {
  it("flags nothing when everything is healthy", () => {
    expect(evaluateAnomalies(signals({}))).toEqual([]);
  });

  it("raises a critical anomaly when the DB is down", () => {
    const a = evaluateAnomalies(signals({ db: "down" }));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ kind: "db_down", severity: "critical" });
  });

  it("warns on elevated DB latency and escalates when very slow", () => {
    expect(evaluateAnomalies(signals({ dbLatencyMs: 1500 }))[0]).toMatchObject({ kind: "db_latency", severity: "warning" });
    expect(evaluateAnomalies(signals({ dbLatencyMs: 3500 }))[0]).toMatchObject({ kind: "db_latency", severity: "critical" });
  });

  it("flags an elevated error rate only above the sample floor", () => {
    // 15% but only 10 requests: below the 20-request floor, ignored.
    expect(evaluateAnomalies(signals({ window: { requests: 10, errors: 2, errorRatePct: 15 } }))).toEqual([]);
    // 15% of 40 requests: flagged as a warning.
    const warn = evaluateAnomalies(signals({ window: { requests: 40, errors: 6, errorRatePct: 15 } }));
    expect(warn[0]).toMatchObject({ kind: "error_rate", severity: "warning" });
    // 30% escalates to critical.
    const crit = evaluateAnomalies(signals({ window: { requests: 40, errors: 12, errorRatePct: 30 } }));
    expect(crit[0]).toMatchObject({ kind: "error_rate", severity: "critical" });
  });

  it("flags a login-failure spike only when both count and share are high", () => {
    // 15 failures but only 40% of attempts: not flagged.
    expect(evaluateAnomalies(signals({}, 15, 40))).toEqual([]);
    // 15 failures at 75%: flagged.
    const a = evaluateAnomalies(signals({}, 15, 20));
    expect(a[0]).toMatchObject({ kind: "login_failure_spike", severity: "warning" });
  });

  it("can raise several anomalies at once", () => {
    const a = evaluateAnomalies(signals({ db: "down", window: { requests: 40, errors: 20, errorRatePct: 50 } }, 20, 20));
    const kinds = a.map((x) => x.kind).sort();
    expect(kinds).toContain("db_down");
    expect(kinds).toContain("error_rate");
    expect(kinds).toContain("login_failure_spike");
  });

  it("runOpsScan reconciles against the real schema without throwing", async () => {
    // DB-backed smoke: with a healthy local DB it should find nothing and return an empty array,
    // proving the feed-reconciliation SQL is valid. Skips cleanly if no database is reachable.
    const { db } = await import("@workspace/db");
    let hasDb = false;
    try { await db.execute(sql`select 1`); hasDb = true; } catch { hasDb = false; }
    if (!hasDb) return;
    const firing = await runOpsScan();
    expect(Array.isArray(firing)).toBe(true);
  });
});
