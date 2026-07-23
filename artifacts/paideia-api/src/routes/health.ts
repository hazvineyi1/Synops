import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/paideia-db";
import { HealthCheckResponse } from "@workspace/paideia-api-zod";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

// Captured once at module load = process start. Powers uptime + "when did this instance boot".
const STARTED_AT = new Date();

// Liveness: the process is up and can answer. Cheap, no dependencies. Use this
// as the container health check so a transient DB blip doesn't kill the pod.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Build/version identity. No DB, public, cheap. Answers "which build is actually live right now?" —
// the first question during incident triage and the check that confirms a rollback took.
router.get("/version", (_req, res) => {
  res.json({
    service: "paideia-api",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "unknown",
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
    env: process.env.NODE_ENV ?? "development",
    node: process.version,
    startedAt: STARTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Readiness: the process can actually serve traffic, i.e. the database is
// reachable. Returns 503 when the DB ping fails so a rolling deploy / uptime
// monitor can tell "process started" apart from "actually serving requests".
router.get("/readyz", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ready" });
  } catch (err) {
    logger.error({ err }, "readiness check failed: database unreachable");
    res.status(503).json({ status: "unavailable", reason: "database unreachable" });
  }
});

export default router;
