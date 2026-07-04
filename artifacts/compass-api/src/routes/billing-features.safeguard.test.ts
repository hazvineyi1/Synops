import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the per-plan FEATURE entitlements (whiteLabel,
 * multiAccreditorExport, customDomain) are enforced server-side, since the
 * server is the only real boundary.
 *
 * Policy under test (the hybrid rule):
 *   - whiteLabel (cosmetic branding) + multiAccreditorExport (evidence packet):
 *     org-bound actors are gated by their own org's effective tier; global
 *     actors bypass (internal staff serve client orgs).
 *   - customDomain (assigning a non-empty domain): enforced on the TARGET org
 *     even for globals, because the domain is durable tenant config. Clearing a
 *     domain is always allowed.
 *
 * A refusal is 402 { error:"upgrade_required", feature, requiredTier, message }.
 * Ordering is preserved: cross-org / unknown orgs stay 404 (never 402), and a
 * no-op branding patch is never refused.
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run) under unique slugs/emails and are
 * removed afterwards.
 */

const PASSWORD = "Features!2345";
const SUFFIX = `features-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

type Agent = ReturnType<typeof request.agent>;

let orgTrialId: number;
let orgStarterId: number;
let orgProId: number;
let orgEntId: number;
let clientTrialId: number;
let clientProId: number;
let projTrialId: number;
let projProId: number;
const createdCourseIds: number[] = [];
const createdObjectiveIds: number[] = [];
const createdAssessmentIds: number[] = [];
const createdUserIds: number[] = [];

let agentSaTrial: Agent;
let agentSaStarter: Agent;
let agentSaPro: Agent;
let agentSuperAdmin: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password: PASSWORD });
  expect(
    res.status,
    `login for ${email} failed: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(200);
  return agent;
}

function brandingPath(orgId: number): string {
  return `/api/compass/admin/organizations/${orgId}/branding`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  dbMod = await import("@workspace/compass-db");
  const { hashPassword } = await import("../lib/auth");
  app = (await import("../app")).default;

  const {
    db,
    organizationsTable,
    clientsTable,
    projectsTable,
    usersTable,
    coursesTable,
    objectivesTable,
    assessmentsTable,
  } = dbMod;

  const [orgTrial] = await db
    .insert(organizationsTable)
    .values({ name: "Features Trial School", slug: `${SUFFIX}-trial`, type: "school" })
    .returning();
  const [orgStarter] = await db
    .insert(organizationsTable)
    .values({ name: "Features Starter School", slug: `${SUFFIX}-starter`, type: "school", planTier: "starter" })
    .returning();
  const [orgPro] = await db
    .insert(organizationsTable)
    .values({ name: "Features Pro School", slug: `${SUFFIX}-pro`, type: "school", planTier: "professional" })
    .returning();
  const [orgEnt] = await db
    .insert(organizationsTable)
    .values({ name: "Features Ent School", slug: `${SUFFIX}-ent`, type: "school", planTier: "enterprise" })
    .returning();
  orgTrialId = orgTrial.id;
  orgStarterId = orgStarter.id;
  orgProId = orgPro.id;
  orgEntId = orgEnt.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { email: `sa-trial-${SUFFIX}@feat.test`, name: "Features SA Trial", role: "school_admin", organizationId: orgTrial.id },
    { email: `sa-starter-${SUFFIX}@feat.test`, name: "Features SA Starter", role: "school_admin", organizationId: orgStarter.id },
    { email: `sa-pro-${SUFFIX}@feat.test`, name: "Features SA Pro", role: "school_admin", organizationId: orgPro.id },
    { email: `super-${SUFFIX}@feat.test`, name: "Features Super Admin", role: "super_admin", organizationId: null },
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

  const [clientTrial] = await db
    .insert(clientsTable)
    .values({ organizationId: orgTrial.id, name: "Features Client Trial" })
    .returning();
  const [clientPro] = await db
    .insert(clientsTable)
    .values({ organizationId: orgPro.id, name: "Features Client Pro" })
    .returning();
  clientTrialId = clientTrial.id;
  clientProId = clientPro.id;

  const [projTrial] = await db
    .insert(projectsTable)
    .values({ clientId: clientTrial.id, title: "Features Project Trial", stage: 3, status: "active" })
    .returning();
  const [projPro] = await db
    .insert(projectsTable)
    .values({ clientId: clientPro.id, title: "Features Project Pro", stage: 3, status: "active" })
    .returning();
  projTrialId = projTrial.id;
  projProId = projPro.id;

  // A little real curriculum so the packet renders for the allowed cases.
  for (const projectId of [projTrial.id, projPro.id]) {
    const [course] = await db
      .insert(coursesTable)
      .values({ projectId, title: "NUR 210 Health Assessment", termWeeks: 15 })
      .returning();
    createdCourseIds.push(course.id);
    const [obj] = await db
      .insert(objectivesTable)
      .values({ projectId, text: "Perform a comprehensive health assessment and document findings." })
      .returning();
    createdObjectiveIds.push(obj.id);
    const [assessment] = await db
      .insert(assessmentsTable)
      .values({
        courseId: course.id,
        title: "Health assessment OSCE",
        alignedObjectiveIds: JSON.stringify([obj.id]),
      })
      .returning();
    createdAssessmentIds.push(assessment.id);
  }

  agentSaTrial = await login(accounts[0].email);
  agentSaStarter = await login(accounts[1].email);
  agentSaPro = await login(accounts[2].email);
  agentSuperAdmin = await login(accounts[3].email);
}, 30000);

