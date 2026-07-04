import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that one school's tenant can never see another school's data.
 *
 * The safeguard test (engine.safeguard.test.ts) proves no curriculum route is
 * served ungated; it is deliberately DB-independent. This test complements it by
 * exercising the full authorization matrix against a live database with real
 * seeded fixtures, locking in the org-isolation behavior so a future change that
 * leaks one organization's data into another's fails here.
 *
 * Matrix (representative entities: clients + projects, both org-scoped):
 *   - anonymous            -> 401 (the /compass gate requires a session)
 *   - wrong product        -> 403 (a non-global user not bound to `compass`)
 *   - org-bound list        -> scoped to the actor's own organization only
 *   - cross-org by-id       -> 404 (never 403, so existence cannot be probed)
 *   - same-org by-id        -> 200 (positive control)
 *   - global (admin/super)  -> sees every organization's data
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the
 * server entrypoint, so the startup seed does not run) under unique slugs/emails
 * and removed afterwards.
 */

const PASSWORD = "Isolation!2345";
const SUFFIX = `iso-${Date.now()}`;

// Runtime modules are imported in beforeAll so app.ts (which requires
// SESSION_SECRET at import time) loads only after we have provided one, matching
// the pattern in engine.safeguard.test.ts.
let app: Express;
let dbMod: typeof import("@workspace/compass-db");

type Agent = ReturnType<typeof request.agent>;

// Fixture ids, populated in beforeAll.
let orgAId: number;
let orgBId: number;
let clientAId: number;
let clientBId: number;
let projectAId: number;
let projectBId: number;
const createdUserIds: number[] = [];
// Clients created during the create-client tests, cleaned up afterwards.
const createdClientIds: number[] = [];

// One logged-in agent per role under test.
let agentSchoolA: Agent;
let agentSchoolB: Agent;
let agentAdmin: Agent;
let agentSuperAdmin: Agent;
let agentBuilder: Agent;
let agentWrongProduct: Agent;

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

  const { db, organizationsTable, clientsTable, projectsTable, usersTable } = dbMod;

  const [orgA] = await db
    .insert(organizationsTable)
    .values({ name: "Isolation Test School A", slug: `test-${SUFFIX}-a`, type: "school" })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({ name: "Isolation Test School B", slug: `test-${SUFFIX}-b`, type: "school" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { key: "schoolA", email: `school-a-${SUFFIX}@iso.test`, name: "School Admin A", role: "school_admin", organizationId: orgA.id, productKey: "compass" },
    { key: "schoolB", email: `school-b-${SUFFIX}@iso.test`, name: "School Admin B", role: "school_admin", organizationId: orgB.id, productKey: "compass" },
    { key: "admin", email: `admin-${SUFFIX}@iso.test`, name: "Iso Admin", role: "admin", organizationId: null, productKey: "compass" },
    { key: "super", email: `super-${SUFFIX}@iso.test`, name: "Iso Super Admin", role: "super_admin", organizationId: null, productKey: "compass" },
    // An allocation-limited builder bound to org A. Builders sit below client
    // creation, so create attempts must be refused regardless of org.
    { key: "builder", email: `builder-${SUFFIX}@iso.test`, name: "Iso Builder", role: "builder", organizationId: orgA.id, productKey: "compass" },
    // A user bound to a different product. requireProduct("compass") runs before
    // loadActorContext, so this user is rejected at the product gate with 403.
    { key: "wrong", email: `wrong-${SUFFIX}@iso.test`, name: "Wrong Product", role: "client", organizationId: null, productKey: "isolation-test-product" },
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
        productKey: acct.productKey,
      })
      .returning({ id: usersTable.id });
    createdUserIds.push(row.id);
  }

  const [clientA] = await db
    .insert(clientsTable)
    .values({ organizationId: orgA.id, name: "School A Client" })
    .returning();
  const [clientB] = await db
    .insert(clientsTable)
    .values({ organizationId: orgB.id, name: "School B Client" })
    .returning();
  clientAId = clientA.id;
  clientBId = clientB.id;

  const [projectA] = await db
    .insert(projectsTable)
    .values({ clientId: clientA.id, title: "School A Project", stage: 1, status: "active" })
    .returning();
  const [projectB] = await db
    .insert(projectsTable)
    .values({ clientId: clientB.id, title: "School B Project", stage: 1, status: "active" })
    .returning();
  projectAId = projectA.id;
  projectBId = projectB.id;

  agentSchoolA = await login(accounts[0].email);
  agentSchoolB = await login(accounts[1].email);
  agentAdmin = await login(accounts[2].email);
  agentSuperAdmin = await login(accounts[3].email);
  agentBuilder = await login(accounts[4].email);
  agentWrongProduct = await login(accounts[5].email);
}, 30000);

