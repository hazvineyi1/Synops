import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the money-moving billing routes stay locked to a tenant's
 * OWN account. Task #44 covered the read-only view (GET /billing/subscription);
 * this complements it with the write/mutation matrix for the three routes that
 * actually start or change a subscription:
 *
 *   POST /api/compass/billing/checkout   (start Stripe Checkout)
 *   POST /api/compass/billing/portal     (open the Stripe billing portal)
 *   POST /api/compass/billing/reconcile  (pull subscription state after checkout)
 *
 * Authorization matrix asserted for each route:
 *   - anonymous               -> 401 (the /compass gate requires a session)
 *   - school_admin (own org)   -> 200, scoped to the actor's OWN org only
 *   - builder                  -> 403 (sits below billing management)
 *   - account with no org       -> 403 (admin/super_admin without a concrete org)
 *   - while impersonating       -> 403 (blockWhileImpersonating, even for an org-
 *                                  bound target that could otherwise bill)
 *
 * Plus the reconcile-specific guarantee: a checkout session whose
 * client_reference_id belongs to ANOTHER org is refused with 404 and never
 * attaches that tenant's subscription to the caller.
 *
 * Two orgs on different tiers are seeded directly in the DB (the test imports
 * `app`, not the server entrypoint, so the startup seed does not run) so a
 * cross-org leak would surface as the wrong org being billed. Stripe is fully
 * mocked so no test ever reaches the live Stripe API.
 */

const stripeMock = vi.hoisted(() => {
  const checkoutSessionsCreate = vi.fn();
  const checkoutSessionsRetrieve = vi.fn();
  const billingPortalCreate = vi.fn();
  const customersCreate = vi.fn();
  const pricesList = vi.fn();
  const subscriptionsRetrieve = vi.fn();
  const client = {
    checkout: {
      sessions: { create: checkoutSessionsCreate, retrieve: checkoutSessionsRetrieve },
    },
    billingPortal: { sessions: { create: billingPortalCreate } },
    customers: { create: customersCreate },
    prices: { list: pricesList },
    subscriptions: { retrieve: subscriptionsRetrieve },
  };
  return {
    client,
    checkoutSessionsCreate,
    checkoutSessionsRetrieve,
    billingPortalCreate,
    customersCreate,
    pricesList,
    subscriptionsRetrieve,
  };
});

vi.mock("../lib/stripeClient", () => ({
  getUncachableStripeClient: vi.fn(async () => stripeMock.client),
  getStripeRuntime: vi.fn(async () => ({
    stripe: stripeMock.client,
    connection: { secretKey: "sk_test_fake", publishableKey: "pk_test_fake", mode: "test" },
  })),
}));

const PASSWORD = "Billing!2345";
const SUFFIX = `billing-mut-authz-${Date.now()}`;

const CUSTOMER_A = `cus_test_${SUFFIX}_a`;
const CUSTOMER_B = `cus_test_${SUFFIX}_b`;

const CHECKOUT_PATH = "/api/compass/billing/checkout";
const PORTAL_PATH = "/api/compass/billing/portal";
const RECONCILE_PATH = "/api/compass/billing/reconcile";

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

type Agent = ReturnType<typeof request.agent>;

let orgAId: number;
let orgBId: number;
let schoolAUserId: number;
const createdUserIds: number[] = [];
const createdImpersonationOps: number[] = [];

