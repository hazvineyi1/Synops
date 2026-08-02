import { Router } from "express";
import { buildK12Commendations } from "../lib/k12Commendations";

/**
 * Public, unauthenticated K-12 demo endpoints for the /k12 marketing landing page. Read-only and
 * PII-free by construction (see k12Commendations) — safe to serve without a session.
 */
const router = Router();

// GET /k12/commendations — the standards the Synops Academy demo meets, with mastery evidence,
// grouped by subject. Cached briefly at the edge since it changes only on reseed.
router.get("/k12/commendations", async (_req, res) => {
  try {
    const report = await buildK12Commendations();
    if (!report) { res.status(404).json({ error: "K-12 demo not provisioned" }); return; }
    res.set("Cache-Control", "public, max-age=30");
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to build commendations" });
  }
});

export default router;