afterAll(async () => {
  // Best-effort teardown in FK-safe order. Each step runs independently so one
  // failure does not block the rest, and leftover rows are surfaced (not silently
  // swallowed) so DB pollution is visible. A cleanup miss never fails the suite:
  // unique slugs/emails mean leftover fixtures cannot collide with a rerun.
  const { db, organizationsTable, clientsTable, projectsTable, usersTable } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["projects", () => db.delete(projectsTable).where(inArray(projectsTable.id, [projectAId, projectBId]))],
    [
      "created-clients",
      () =>
        createdClientIds.length > 0
          ? db.delete(clientsTable).where(inArray(clientsTable.id, createdClientIds))
          : Promise.resolve(),
    ],
    ["clients", () => db.delete(clientsTable).where(inArray(clientsTable.id, [clientAId, clientBId]))],
    [
      "users",
      () =>
        createdUserIds.length > 0
          ? db.delete(usersTable).where(inArray(usersTable.id, createdUserIds))
          : Promise.resolve(),
    ],
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
    console.warn(`[tenant-isolation.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Compass tenant isolation (DB-backed)", () => {
  it("rejects anonymous access to org-scoped routes with 401", async () => {
    for (const path of ["/api/compass/clients", "/api/compass/projects"]) {
      const res = await request(app).get(path);
      expect(res.status, `${path} should be 401 for an anonymous caller`).toBe(401);
    }
  });

  it("rejects a user bound to a different product with 403", async () => {
    for (const path of ["/api/compass/clients", "/api/compass/projects"]) {
      const res = await agentWrongProduct.get(path);
      expect(res.status, `${path} should be 403 for a non-compass user`).toBe(403);
    }
  });

  it("scopes the client list to the actor's own organization", async () => {
    const resA = await agentSchoolA.get("/api/compass/clients");
    expect(resA.status).toBe(200);
    const idsA = resA.body.map((c: { id: number }) => c.id);
    expect(idsA).toContain(clientAId);
    expect(idsA).not.toContain(clientBId);
    for (const c of resA.body as { organizationId: number }[]) {
      expect(c.organizationId, "School A must only see School A clients").toBe(orgAId);
    }

    const resB = await agentSchoolB.get("/api/compass/clients");
    expect(resB.status).toBe(200);
    const idsB = resB.body.map((c: { id: number }) => c.id);
    expect(idsB).toContain(clientBId);
    expect(idsB).not.toContain(clientAId);
    for (const c of resB.body as { organizationId: number }[]) {
      expect(c.organizationId, "School B must only see School B clients").toBe(orgBId);
    }
  });

  it("scopes the project list to the actor's own organization", async () => {
    // Each test org has exactly one client, so a correctly scoped project list
    // must reference only that client. Asserting every row (not just the fixture
    // id) catches any unrelated project leaking into the list.
    const resA = await agentSchoolA.get("/api/compass/projects");
    expect(resA.status).toBe(200);
    const idsA = resA.body.map((p: { id: number }) => p.id);
    expect(idsA).toContain(projectAId);
    expect(idsA).not.toContain(projectBId);
    for (const p of resA.body as { clientId: number }[]) {
      expect(p.clientId, "School A must only see projects under School A clients").toBe(clientAId);
    }

    const resB = await agentSchoolB.get("/api/compass/projects");
    expect(resB.status).toBe(200);
    const idsB = resB.body.map((p: { id: number }) => p.id);
    expect(idsB).toContain(projectBId);
    expect(idsB).not.toContain(projectAId);
    for (const p of resB.body as { clientId: number }[]) {
      expect(p.clientId, "School B must only see projects under School B clients").toBe(clientBId);
    }
  });

  it("returns 404 (not 403) when reading another organization's client by id", async () => {
    expect((await agentSchoolA.get(`/api/compass/clients/${clientBId}`)).status).toBe(404);
    expect((await agentSchoolB.get(`/api/compass/clients/${clientAId}`)).status).toBe(404);
    // Positive control: each school can read its own client.
    expect((await agentSchoolA.get(`/api/compass/clients/${clientAId}`)).status).toBe(200);
    expect((await agentSchoolB.get(`/api/compass/clients/${clientBId}`)).status).toBe(200);
  });

  it("returns 404 (not 403) when reading another organization's project by id", async () => {
    expect((await agentSchoolA.get(`/api/compass/projects/${projectBId}`)).status).toBe(404);
    expect((await agentSchoolB.get(`/api/compass/projects/${projectAId}`)).status).toBe(404);
    // Positive control: each school can read its own project.
    expect((await agentSchoolA.get(`/api/compass/projects/${projectAId}`)).status).toBe(200);
    expect((await agentSchoolB.get(`/api/compass/projects/${projectBId}`)).status).toBe(200);
  });

  it("lets global roles (admin and super_admin) see every organization", async () => {
    for (const [label, agent] of [
      ["admin", agentAdmin],
      ["super_admin", agentSuperAdmin],
    ] as const) {
      const clients = await agent.get("/api/compass/clients");
      expect(clients.status).toBe(200);
      const clientIds = clients.body.map((c: { id: number }) => c.id);
      expect(clientIds, `${label} should see School A's client`).toContain(clientAId);
      expect(clientIds, `${label} should see School B's client`).toContain(clientBId);

      expect((await agent.get(`/api/compass/clients/${clientAId}`)).status).toBe(200);
      expect((await agent.get(`/api/compass/clients/${clientBId}`)).status).toBe(200);

      const projects = await agent.get("/api/compass/projects");
      expect(projects.status).toBe(200);
      const projectIds = projects.body.map((p: { id: number }) => p.id);
      expect(projectIds, `${label} should see School A's project`).toContain(projectAId);
      expect(projectIds, `${label} should see School B's project`).toContain(projectBId);
    }
  });
});