afterAll(async () => {
  const {
    db,
    organizationsTable,
    clientsTable,
    projectsTable,
    usersTable,
    coursesTable,
    objectivesTable,
    assessmentsTable,
    auditEventsTable,
  } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["audit_events", () => db.delete(auditEventsTable).where(inArray(auditEventsTable.projectId, [projTrialId, projProId]))],
    ["assessments", () => (createdAssessmentIds.length > 0 ? db.delete(assessmentsTable).where(inArray(assessmentsTable.id, createdAssessmentIds)) : Promise.resolve())],
    ["objectives", () => (createdObjectiveIds.length > 0 ? db.delete(objectivesTable).where(inArray(objectivesTable.id, createdObjectiveIds)) : Promise.resolve())],
    ["courses", () => (createdCourseIds.length > 0 ? db.delete(coursesTable).where(inArray(coursesTable.id, createdCourseIds)) : Promise.resolve())],
    ["projects", () => db.delete(projectsTable).where(inArray(projectsTable.id, [projTrialId, projProId]))],
    ["clients", () => db.delete(clientsTable).where(inArray(clientsTable.id, [clientTrialId, clientProId]))],
    ["users", () => (createdUserIds.length > 0 ? db.delete(usersTable).where(inArray(usersTable.id, createdUserIds)) : Promise.resolve())],
    ["organizations", () => db.delete(organizationsTable).where(inArray(organizationsTable.id, [orgTrialId, orgStarterId, orgProId, orgEntId]))],
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
    console.warn(`[billing-features.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Compass white-label branding gating (whiteLabel)", () => {
  it("refuses a cosmetic edit for an org-bound admin on the trial tier with 402", async () => {
    const res = await agentSaTrial.patch(brandingPath(orgTrialId)).send({ name: "Renamed Trial School" });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.feature).toBe("whiteLabel");
    expect(res.body.requiredTier).toBe("professional");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message.length).toBeGreaterThan(0);
  });

  it("refuses a cosmetic edit for an org-bound admin on the starter tier with 402", async () => {
    const res = await agentSaStarter.patch(brandingPath(orgStarterId)).send({ accentColor: "#123456" });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.feature).toBe("whiteLabel");
    expect(res.body.requiredTier).toBe("professional");
  });

  it("allows a cosmetic edit for an org-bound admin on the professional tier", async () => {
    const res = await agentSaPro.patch(brandingPath(orgProId)).send({ tagline: "Designing better outcomes" });
    expect(res.status).toBe(200);
    expect(res.body.tagline).toBe("Designing better outcomes");
  });

  it("lets a global admin edit branding for a trial org (global bypass)", async () => {
    const res = await agentSuperAdmin.patch(brandingPath(orgTrialId)).send({ name: "Globally Renamed Trial" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Globally Renamed Trial");
  });

  it("does not refuse a no-op branding patch on the trial tier", async () => {
    const res = await agentSaTrial.patch(brandingPath(orgTrialId)).send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orgTrialId);
  });

  it("returns 404 (not 402) for a cross-org branding edit", async () => {
    const res = await agentSaTrial.patch(brandingPath(orgProId)).send({ name: "Should not apply" });
    expect(res.status).toBe(404);
  });
});

describe("Compass custom-domain gating (customDomain)", () => {
  it("refuses assigning a domain to a professional org even for a global admin", async () => {
    const res = await agentSuperAdmin.patch(brandingPath(orgProId)).send({ domain: `feat-pro-${Date.now()}.example.org` });
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.feature).toBe("customDomain");
    expect(res.body.requiredTier).toBe("enterprise");
  });

  it("allows assigning a domain to an enterprise org for a global admin", async () => {
    const domain = `feat-ent-${Date.now()}.example.org`;
    const res = await agentSuperAdmin.patch(brandingPath(orgEntId)).send({ domain });
    expect(res.status).toBe(200);
    expect(res.body.domain).toBe(domain);
  });

  it("always allows clearing a domain, even on the trial tier", async () => {
    const res = await agentSuperAdmin.patch(brandingPath(orgTrialId)).send({ domain: "" });
    expect(res.status).toBe(200);
    expect(res.body.domain).toBeNull();
  });
});

describe("Compass evidence packet gating (multiAccreditorExport)", () => {
  it("refuses the export for an org-bound admin on the trial tier with 402", async () => {
    const res = await agentSaTrial.get(`/api/compass/projects/${projTrialId}/evidence-packet.pdf`);
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.feature).toBe("multiAccreditorExport");
    expect(res.body.requiredTier).toBe("professional");
  });

  it("refuses the DOCX export for an org-bound admin on the trial tier with 402", async () => {
    const res = await agentSaTrial.get(`/api/compass/projects/${projTrialId}/evidence-packet.docx`);
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("upgrade_required");
    expect(res.body.feature).toBe("multiAccreditorExport");
    expect(res.body.requiredTier).toBe("professional");
  });

  it("allows the export for an org-bound admin on the professional tier", async () => {
    const res = await agentSaPro.get(`/api/compass/projects/${projProId}/evidence-packet.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
  });

  it("lets a global admin export a trial org's packet (global bypass)", async () => {
    const res = await agentSuperAdmin.get(`/api/compass/projects/${projTrialId}/evidence-packet.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
  });
});
