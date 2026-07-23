import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/**
 * Lightweight self-monitoring: in-memory request/error counters plus an on-demand
 * DB-latency probe. Feeds the admin status dashboard and the public status page.
 * Process-local (resets on restart) and allocation-free on the hot path - it just
 * increments two counters per request.
 */
const startedAt = Date.now();
let totalRequests = 0;
let totalServerErrors = 0; // 5xx

// Rolling one-minute window so the dashboard shows a "recent" error rate, not a
// lifetime average that hides a fresh incident.
const WINDOW_MS = 60_000;
let windowStart = Date.now();
let windowRequests = 0;
let windowErrors = 0;

function rollWindow(): void {
  if (Date.now() - windowStart >= WINDOW_MS) {
    windowStart = Date.now();
    windowRequests = 0;
    windowErrors = 0;
  }
}

/** Record one completed request. Called from the request-logging hook. */
export function recordRequest(statusCode: number): void {
  rollWindow();
  totalRequests++;
  windowRequests++;
  if (statusCode >= 500) {
    totalServerErrors++;
    windowErrors++;
  }
}

/** Measure DB round-trip latency (ms), or null if the DB is unreachable. */
export async function dbLatencyMs(): Promise<number | null> {
  const t = Date.now();
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_r, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
    ]);
    return Date.now() - t;
  } catch {
    return null;
  }
}

export interface HealthSnapshot {
  status: "operational" | "degraded" | "down";
  db: "up" | "down";
  dbLatencyMs: number | null;
  uptimeSeconds: number;
  requestsTotal: number;
  serverErrorsTotal: number;
  window: { requests: number; errors: number; errorRatePct: number };
}

/** Full snapshot for the admin dashboard. */
export async function healthSnapshot(): Promise<HealthSnapshot> {
  rollWindow();
  const latency = await dbLatencyMs();
  const dbUp = latency !== null;
  const errorRatePct = windowRequests ? (windowErrors / windowRequests) * 100 : 0;
  // Degraded if the DB is slow or a meaningful share of recent requests 5xx'd.
  const degraded = (latency !== null && latency > 1000) || (windowRequests >= 20 && errorRatePct >= 5);
  const status: HealthSnapshot["status"] = !dbUp ? "down" : degraded ? "degraded" : "operational";
  return {
    status,
    db: dbUp ? "up" : "down",
    dbLatencyMs: latency,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requestsTotal: totalRequests,
    serverErrorsTotal: totalServerErrors,
    window: { requests: windowRequests, errors: windowErrors, errorRatePct: Math.round(errorRatePct * 10) / 10 },
  };
}