describe("Compass client creation (org resolution)", () => {
  it("exposes the org directory to global roles but not to org-bound users", async () => {
    for (const [label, agent] of [
      ["admin", agentAdmin],
      ["super_admin", agentSuperAdmin],
    ] as const) {
      const res = await agent.get("/api/compass/admin/organizations");
      expect(res.status, `${label} should read the org directory`).toBe(200);
      const ids = res.body.map((o: { id: number }) => o.id);
      expect(ids).toContain(orgAId);
      expect(ids).toContain(orgBId);
    }
    // Org-bound and lower roles are refused at the console gate.
    expect((await agentSchoolA.get("/api/compass/admin/organizations")).status).toBe(403);
    expect((await agentBuilder.get("/api/compass/admin/organizations")).status).toBe(403);
  });

  it("lets a global admin create a client in an explicitly chosen organization", async () => {
    const res = await agentSuperAdmin
      .post("/api/compass/clients")
      .send({ name: "Global Created Client", organizationId: orgBId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.organizationId).toBe(orgBId);
    createdClientIds.push(res.body.id);
  });

  it("rejects a global admin creating a client without an organization (400)", async () => {
    const res = await agentSuperAdmin.post("/api/compass/clients").send({ name: "No Org Client" });
    expect(res.status).toBe(400);
    if (res.body?.id) createdClientIds.push(res.body.id);
  });

  it("rejects a global admin choosing a non-existent organization (400)", async () => {
    const res = await agentSuperAdmin
      .post("/api/compass/clients")
      .send({ name: "Bad Org Client", organizationId: 2_000_000_000 });
    expect(res.status).toBe(400);
    if (res.body?.id) createdClientIds.push(res.body.id);
  });

  it("ignores a body organizationId for an org-bound user and uses their own org", async () => {
    // School A tries to plant a client in School B by supplying orgB's id.
    const res = await agentSchoolA
      .post("/api/compass/clients")
      .send({ name: "School A Owned Client", organizationId: orgBId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.organizationId, "the body org must be ignored; the actor's org wins").toBe(orgAId);
    createdClientIds.push(res.body.id);
  });

  it("refuses client creation by a builder (403)", async () => {
    const res = await agentBuilder
      .post("/api/compass/clients")
      .send({ name: "Builder Client", organizationId: orgAId });
    expect(res.status).toBe(403);
    if (res.body?.id) createdClientIds.push(res.body.id);
  });
});
