import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the active-course quota is enforced when a project is
 * (re)activated, not only when a course is created.
 *
 * countActiveCourses() only counts courses whose parent project is "active", so
 * a tenant could otherwise pile courses onto an inactive project (which never
 * trips the create-time meter) and then flip that project to "active" to exceed
 * its plan limit. PATCH /compass/projects/:id must run activateProjectWithLimit()
 * for that transition and refuse with 402 BEFORE applying the update. The quota
 * check and the update share one advisory-locked transaction so concurrent
 * activations cannot both pass. Global actors (internal staff) bypass metering.
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run). Non-active projects are inserted
 * directly so the test does not depend on the project status enum; the only API
 * write is PATCH { status: "active" }, which is always a valid transition.
 */

const PASSWORD = "Metering!2345";
const SUFFIX = `meter-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

type Agent = ReturnType<typeof request.agent>;

let orgId: number;
let clientId: number;
let pOverId: number;
let pOkId: number;
let pGlobalId: number;
const createdUserIds: number[] = [];

// Dedicated org for the concurrency test so the sequential tests above (which
// leave active courses behind) do not pollute its active-course count.
let orgConcId: number;
let clientConcId: number;
let pConcAId: number;
let pConcBId: number;

let agentSchoolAdmin: Agent;
let agentSuperAdmin: Agent;
let agentSchoolAdminConc: Agent;

let countActiveCourses: typeof import("../lib/billing").countActiveCourses;

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

  const { db, organizationsTable, clientsTable, projectsTable, coursesTable, usersTable } = dbMod;

  // A trial org has an active-course limit of 2 (PLANS.trial.activeCourseLimit).
  const [org] = await db
    .insert(organizationsTable)
    .values({
      name: "Metering Test School",
      slug: `test-${SUFFIX}`,
      type: "school",
      planTier: "trial",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning();
  orgId = org.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    {
      email: `school-${SUFFIX}@meter.test`,
      name: "Metering School Admin",
      role: "school_admin",
      organizationId: org.id,
      productKey: "compass",
    },
    {
      email: `super-${SUFFIX}@meter.test`,
      name: "Metering Super Admin",
      role: "super_admin",
      organizationId: null,
      productKey: "compass",
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
        productKey: acct.productKey,
      })
      .returning({ id: usersTable.id });
    createdUserIds.push(row.id);
  }

  const [client] = await db
    .insert(clientsTable)
    .values({ organizationId: org.id, name: "Metering Client" })
    .returning();
  clientId = client.id;

  // Insert a non-active ("archived") project preloaded with courses that do NOT
  // yet count toward the org's active-course total.
  async function archivedProjectWithCourses(
    clientFk: number,
    title: string,
    courseCount: number,
  ): Promise<number> {
    const [project] = await db
      .insert(projectsTable)
      .values({ clientId: clientFk, title, stage: 1, status: "archived" })
      .returning();
    for (let i = 0; i < courseCount; i++) {
      await db.insert(coursesTable).values({ projectId: project.id, title: `${title} Course ${i + 1}` });
    }
    return project.id;
  }

  pOverId = await archivedProjectWithCourses(client.id, "Over Limit Project", 3);
  pOkId = await archivedProjectWithCourses(client.id, "Within Limit Project", 2);
  pGlobalId = await archivedProjectWithCourses(client.id, "Global Bypass Project", 1);

  // Concurrency fixture: a fresh trial org (limit 2) with two archived projects
  // of 2 courses each. Activating either alone is fine; activating both pushes
  // the org to 4 active courses, so only one activation may win under the lock.
  const [orgConc] = await db
    .insert(organizationsTable)
    .values({
      name: "Metering Concurrency School",
      slug: `test-conc-${SUFFIX}`,
      type: "school",
      planTier: "trial",
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning();
  orgConcId = orgConc.id;

  const [concAdmin] = await db
    .insert(usersTable)
    .values({
      email: `school-conc-${SUFFIX}@meter.test`,
      passwordHash,
      name: "Metering Concurrency Admin",
      role: "school_admin",
      organizationId: orgConc.id,
      productKey: "compass",
    })
    .returning({ id: usersTable.id });
  createdUserIds.push(concAdmin.id);

  const [clientConc] = await db
    .insert(clientsTable)
    .values({ organizationId: orgConc.id, name: "Metering Concurrency Client" })
    .returning();
  clientConcId = clientConc.id;

  pConcAId = await archivedProjectWithCourses(clientConc.id, "Concurrent Project A", 2);
  pConcBId = await archivedProjectWithCourses(clientConc.id, "Concurrent Project B", 2);

  ({ countActiveCourses } = await import("../lib/billing"));

  agentSchoolAdmin = await login(accounts[0].email);
  agentSuperAdmin = await login(accounts[1].email);
  agentSchoolAdminConc = await login(`school-conc-${SUFFIX}@meter.test`);
}, 30000);

afterAll(async () => {
  const { db, organizationsTable, clientsTable, projectsTable, coursesTable, usersTable } = dbMod;
  const projectIds = [pOverId, pOkId, pGlobalId, pConcAId, pConcBId].filter(
    (id): id is number => typeof id === "number",
  );
  const clientIds = [clientId, clientConcId].filter((id): id is number => typeof id === "number");
  const orgIds = [orgId, orgConcId].filter((id): id is number => typeof id === "number");
  const steps: Array<[string, () => Promise<unknown>]> = [
    [
      "courses",
      () =>
        projectIds.length > 0
          ? db.delete(coursesTable).where(inArray(coursesTable.projectId, projectIds))
          : Promise.resolve(),
    ],
    [
      "projects",
      () =>
        projectIds.length > 0
          ? db.delete(projectsTable).where(inArray(projectsTable.id, projectIds))
          : Promise.resolve(),
    ],
    [
      "clients",
      () =>
        clientIds.length > 0
          ? db.delete(clientsTable).where(inArray(clientsTable.id, clientIds))
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
    console.warn(`[billing-metering.safeguard.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

async function projectStatus(id: number): Promise<string | undefined> {
  const { db, projectsTable } = dbMod;
  const [row] = await db
    .select({ status: projectsTable.status })
    .from(projectsTable)
    .where(eq(projectsTable.id, id));
  return row?.status;
}

describe("Compass active-course metering on project activation", () => {
  it("refuses to activate a project that would exceed the active-course limit (402)", async () => {
    // org active count is 0; activating pOver (3 courses) would be 3 > limit 2.
    const res = await agentSchoolAdmin.patch(`/api/compass/projects/${pOverId}`).send({ status: "active" });
    expect(res.status, JSON.stringify(res.body)).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.tier).toBe("trial");
    expect(res.body.limit).toBe(2);
    // The update must NOT have applied: the project is still archived.
    expect(await projectStatus(pOverId)).toBe("archived");
  });

  it("allows activation that stays within the active-course limit (200)", async () => {
    // org active count is still 0 (pOver stayed archived); pOk has 2 courses -> 2 <= 2.
    const res = await agentSchoolAdmin.patch(`/api/compass/projects/${pOkId}`).send({ status: "active" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await projectStatus(pOkId)).toBe("active");
  });

  it("lets a global actor bypass activation metering (200)", async () => {
    // org active count is now 2 (pOk); activating pGlobal (1 course) would be 3 > 2,
    // but a super_admin is global and bypasses the quota.
    const res = await agentSuperAdmin.patch(`/api/compass/projects/${pGlobalId}`).send({ status: "active" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await projectStatus(pGlobalId)).toBe("active");
  });

  it("serializes concurrent activations so the limit cannot be overshot", async () => {
    // Both projects have 2 courses; the org limit is 2. Activating both at once
    // must not let both pass: the advisory lock holds through each update, so
    // exactly one activation wins (2 active) and the other is refused (would be 4).
    const [resA, resB] = await Promise.all([
      agentSchoolAdminConc.patch(`/api/compass/projects/${pConcAId}`).send({ status: "active" }),
      agentSchoolAdminConc.patch(`/api/compass/projects/${pConcBId}`).send({ status: "active" }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses, `A=${resA.status} ${JSON.stringify(resA.body)} B=${resB.status} ${JSON.stringify(resB.body)}`).toEqual([200, 402]);
    const refused = resA.status === 402 ? resA : resB;
    expect(refused.body.error).toBe("upgrade_required");
    expect(refused.body.limit).toBe(2);
    // The org must never exceed its 2-course quota despite the concurrent attempts.
    expect(await countActiveCourses(orgConcId)).toBe(2);
    // Exactly one of the two projects ended up active.
    const activeCount = [await projectStatus(pConcAId), await projectStatus(pConcBId)].filter(
      (s) => s === "active",
    ).length;
    expect(activeCount).toBe(1);
  });
});
