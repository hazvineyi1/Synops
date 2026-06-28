import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the authenticated billing view is org-scoped: a logged-in
 * tenant may read ONLY their own organization's subscription, and accounts that
 * are not bound to a concrete org (builders, orgless globals) are refused.
 *
 * The safeguard test (engine.safeguard.test.ts) proves the internal plan/price
 * catalog is never served to an anonymous caller; this test complements it by
 * locking in the authenticated authorization matrix for
 * GET /api/compass/billing/subscription:
 *   - anonymous              -> 401 (the /compass gate requires a session)
 *   - school_admin (own org)  -> 200, own org's plan/pricing view only
 *   - builder                 -> 403 (sits below billing management)
 *   - account with no org      -> 403 (admin/super_admin without a concrete org)
 *   - cross-org data           -> never returned (each school sees only its tier)
 *
 * Two orgs are seeded on DIFFERENT plan tiers so a leak would surface as one
 * school seeing the other's tier/limit. Fixtures are created directly in the DB
 * (the test imports `app`, not the server entrypoint, so the startup seed does
 * not run) under unique slugs/emails and removed afterwards.
 */

const PASSWORD = "Billing!2345";
const SUFFIX = `billing-authz-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/kanon-db");

type Agent = ReturnType<typeof request.agent>;

let orgAId: number;
let orgBId: number;
const createdUserIds: number[] = [];

let agentSchoolA: Agent;
let agentSchoolB: Agent;
let agentBuilder: Agent;
let agentAdminNoOrg: Agent;
let agentSuperNoOrg: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password: PASSWORD });
  expect(
    res.status,
    `login for ${email} failed: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(200);
  return agent;
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  dbMod = await import("@workspace/kanon-db");
  const { hashPassword } = await import("../lib/auth");
  app = (await import("../app")).default;

  const { db, organizationsTable, usersTable } = dbMod;

  // Two paying schools on different tiers. An entitling subscriptionStatus
  // ("active") makes effectiveTier resolve to the purchased planTier, so the
  // view reflects a real paid plan rather than the trial fallback.
  const [orgA] = await db
    .insert(organizationsTable)
    .values({
      name: "Billing School A",
      slug: `test-${SUFFIX}-a`,
      type: "school",
      planTier: "professional",
      subscriptionStatus: "active",
    })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({
      name: "Billing School B",
      slug: `test-${SUFFIX}-b`,
      type: "school",
      planTier: "starter",
      subscriptionStatus: "active",
    })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { email: `school-a-${SUFFIX}@billing.test`, name: "Billing School Admin A", role: "school_admin", organizationId: orgA.id },
    { email: `school-b-${SUFFIX}@billing.test`, name: "Billing School Admin B", role: "school_admin", organizationId: orgB.id },
    // A builder bound to org A: builders sit below billing management and are
    // refused regardless of their org.
    { email: `builder-${SUFFIX}@billing.test`, name: "Billing Builder", role: "builder", organizationId: orgA.id },
    // Global roles with no concrete org: billing is per-org, so these are 403.
    { email: `admin-${SUFFIX}@billing.test`, name: "Billing Admin", role: "admin", organizationId: null },
    { email: `super-${SUFFIX}@billing.test`, name: "Billing Super Admin", role: "super_admin", organizationId: null },
  ] as const;

  for (const acct of accounts) {
    const [row] = await db
      .insert(usersTable)
      .values({
        email: acct.email,
        passwordHash,
        name: acct.name,
        role: acct.role,
        organizationId: acct.organizationId,
        productKey: "compass",
      })
      .returning({ id: usersTable.id });
    createdUserIds.push(row.id);
  }

  agentSchoolA = await login(accounts[0].email);
  agentSchoolB = await login(accounts[1].email);
  agentBuilder = await login(accounts[2].email);
  agentAdminNoOrg = await login(accounts[3].email);
  agentSuperNoOrg = await login(accounts[4].email);
}, 30000);

afterAll(async () => {
  const { db, organizationsTable, usersTable } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["users", () => (createdUserIds.length > 0 ? db.delete(usersTable).where(inArray(usersTable.id, createdUserIds)) : Promise.resolve())],
    ["organizations", () => db.delete(organizationsTable).where(inArray(organizationsTable.id, [orgAId, orgBId]))],
  ];
  const failures: string[] = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (err) {
      failures.push(`${label}: ${(err as Error).message}`);
    }
  }
  if (failures.length > 0) {
    console.warn(`[billing-authz.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

const SUBSCRIPTION_PATH = "/api/compass/billing/subscription";

describe("Compass billing subscription view (authenticated authorization)", () => {
  it("rejects anonymous access with 401", async () => {
    const res = await request(app).get(SUBSCRIPTION_PATH);
    expect(res.status, "an anonymous caller must be rejected by the /compass gate").toBe(401);
  });

  it("returns the actor's OWN org subscription view for a school_admin", async () => {
    const res = await agentSchoolA.get(SUBSCRIPTION_PATH);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // School A is on the professional tier; the view must reflect School A's plan.
    expect(res.body.tier).toBe("professional");
    expect(res.body.planTier).toBe("professional");
    expect(res.body.planLabel).toBe("Professional");
    expect(res.body.activeCourseLimit).toBe(50);
  });

  it("returns a DIFFERENT org's own view for a second school_admin (no cross-org leak)", async () => {
    const res = await agentSchoolB.get(SUBSCRIPTION_PATH);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // School B is on the starter tier and must never see School A's professional plan.
    expect(res.body.tier).toBe("starter");
    expect(res.body.planTier).toBe("starter");
    expect(res.body.planLabel).toBe("Starter");
    expect(res.body.activeCourseLimit).toBe(10);
  });

  it("never returns another organization's plan to a school_admin", async () => {
    const resA = await agentSchoolA.get(SUBSCRIPTION_PATH);
    const resB = await agentSchoolB.get(SUBSCRIPTION_PATH);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // The two paying tenants resolve to distinct plans; if scoping leaked, one
    // would echo the other's tier or course limit.
    expect(resA.body.tier).not.toBe(resB.body.tier);
    expect(resA.body.activeCourseLimit).not.toBe(resB.body.activeCourseLimit);
    expect(resA.body.tier).not.toBe("starter");
    expect(resB.body.tier).not.toBe("professional");
  });

  it("refuses a builder with 403", async () => {
    const res = await agentBuilder.get(SUBSCRIPTION_PATH);
    expect(res.status, "builders cannot manage billing").toBe(403);
  });

  it("refuses an account with no organization with 403 (admin and super_admin)", async () => {
    for (const [label, agent] of [
      ["admin", agentAdminNoOrg],
      ["super_admin", agentSuperNoOrg],
    ] as const) {
      const res = await agent.get(SUBSCRIPTION_PATH);
      expect(res.status, `${label} with no org must be refused billing`).toBe(403);
    }
  });
});
