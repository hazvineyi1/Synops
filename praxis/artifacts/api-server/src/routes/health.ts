import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { maintenanceEnabled } from "../middlewares/maintenanceMode";
import { healthSnapshot } from "../lib/healthMetrics";

const router = Router();

// Captured once at module load = process start. Powers uptime + "when did this instance boot".
const STARTED_AT = new Date();

// Liveness: the process is up and serving. Does NOT touch the DB — a liveness probe should not
// fail (and trigger a restart) just because the database is briefly unreachable.
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// Build/version identity. No DB, public, cheap. Answers "which build is actually live right now?" —
// the first question during incident triage and the check that confirms a rollback took (Runbook 3).
// Values come from Railway's injected deploy env vars, with safe fallbacks in local dev.
router.get("/version", (_req, res) => {
  res.json({
    service: "praxis-api",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "unknown",
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    // Which region + replica is serving this request. Prerequisite for
    // multi-region operations: when traffic is split or failed over across
    // regions, the response and its log line must say which instance answered.
    region: process.env.RAILWAY_REPLICA_REGION ?? process.env.REGION ?? null,
    instanceId: process.env.RAILWAY_REPLICA_ID ?? process.env.HOSTNAME ?? null,
    env: process.env.NODE_ENV ?? "development",
    node: process.version,
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    // Read-only maintenance window in effect (drives the SPA banner).
    maintenance: maintenanceEnabled(),
  });
});

// Readiness: can this instance actually serve requests that need the database? Railway / uptime
// monitors should gate traffic on THIS, not /healthz. Pings the DB with a bounded timeout so a
// hung connection returns 503 quickly instead of hanging the probe.
router.get("/readyz", async (_req, res) => {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_r, reject) => setTimeout(() => reject(new Error("db ping timeout")), 3000)),
    ]);
    res.json({ status: "ready", db: "up" });
  } catch (err) {
    res.status(503).json({ status: "not-ready", db: "down", detail: err instanceof Error ? err.message : String(err) });
  }
});

// Public status summary for the status page. No auth, no sensitive detail -
// just overall health, whether the database is reachable, and uptime.
router.get("/status", async (_req, res) => {
  const snap = await healthSnapshot();
  res.json({
    status: snap.status,
    db: snap.db,
    uptimeSeconds: snap.uptimeSeconds,
    maintenance: maintenanceEnabled(),
  });
});

export default router;