let agentSchoolA: Agent;
let agentSchoolB: Agent;
let agentBuilder: Agent;
let agentAdminNoOrg: Agent;
let agentSuperNoOrg: Agent;
// A super admin who has started impersonating school_admin A; every mutation
// must be refused for this session even though the target could otherwise bill.
let agentImpersonating: Agent;

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

  const { db, organizationsTable, usersTable } = dbMod;

  // Two paying schools on different tiers, each already a Stripe customer so the
  // portal route has a customer to open and checkout reuses it.
  const [orgA] = await db
    .insert(organizationsTable)
    .values({
      name: "Billing Mut School A",
      slug: `test-${SUFFIX}-a`,
      type: "school",
      planTier: "professional",
      subscriptionStatus: "active",
      stripeCustomerId: CUSTOMER_A,
    })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({
      name: "Billing Mut School B",
      slug: `test-${SUFFIX}-b`,
      type: "school",
      planTier: "starter",
      subscriptionStatus: "active",
      stripeCustomerId: CUSTOMER_B,
    })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { email: `school-a-${SUFFIX}@billing.test`, name: "Mut School Admin A", role: "school_admin", organizationId: orgA.id },
    { email: `school-b-${SUFFIX}@billing.test`, name: "Mut School Admin B", role: "school_admin", organizationId: orgB.id },
    { email: `builder-${SUFFIX}@billing.test`, name: "Mut Builder", role: "builder", organizationId: orgA.id },
    { email: `admin-${SUFFIX}@billing.test`, name: "Mut Admin", role: "admin", organizationId: null },
    { email: `super-${SUFFIX}@billing.test`, name: "Mut Super Admin", role: "super_admin", organizationId: null },
    // A dedicated super_admin operator used only to drive impersonation, so it
    // does not perturb the orgless-super 403 assertions above.
    { email: `super-op-${SUFFIX}@billing.test`, name: "Mut Super Operator", role: "super_admin", organizationId: null },
  ] as const;

  const idByEmail = new Map<string, number>();
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
    idByEmail.set(acct.email, row.id);
  }
  schoolAUserId = idByEmail.get(accounts[0].email)!;

  agentSchoolA = await login(accounts[0].email);
  agentSchoolB = await login(accounts[1].email);
  agentBuilder = await login(accounts[2].email);
  agentAdminNoOrg = await login(accounts[3].email);
  agentSuperNoOrg = await login(accounts[4].email);

  // Start a real impersonation session: the operator super admin acts as school
  // admin A. The session-swap sets impersonatorUserId, which blockWhileImpersonating
  // keys on. Done via the real endpoint so we exercise the genuine guard path.
  agentImpersonating = await login(accounts[5].email);
  const startRes = await agentImpersonating
    .post("/api/impersonation/start")
    .send({ userId: schoolAUserId });
  expect(
    startRes.status,
    `impersonation start failed: ${startRes.status} ${JSON.stringify(startRes.body)}`,
  ).toBe(200);
}, 30000);

