import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the QA evaluate endpoint runs the shared curriculum engine
 * over a project's real curriculum, persists a scored report, backfills objective
 * bloom/measurability, audits the run, and stays org-scoped.
 *
 * Complements engine.safeguard.test.ts (no curriculum route is served ungated) and
 * tenant-isolation.test.ts (the cross-org matrix on clients/projects) by exercising
 * the two new QA routes end to end against a live database:
 *   POST /api/compass/projects/:id/qa/evaluate
 *   GET  /api/compass/projects/:id/qa/report
 *
 * Matrix:
 *   - anonymous                       -> 401 (the /compass gate requires a session)
 *   - school A evaluates own project  -> 201, scored report; objectives backfilled; audit row
 *   - school A reads own report       -> 200, returns the latest persisted report
 *   - school B reads own (no report)  -> 200, null
 *   - cross-org evaluate / read by id -> 404 (never 403, so existence cannot be probed)
 *   - builder with no allocation       -> 404 (allocation scoping hides the project)
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run) under unique slugs/emails and are
 * removed afterwards.
 */

const PASSWORD = "QaEval!2345";
const SUFFIX = `qaeval-${Date.now()}`;

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
let courseAId: number;
let measurableObjId: number;
let vagueObjId: number;
let assessmentAId: number;
let frameworkId: number;
let competencyId: number;
let crosswalkId: number;
const createdUserIds: number[] = [];

