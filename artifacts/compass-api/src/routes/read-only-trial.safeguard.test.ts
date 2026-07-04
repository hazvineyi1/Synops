import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that an expired-trial tenant is read-only: it may still view
 * data and reach billing (to upgrade), but every create/edit/delete is refused
 * with 402 { error: "read_only" }.
 *
 * The guard (blockWritesWhenReadOnly) is mounted inside /compass AFTER the
 * billing router, so billing stays reachable while everything else is frozen.
 * The top-level storage upload-url mint lives outside /compass and carries its
 * own copy of the same check, which is exercised here too. A fresh (non-expired)
 * trial org is the control: its writes still succeed, proving the guard keys off
 * trial expiry and not merely on the trial tier.
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run). Users are inserted with the
 * emailVerifiedAt column default (verified), so login is not blocked.
 */

const PASSWORD = "ReadOnly!2345";
const SUFFIX = `ro-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

type Agent = ReturnType<typeof request.agent>;

let expiredOrgId: number;
let freshOrgId: number;
let expiredClientId: number;
let freshClientId: number;
const createdUserIds: number[] = [];

let agentExpired: Agent;
let agentFresh: Agent;

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
  dbMod = await import("@workspace/compass-db");
  const { hashPassword } = await import("../lib/auth");
  app = (await import("../app")).default;

  const { db, organizationsTable, clientsTable, usersTable } = dbMod;
  const passwordHash = await hashPassword(PASSWORD);

  // Expired trial: trialing status but trialEndsAt in the past => read-only.
  const [expiredOrg] = await db
    .insert(organizationsTable)
    .values({
      name: "Expired Trial School",
      slug: `test-${SUFFIX}-expired`,
      type: "school",
      planTier: "trial",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    })
    .returning();
  expiredOrgId = expiredOrg.id;

  // Fresh trial (control): trialEndsAt in the future => writable.
  const [freshOrg] = await db
    .insert(organizationsTable)
    .values({
      name: "Fresh Trial School",
      slug: `test-${SUFFIX}-fresh`,
      type: "school",
      planTier: "trial",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning();
  freshOrgId = freshOrg.id;

  const accounts = [
    {
      email: `expired-${SUFFIX}@ro.test`,
      name: "Expired Trial Admin",
      role: "school_admin",
      organizationId: expiredOrg.id,
    },
    {
      email: `fresh-${SUFFIX}@ro.test`,
      name: "Fresh Trial Admin",
      role: "school_admin",
      organizationId: freshOrg.id,
    },
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

  const [expiredClient] = await db
    .insert(clientsTable)
    .values({ organizationId: expiredOrg.id, name: "Expired Existing Client" })
    .returning();
  expiredClientId = expiredClient.id;

  const [freshClient] = await db
    .insert(clientsTable)
    .values({ organizationId: freshOrg.id, name: "Fresh Existing Client" })
    .returning();
  freshClientId = freshClient.id;

  agentExpired = await login(accounts[0].email);
  agentFresh = await login(accounts[1].email);
}, 30000);

afterAll(async () => {
  const { db, organizationsTable, clientsTable, usersTable } = dbMod;
  const clientIds = [expiredClientId, freshClientId].filter(
    (id): id is number => typeof id === "number",
  );
  const orgIds = [expiredOrgId, freshOrgId].filter((id): id is number => typeof id === "number");
  const steps: Array<[string, () => Promise<unknown>]> = [
    [
      "clients",
      () =>
        clientIds.length > 0
          ? db.delete(clientsTable).where(inArray(clientsTable.organizationId, orgIds))
          : Promise.resolve(),
    ],
    [
      "users",
      () =>
        createdUserIds.length > 0
          ? db.delete(usersTable).where(inArray(usersTable.id, createdUserIds))
          : Promise.resolve(),
    ],
    [
      "organizations",
      () =>
        orgIds.length > 0
          ? db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds))
          : Promise.resolve(),
    ],
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
    console.warn(
      `[read-only-trial.safeguard.test] fixture cleanup left rows behind: ${failures.join("; ")}`,
    );
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Compass read-only enforcement for expired trials", () => {
  it("refuses a write (POST /compass/clients) with 402 read_only", async () => {
    const res = await agentExpired
      .post("/api/compass/clients")
      .send({ name: "Should Not Be Created" });
    expect(res.status, JSON.stringify(res.body)).toBe(402);
    expect(res.body.error).toBe("read_only");
  });

  it("allows reads (GET /compass/clients) with 200", async () => {
    const res = await agentExpired.get("/api/compass/clients");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("keeps billing reachable (read-only guard does not block it)", async () => {
    // Mounted before the guard, so it must NOT come back as read_only.
    const sub = await agentExpired.get("/api/compass/billing/subscription");
    expect(sub.status, JSON.stringify(sub.body)).toBe(200);

    // Checkout is a write but lives above the guard so the tenant can upgrade.
    // It may fail for Stripe-config reasons in CI, but it must never be the
    // read_only refusal: that would trap the tenant with no way to pay.
    const checkout = await agentExpired
      .post("/api/compass/billing/checkout")
      .send({ tier: "starter", interval: "month" });
    expect(checkout.body?.error).not.toBe("read_only");
  });

  it("refuses a top-level storage upload-url mint with 402 read_only", async () => {
    const res = await agentExpired
      .post("/api/storage/uploads/request-url")
      .send({ fileName: "note.webm", contentType: "audio/webm" });
    expect(res.status, JSON.stringify(res.body)).toBe(402);
    expect(res.body.error).toBe("read_only");
  });

  it("still allows writes for a fresh (non-expired) trial (control)", async () => {
    const res = await agentFresh
      .post("/api/compass/clients")
      .send({ name: "Fresh Trial New Client" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.name).toBe("Fresh Trial New Client");
  });
});
