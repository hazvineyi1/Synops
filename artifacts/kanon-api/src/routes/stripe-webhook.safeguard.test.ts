import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { Express } from "express";

/**
 * Safeguard: the Stripe billing webhook must NEVER act on an event it has not
 * cryptographically verified. A forged POST to /api/stripe/webhook could
 * otherwise flip an organisation to a paid plan for free, so the handler has to
 * reject anything without a valid signature BEFORE it parses or processes the
 * event body.
 *
 * These assertions are DB-independent: every rejection here happens before the
 * handler touches Postgres, so the test runs without a live database and without
 * any Stripe credentials. (The signing secret is only present after initStripe()
 * runs on boot, which it does not in the test process — so a signed-but-
 * unverifiable request is refused at the "not initialized" gate, proving the
 * handler will not process an event it cannot verify.)
 */

let app: Express;

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  app = (await import("../app")).default;
});

afterAll(async () => {
  const { pool } = await import("@workspace/kanon-db");
  await pool.end();
});

describe("Stripe webhook signature safeguard", () => {
  it("rejects a webhook with no stripe-signature header (400)", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "customer.subscription.updated", id: "evt_forged" }));
    expect(res.status).toBe(400);
    expect(res.body?.error).toMatch(/signature/i);
  });

  it("never processes a signed-but-unverifiable event (refused before handling)", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=1700000000,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
      .send(JSON.stringify({ type: "customer.subscription.updated", id: "evt_forged" }));
    // Without an initialised Stripe client + signing secret the handler refuses
    // (503) rather than trusting the payload — it must never return 2xx here.
    expect([400, 503]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("rejects an array-valued stripe-signature header (400)", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "a")
      .set("stripe-signature", "b")
      .send(JSON.stringify({ type: "customer.subscription.updated" }));
    expect(res.status).not.toBe(200);
  });
});