let agentSchoolA: Agent;
let agentSchoolB: Agent;
let agentBuilder: Agent;

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

  const {
    db,
    organizationsTable,
    clientsTable,
    projectsTable,
    usersTable,
    coursesTable,
    objectivesTable,
    assessmentsTable,
    standardsFrameworksTable,
    standardCompetenciesTable,
    crosswalkLinksTable,
  } = dbMod;

  const [orgA] = await db
    .insert(organizationsTable)
    .values({ name: "QA Eval School A", slug: `${SUFFIX}-a`, type: "school" })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({ name: "QA Eval School B", slug: `${SUFFIX}-b`, type: "school" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { email: `school-a-${SUFFIX}@qa.test`, name: "QA School Admin A", role: "school_admin", organizationId: orgA.id, productKey: "compass" },
    { email: `school-b-${SUFFIX}@qa.test`, name: "QA School Admin B", role: "school_admin", organizationId: orgB.id, productKey: "compass" },
    // An allocation-limited builder bound to org A with NO allocations, so the
    // project is hidden from it (404), proving allocation scoping is enforced.
    { email: `builder-${SUFFIX}@qa.test`, name: "QA Builder", role: "builder", organizationId: orgA.id, productKey: "compass" },
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
    .values({ organizationId: orgA.id, name: "QA Client A" })
    .returning();
  const [clientB] = await db
    .insert(clientsTable)
    .values({ organizationId: orgB.id, name: "QA Client B" })
    .returning();
  clientAId = clientA.id;
  clientBId = clientB.id;

  const [projectA] = await db
    .insert(projectsTable)
    .values({ clientId: clientA.id, title: "QA Eval Project A", stage: 1, status: "active" })
    .returning();
  const [projectB] = await db
    .insert(projectsTable)
    .values({ clientId: clientB.id, title: "QA Eval Project B", stage: 1, status: "active" })
    .returning();
  projectAId = projectA.id;
  projectBId = projectB.id;

  const [courseA] = await db
    .insert(coursesTable)
    .values({ projectId: projectA.id, title: "NUR 101 Foundations", termWeeks: 15 })
    .returning();
  courseAId = courseA.id;

  // One strong, measurable objective and one vague one so the engine produces a
  // mixed report (a measurable/aligned/assessed objective plus failing findings).
  const [measurableObj] = await db
    .insert(objectivesTable)
    .values({
      projectId: projectA.id,
      text: "Analyze patient assessment data to formulate a nursing diagnosis with at least 90% accuracy.",
    })
    .returning();
  const [vagueObj] = await db
    .insert(objectivesTable)
    .values({ projectId: projectA.id, text: "Understand pharmacology concepts." })
    .returning();
  measurableObjId = measurableObj.id;
  vagueObjId = vagueObj.id;

  const [assessmentA] = await db
    .insert(assessmentsTable)
    .values({
      courseId: courseA.id,
      title: "Case study analysis",
      alignedObjectiveIds: JSON.stringify([measurableObj.id]),
    })
    .returning();
  assessmentAId = assessmentA.id;

  const [framework] = await db
    .insert(standardsFrameworksTable)
    .values({ name: "Nursing Accreditation", acronym: "CCNE", frameworkType: "accreditor" })
    .returning();
  frameworkId = framework.id;
  const [competency] = await db
    .insert(standardCompetenciesTable)
    .values({ frameworkId: framework.id, code: "D2", description: "Person-centered care", domain: "Domain 2" })
    .returning();
  competencyId = competency.id;
  const [crosswalk] = await db
    .insert(crosswalkLinksTable)
    .values({ projectId: projectA.id, competencyId: competency.id, objectiveId: measurableObj.id })
    .returning();
  crosswalkId = crosswalk.id;

  agentSchoolA = await login(accounts[0].email);
  agentSchoolB = await login(accounts[1].email);
  agentBuilder = await login(accounts[2].email);
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
    standardsFrameworksTable,
    standardCompetenciesTable,
    crosswalkLinksTable,
    qaReportsTable,
    auditEventsTable,
  } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["qa_reports", () => db.delete(qaReportsTable).where(inArray(qaReportsTable.projectId, [projectAId, projectBId]))],
    ["audit_events", () => db.delete(auditEventsTable).where(inArray(auditEventsTable.projectId, [projectAId, projectBId]))],
    ["crosswalk_links", () => db.delete(crosswalkLinksTable).where(eq(crosswalkLinksTable.id, crosswalkId))],
    ["standard_competencies", () => db.delete(standardCompetenciesTable).where(eq(standardCompetenciesTable.id, competencyId))],
    ["standards_frameworks", () => db.delete(standardsFrameworksTable).where(eq(standardsFrameworksTable.id, frameworkId))],
    ["assessments", () => db.delete(assessmentsTable).where(eq(assessmentsTable.id, assessmentAId))],
    ["objectives", () => db.delete(objectivesTable).where(inArray(objectivesTable.id, [measurableObjId, vagueObjId]))],
    ["courses", () => db.delete(coursesTable).where(eq(coursesTable.id, courseAId))],
    ["projects", () => db.delete(projectsTable).where(inArray(projectsTable.id, [projectAId, projectBId]))],
    ["clients", () => db.delete(clientsTable).where(inArray(clientsTable.id, [clientAId, clientBId]))],
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
    console.warn(`[qa-evaluate.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Compass QA evaluate + report (DB-backed)", () => {
  it("rejects anonymous access to the QA routes with 401", async () => {
    expect((await request(app).post(`/api/compass/projects/${projectAId}/qa/evaluate`)).status).toBe(401);
    expect((await request(app).get(`/api/compass/projects/${projectAId}/qa/report`)).status).toBe(401);
  });

  it("returns null when no report has been run for an in-org project", async () => {
    const res = await agentSchoolB.get(`/api/compass/projects/${projectBId}/qa/report`);
    expect(res.status).toBe(200);
    const empty = res.body == null || (typeof res.body === "object" && Object.keys(res.body).length === 0);
    expect(empty, `expected an empty/null body, got ${JSON.stringify(res.body)}`).toBe(true);
  });

  it("evaluates an in-org project: scores it, persists the report, and attributes the run", async () => {
    const res = await agentSchoolA.post(`/api/compass/projects/${projectAId}/qa/evaluate`);
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const body = res.body;
    expect(body.projectId).toBe(projectAId);
    expect(typeof body.score).toBe("number");
    expect(["pass", "warn", "fail"]).toContain(body.status);
    // The vague, unaligned, unassessed objective forces at least one fail finding,
    // so the project must not pass clean and the gate must be held.
    expect(body.status).toBe("fail");
    expect(body.gateBlock).toBe(true);
    // Attributed to the real operator (school A admin, no impersonation here).
    expect(body.runByUserId).toBe(createdUserIds[0]);

    // Structured engine report is persisted, not a manual pass/fail.
    expect(body.report).toBeTruthy();
    expect(body.report.counts.fail).toBeGreaterThan(0);
    expect(Array.isArray(body.report.categoryScores)).toBe(true);
    expect(Array.isArray(body.report.objectiveAnalyses)).toBe(true);

    const measurable = body.report.objectiveAnalyses.find(
      (a: { objectiveId: string }) => a.objectiveId === String(measurableObjId),
    );
    const vague = body.report.objectiveAnalyses.find(
      (a: { objectiveId: string }) => a.objectiveId === String(vagueObjId),
    );
    expect(measurable?.measurability).toBe("measurable");
    expect(measurable?.aligned).toBe(true);
    expect(vague?.measurability).not.toBe("measurable");
  });

  it("backfills bloom level + measurability onto the objectives", async () => {
    const { db, objectivesTable } = dbMod;
    const rows = await db
      .select({
        id: objectivesTable.id,
        cognitiveLevel: objectivesTable.cognitiveLevel,
        measurabilityStatus: objectivesTable.measurabilityStatus,
      })
      .from(objectivesTable)
      .where(inArray(objectivesTable.id, [measurableObjId, vagueObjId]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(measurableObjId)?.cognitiveLevel).toBeTruthy();
    expect(byId.get(measurableObjId)?.measurabilityStatus).toBe("measurable");
    expect(byId.get(vagueObjId)?.measurabilityStatus).not.toBe("measurable");
  });

  it("writes an audit row attributed to the actor", async () => {
    const { db, auditEventsTable } = dbMod;
    const rows = await db
      .select()
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.projectId, projectAId), eq(auditEventsTable.entityType, "qa_report")));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].actorUserId).toBe(createdUserIds[0]);
  });

  it("returns the latest persisted report on GET", async () => {
    const res = await agentSchoolA.get(`/api/compass/projects/${projectAId}/qa/report`);
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectAId);
    expect(typeof res.body.score).toBe("number");
    expect(res.body.report).toBeTruthy();
  });

  it("returns 404 (not 403) when evaluating another organization's project", async () => {
    expect((await agentSchoolA.post(`/api/compass/projects/${projectBId}/qa/evaluate`)).status).toBe(404);
    expect((await agentSchoolA.get(`/api/compass/projects/${projectBId}/qa/report`)).status).toBe(404);
  });

  it("hides the project from an allocation-less builder (404)", async () => {
    expect((await agentBuilder.post(`/api/compass/projects/${projectAId}/qa/evaluate`)).status).toBe(404);
    expect((await agentBuilder.get(`/api/compass/projects/${projectAId}/qa/report`)).status).toBe(404);
  });
});