afterAll(async () => {
  const { db, organizationsTable, usersTable, impersonationEventsTable } = dbMod;
  const allUserIds = [...createdUserIds, ...createdImpersonationOps];
  const steps: Array<[string, () => Promise<unknown>]> = [
    [
      "impersonation_events",
      () =>
        allUserIds.length > 0
          ? db
              .delete(impersonationEventsTable)
              .where(inArray(impersonationEventsTable.impersonatorUserId, allUserIds))
          : Promise.resolve(),
    ],
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
    console.warn(`[billing-mutations-authz.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible happy-path defaults; individual tests override as needed.
  stripeMock.pricesList.mockResolvedValue({ data: [{ id: "price_test_default" }] });
  stripeMock.customersCreate.mockResolvedValue({ id: "cus_test_created" });
  stripeMock.checkoutSessionsCreate.mockResolvedValue({ url: "https://stripe.test/checkout/sess_abc" });
  stripeMock.billingPortalCreate.mockResolvedValue({ url: "https://stripe.test/portal/sess_xyz" });
});

describe("POST /compass/billing/checkout (authenticated authorization)", () => {
  const body = { tier: "professional", interval: "month" } as const;

  it("rejects anonymous access with 401", async () => {
    const res = await request(app).post(CHECKOUT_PATH).send(body);
    expect(res.status).toBe(401);
    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("starts checkout for the school_admin's OWN org only", async () => {
    const res = await agentSchoolA.post(CHECKOUT_PATH).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.url).toBe("https://stripe.test/checkout/sess_abc");
    // The billed org is the actor's own org, never client-supplied.
    expect(stripeMock.checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const arg = stripeMock.checkoutSessionsCreate.mock.calls[0][0];
    expect(arg.client_reference_id).toBe(String(orgAId));
    expect(arg.customer).toBe(CUSTOMER_A);
  });

  it("scopes a second school_admin to their OWN, different org (no cross-org bill)", async () => {
    const res = await agentSchoolB.post(CHECKOUT_PATH).send(body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const arg = stripeMock.checkoutSessionsCreate.mock.calls[0][0];
    expect(arg.client_reference_id).toBe(String(orgBId));
    expect(arg.customer).toBe(CUSTOMER_B);
    expect(arg.client_reference_id).not.toBe(String(orgAId));
  });

  it("refuses a builder with 403 and never reaches Stripe", async () => {
    const res = await agentBuilder.post(CHECKOUT_PATH).send(body);
    expect(res.status).toBe(403);
    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses an account with no organization with 403 (admin and super_admin)", async () => {
    for (const [label, agent] of [
      ["admin", agentAdminNoOrg],
      ["super_admin", agentSuperNoOrg],
    ] as const) {
      const res = await agent.post(CHECKOUT_PATH).send(body);
      expect(res.status, `${label} with no org must be refused checkout`).toBe(403);
    }
    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("refuses checkout while impersonating, even an org-bound target", async () => {
    const res = await agentImpersonating.post(CHECKOUT_PATH).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/impersonating/i);
    expect(stripeMock.checkoutSessionsCreate).not.toHaveBeenCalled();
  });
});

describe("POST /compass/billing/portal (authenticated authorization)", () => {
  it("rejects anonymous access with 401", async () => {
    const res = await request(app).post(PORTAL_PATH).send({});
    expect(res.status).toBe(401);
    expect(stripeMock.billingPortalCreate).not.toHaveBeenCalled();
  });

  it("opens the portal for the school_admin's OWN org only", async () => {
    const res = await agentSchoolA.post(PORTAL_PATH).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.url).toBe("https://stripe.test/portal/sess_xyz");
    expect(stripeMock.billingPortalCreate).toHaveBeenCalledTimes(1);
    expect(stripeMock.billingPortalCreate.mock.calls[0][0].customer).toBe(CUSTOMER_A);
  });

  it("scopes a second school_admin to their OWN, different customer", async () => {
    const res = await agentSchoolB.post(PORTAL_PATH).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(stripeMock.billingPortalCreate.mock.calls[0][0].customer).toBe(CUSTOMER_B);
  });

  it("refuses a builder with 403 and never reaches Stripe", async () => {
    const res = await agentBuilder.post(PORTAL_PATH).send({});
    expect(res.status).toBe(403);
    expect(stripeMock.billingPortalCreate).not.toHaveBeenCalled();
  });

  it("refuses an account with no organization with 403 (admin and super_admin)", async () => {
    for (const [label, agent] of [
      ["admin", agentAdminNoOrg],
      ["super_admin", agentSuperNoOrg],
    ] as const) {
      const res = await agent.post(PORTAL_PATH).send({});
      expect(res.status, `${label} with no org must be refused the portal`).toBe(403);
    }
    expect(stripeMock.billingPortalCreate).not.toHaveBeenCalled();
  });

  it("refuses the portal while impersonating, even an org-bound target", async () => {
    const res = await agentImpersonating.post(PORTAL_PATH).send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/impersonating/i);
    expect(stripeMock.billingPortalCreate).not.toHaveBeenCalled();
  });
});

describe("POST /compass/billing/reconcile (authenticated authorization)", () => {
  it("rejects anonymous access with 401", async () => {
    const res = await request(app).post(RECONCILE_PATH).send({});
    expect(res.status).toBe(401);
    expect(stripeMock.checkoutSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("reconciles a session that belongs to the actor's OWN org", async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    stripeMock.checkoutSessionsRetrieve.mockResolvedValue({
      id: "cs_own",
      client_reference_id: String(orgAId),
      subscription: "sub_own",
    });
    stripeMock.subscriptionsRetrieve.mockResolvedValue({
      id: "sub_own",
      customer: CUSTOMER_A,
      status: "active",
      current_period_end: periodEnd,
      items: { data: [{ price: { metadata: { tier: "professional" }, lookup_key: null } }] },
    });

    const res = await agentSchoolA.post(RECONCILE_PATH).send({ sessionId: "cs_own" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(stripeMock.subscriptionsRetrieve).toHaveBeenCalledWith("sub_own");
    expect(res.body.subscriptionStatus).toBe("active");
  });

  it("refuses a checkout session whose client_reference_id belongs to ANOTHER org (404, no attach)", async () => {
    // School A passes a session id that resolves to org B's checkout session.
    stripeMock.checkoutSessionsRetrieve.mockResolvedValue({
      id: "cs_cross",
      client_reference_id: String(orgBId),
      subscription: "sub_other",
    });

    const res = await agentSchoolA.post(RECONCILE_PATH).send({ sessionId: "cs_cross" });
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    // The other tenant's subscription must never be fetched or applied.
    expect(stripeMock.subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("refuses a builder with 403 and never reaches Stripe", async () => {
    const res = await agentBuilder.post(RECONCILE_PATH).send({});
    expect(res.status).toBe(403);
    expect(stripeMock.checkoutSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("refuses an account with no organization with 403 (admin and super_admin)", async () => {
    for (const [label, agent] of [
      ["admin", agentAdminNoOrg],
      ["super_admin", agentSuperNoOrg],
    ] as const) {
      const res = await agent.post(RECONCILE_PATH).send({});
      expect(res.status, `${label} with no org must be refused reconcile`).toBe(403);
    }
    expect(stripeMock.checkoutSessionsRetrieve).not.toHaveBeenCalled();
  });

  it("refuses reconcile while impersonating, even an org-bound target", async () => {
    const res = await agentImpersonating.post(RECONCILE_PATH).send({ sessionId: "cs_own" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/impersonating/i);
    expect(stripeMock.checkoutSessionsRetrieve).not.toHaveBeenCalled();
  });
});
