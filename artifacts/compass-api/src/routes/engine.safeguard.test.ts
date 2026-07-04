import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

/**
 * Safeguard: the Compass curriculum engine must live ONLY under the guarded
 * `/compass` namespace (requireAuth + requireProduct('compass') +
 * loadActorContext applied once, above every mounted module).
 *
 * What this catches: if a curriculum router were mounted ungated at the API root
 * (the old failure mode, where a new path prefix could be left wide open), an
 * anonymous GET would reach the handler and return a 2xx/5xx instead of being
 * rejected. Every curriculum path must instead be rejected before any handler
 * runs: anonymous callers get 401, never a served response. At the root that 401
 * comes from the global `requireAuth` catch-all; under `/compass` it comes from
 * the engine gate.
 *
 * These assertions are intentionally DB-independent: rejected requests never
 * touch the session store or Postgres, so the test runs without a live database.
 * The full per-product / cross-org authorization matrix (other-product -> 403,
 * cross-org -> 404, admin -> all) is verified separately via the live curl
 * matrix in the seed/verify step.
 */

// A representative path from every compass route module. None of these may be
// served to an anonymous caller at the API ROOT; a curriculum route mounted
// ungated here would answer with data instead of 401.
const COMPASS_ROOT_PATHS = [
  "/api/dashboard/summary",
  "/api/clients",
  "/api/projects",
  "/api/courses/1",
  "/api/objectives/1",
  "/api/assessments/1",
  "/api/projects/1/ledger",
  "/api/projects/1/qa",
  "/api/projects/1/qa/report",
  "/api/standards-frameworks",
  "/api/projects/1/intake-progress",
];

// The same routes, now under the guarded namespace. Anonymous access must be
// rejected by the gate (401), never served.
const COMPASS_GUARDED_PATHS = [
  "/api/compass/dashboard/summary",
  "/api/compass/clients",
  "/api/compass/projects",
  "/api/compass/projects/1/qa/report",
  "/api/compass/standards-frameworks",
];

let app: Express;

beforeAll(async () => {
  // app.ts requires SESSION_SECRET at import time; provide a throwaway value so
  // the module loads even if the secret is absent in the test environment.
  process.env.SESSION_SECRET ??= "test-only-secret";
  app = (await import("../app")).default;
});

afterAll(async () => {
  // Release the pg pool created at import time so vitest can exit cleanly.
  const { pool } = await import("@workspace/compass-db");
  await pool.end();
});

describe("Compass engine namespace safeguard", () => {
  it("never serves a curriculum route ungated at the API root", async () => {
    for (const path of COMPASS_ROOT_PATHS) {
      const res = await request(app).get(path);
      expect(
        res.status,
        `${path} was answered with ${res.status} at the API root; an anonymous caller must be rejected (401), never served by an ungated curriculum handler`,
      ).toBe(401);
    }
  });

  it("rejects anonymous access to guarded /compass routes with 401", async () => {
    for (const path of COMPASS_GUARDED_PATHS) {
      const res = await request(app).get(path);
      expect(
        res.status,
        `${path} returned ${res.status} for an anonymous caller; the /compass gate must require authentication`,
      ).toBe(401);
    }
  });
});

/**
 * Safeguard: the internal plan/price catalog must never be served to the public.
 *
 * A public `GET /billing/plans` endpoint used to expose internal plan tiers,
 * prices, and selling points to anonymous visitors. It was removed; billing now
 * lives ONLY inside the guarded /compass namespace. This test locks in that
 * privacy boundary so a future change cannot silently reintroduce an anonymous
 * plan/price feed: an unauthenticated request must be rejected (401/404), never
 * answered with a 200 catalog of plans and prices.
 */
describe("Billing plan/price catalog privacy safeguard", () => {
  const BILLING_PLAN_PATHS = ["/api/billing/plans", "/api/compass/billing/plans"];

  it("never serves a plan/price catalog to an anonymous caller", async () => {
    for (const path of BILLING_PLAN_PATHS) {
      const res = await request(app).get(path);
      expect(
        [401, 404],
        `${path} returned ${res.status} for an anonymous caller; the internal plan/price catalog must never be public (expected 401 or 404)`,
      ).toContain(res.status);
      expect(
        res.status,
        `${path} answered an anonymous caller with a 200; the internal plan/price catalog must never be served publicly`,
      ).not.toBe(200);
    }
  });
});
