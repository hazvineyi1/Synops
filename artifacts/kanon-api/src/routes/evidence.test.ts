import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof that the one-click evidence packet exports (PDF + DOCX) are
 * gated, org-scoped, and produce real binary documents.
 *
 * Complements engine.safeguard.test.ts (no curriculum route is served ungated)
 * and tenant-isolation.test.ts (the cross-org matrix) by exercising the two
 * binary routes end to end against a live database:
 *   GET /api/compass/projects/:id/evidence-packet.pdf
 *   GET /api/compass/projects/:id/evidence-packet.docx
 *
 * Matrix:
 *   - anonymous                         -> 401 (the /compass gate requires a session)
 *   - invalid id                        -> 400 (parsed before any DB work)
 *   - school A exports own project      -> 200, non-empty %PDF / PK-zip, attachment
 *   - cross-org export by id            -> 404 (never 403, so existence cannot be probed)
 *   - builder with no allocation        -> 404 (allocation scoping hides the project)
 *   - global super_admin exports any    -> 200 (global roles bypass org scope)
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run) under unique slugs/emails and are
 * removed afterwards.
 */

const PASSWORD = "Evidence!2345";
const SUFFIX = `evidence-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/kanon-db");

type Agent = ReturnType<typeof request.agent>;

// Fixture ids, populated in beforeAll.
let orgAId: number;
let orgBId: number;
let clientAId: number;
let clientBId: number;
let projectAId: number;
let projectBId: number;
let courseAId: number;
let objAId: number;
let assessmentAId: number;
const createdUserIds: number[] = [];

let agentSchoolA: Agent;
let agentSuperAdmin: Agent;
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

// Collect a binary response body into a Buffer; superagent has no parser for
// application/pdf or the DOCX content type, so without this res.body is empty.
// The response object is an http.IncomingMessage stream at parse time, but
// supertest types it as a Response, so widen and narrow to the stream shape.
function binaryParser(res: unknown, callback: (err: Error | null, body: Buffer) => void): void {
  const stream = res as NodeJS.ReadableStream & { setEncoding(enc: string): void };
  stream.setEncoding("binary");
  let data = "";
  stream.on("data", (chunk: string) => {
    data += chunk;
  });
  stream.on("end", () => {
    callback(null, Buffer.from(data, "binary"));
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  dbMod = await import("@workspace/kanon-db");
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

  const [orgA] = await db
    .insert(organizationsTable)
    .values({
      name: "Evidence School A",
      slug: `${SUFFIX}-a`,
      type: "school",
      accentColor: "#0b5fff",
      // Professional tier so the evidence packet (a Professional+ feature) is
      // entitled; the gate itself is covered by billing-features.safeguard.test.ts.
      planTier: "professional",
    })
    .returning();
  const [orgB] = await db
    .insert(organizationsTable)
    .values({ name: "Evidence School B", slug: `${SUFFIX}-b`, type: "school" })
    .returning();
  orgAId = orgA.id;
  orgBId = orgB.id;

  const passwordHash = await hashPassword(PASSWORD);
  const accounts = [
    { email: `school-a-${SUFFIX}@ev.test`, name: "Evidence School Admin A", role: "school_admin", organizationId: orgA.id, productKey: "compass" },
    { email: `super-${SUFFIX}@ev.test`, name: "Evidence Super Admin", role: "super_admin", organizationId: null, productKey: "compass" },
    // An allocation-limited builder bound to org A with NO allocations, so the
    // project is hidden from it (404), proving allocation scoping is enforced.
    { email: `builder-${SUFFIX}@ev.test`, name: "Evidence Builder", role: "builder", organizationId: orgA.id, productKey: "compass" },
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
    .values({ organizationId: orgA.id, name: "Evidence Client A", institution: "Evidence University" })
    .returning();
  const [clientB] = await db
    .insert(clientsTable)
    .values({ organizationId: orgB.id, name: "Evidence Client B" })
    .returning();
  clientAId = clientA.id;
  clientBId = clientB.id;

  const [projectA] = await db
    .insert(projectsTable)
    .values({ clientId: clientA.id, title: "Evidence Project A", stage: 3, status: "active" })
    .returning();
  const [projectB] = await db
    .insert(projectsTable)
    .values({ clientId: clientB.id, title: "Evidence Project B", stage: 3, status: "active" })
    .returning();
  projectAId = projectA.id;
  projectBId = projectB.id;

  // A little real curriculum so the packet has content to render.
  const [courseA] = await db
    .insert(coursesTable)
    .values({ projectId: projectA.id, title: "NUR 210 Health Assessment", termWeeks: 15 })
    .returning();
  courseAId = courseA.id;
  const [objA] = await db
    .insert(objectivesTable)
    .values({
      projectId: projectA.id,
      text: "Perform a comprehensive health assessment and document findings accurately.",
    })
    .returning();
  objAId = objA.id;
  const [assessmentA] = await db
    .insert(assessmentsTable)
    .values({
      courseId: courseA.id,
      title: "Health assessment OSCE",
      alignedObjectiveIds: JSON.stringify([objA.id]),
    })
    .returning();
  assessmentAId = assessmentA.id;

  agentSchoolA = await login(accounts[0].email);
  agentSuperAdmin = await login(accounts[1].email);
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
    auditEventsTable,
  } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["audit_events", () => db.delete(auditEventsTable).where(inArray(auditEventsTable.projectId, [projectAId, projectBId]))],
    ["assessments", () => db.delete(assessmentsTable).where(eq(assessmentsTable.id, assessmentAId))],
    ["objectives", () => db.delete(objectivesTable).where(eq(objectivesTable.id, objAId))],
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
    console.warn(`[evidence.test] fixture cleanup left rows behind: ${failures.join("; ")}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Compass evidence packet export (DB-backed)", () => {
  it("rejects anonymous access to both formats with 401", async () => {
    expect((await request(app).get(`/api/compass/projects/${projectAId}/evidence-packet.pdf`)).status).toBe(401);
    expect((await request(app).get(`/api/compass/projects/${projectAId}/evidence-packet.docx`)).status).toBe(401);
  });

  it("returns 400 for an invalid project id", async () => {
    expect((await agentSchoolA.get(`/api/compass/projects/not-a-number/evidence-packet.pdf`)).status).toBe(400);
    expect((await agentSchoolA.get(`/api/compass/projects/0/evidence-packet.docx`)).status).toBe(400);
  });

  it("exports a non-empty PDF for an in-org project", async () => {
    const res = await agentSchoolA
      .get(`/api/compass/projects/${projectAId}/evidence-packet.pdf`)
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".pdf");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // A valid PDF begins with the %PDF magic header.
    expect(res.body.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("exports a non-empty DOCX for an in-org project", async () => {
    const res = await agentSchoolA
      .get(`/api/compass/projects/${projectAId}/evidence-packet.docx`)
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(".docx");
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // A DOCX is a zip; zip files begin with the PK local-file-header signature.
    expect(res.body.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("returns 404 (not 403) when exporting another organization's project", async () => {
    expect((await agentSchoolA.get(`/api/compass/projects/${projectBId}/evidence-packet.pdf`)).status).toBe(404);
    expect((await agentSchoolA.get(`/api/compass/projects/${projectBId}/evidence-packet.docx`)).status).toBe(404);
  });

  it("hides the project from an allocation-less builder (404)", async () => {
    expect((await agentBuilder.get(`/api/compass/projects/${projectAId}/evidence-packet.pdf`)).status).toBe(404);
    expect((await agentBuilder.get(`/api/compass/projects/${projectAId}/evidence-packet.docx`)).status).toBe(404);
  });

  it("lets a global super_admin export any organization's project", async () => {
    const res = await agentSuperAdmin
      .get(`/api/compass/projects/${projectBId}/evidence-packet.pdf`)
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
