import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof of the email-verification gate on self-serve trial signup:
 *
 *  - POST /auth/register creates an UNVERIFIED user + an org with trialEndsAt
 *    null, establishes NO session, and returns 202 { verificationRequired }.
 *  - A duplicate register stays enumeration-safe: it returns the same 202 shape,
 *    never a 409 (which would leak which emails are registered).
 *  - Login is blocked with 403 { code: "email_unverified" } until verified.
 *  - POST /auth/verify-email consumes a single-use token, starts the 14-day trial
 *    clock (org.trialEndsAt transitions null -> set), establishes a session, and
 *    returns the trial-aware AuthUser (effectiveTier "trial", readOnly false).
 *  - The same token cannot be replayed: a second verify returns 400 invalid_token.
 *
 * Fixtures: register is driven through the public API; the raw verification token
 * is minted directly (the emailed token is degrade-to-logged, not interceptable in
 * test). The test imports `app`, not the server entrypoint, so the startup seed
 * does not run. REQUIRE_EMAIL_VERIFICATION is forced on so the gate is exercised
 * regardless of ambient env.
 */

const PASSWORD = "Verify!2345";
const SUFFIX = `vf-${Date.now()}`;
const EMAIL = `register-${SUFFIX}@vf.test`;

let app: Express;
let dbMod: typeof import("@workspace/kanon-db");
let createVerificationToken: (userId: number) => Promise<string>;

let userId: number | undefined;
let orgId: number | undefined;

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  // Force the gate on so the test is deterministic regardless of ambient env.
  process.env.REQUIRE_EMAIL_VERIFICATION = "on";
  dbMod = await import("@workspace/kanon-db");
  ({ createVerificationToken } = await import("../lib/verification"));
  app = (await import("../app")).default;
}, 30000);

afterAll(async () => {
  const { db, organizationsTable, clientsTable, usersTable, emailVerificationTokensTable } = dbMod;
  const steps: Array<[string, () => Promise<unknown>]> = [
    [
      "tokens",
      () =>
        userId != null
          ? db
              .delete(emailVerificationTokensTable)
              .where(eq(emailVerificationTokensTable.userId, userId))
          : Promise.resolve(),
    ],
    [
      "clients",
      () =>
        orgId != null
          ? db.delete(clientsTable).where(eq(clientsTable.organizationId, orgId))
          : Promise.resolve(),
    ],
    [
      "users",
      () =>
        userId != null
          ? db.delete(usersTable).where(inArray(usersTable.id, [userId]))
          : Promise.resolve(),
    ],
    [
      "organizations",
      () =>
        orgId != null
          ? db.delete(organizationsTable).where(inArray(organizationsTable.id, [orgId]))
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
      `[auth-verification.safeguard.test] fixture cleanup left rows behind: ${failures.join("; ")}`,
    );
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

describe("Email verification gate on self-serve trial signup", () => {
  it("register returns 202 with no session and an unverified, unstarted trial", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, password: PASSWORD, name: "Verify Tester", organization: "Verify Co" });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).toMatchObject({ ok: true, email: EMAIL, verificationRequired: true });

    // No session is established at registration.
    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    expect(cookies.some((c) => c.startsWith("sid="))).toBe(false);

    // The account exists but is unverified, and the trial clock has not started.
    const { db, usersTable, organizationsTable } = dbMod;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, EMAIL));
    expect(user, "registered user should exist").toBeTruthy();
    expect(user.emailVerifiedAt).toBeNull();
    userId = user.id;
    orgId = user.organizationId ?? undefined;
    expect(orgId, "registered user should be bound to an org").toBeTruthy();

    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId as number));
    expect(org.subscriptionStatus).toBe("trialing");
    expect(org.trialEndsAt, "trial clock must not start at registration").toBeNull();

    // No first client is provisioned until the email is verified.
    const clientsBefore = await db
      .select()
      .from(dbMod.clientsTable)
      .where(eq(dbMod.clientsTable.organizationId, orgId as number));
    expect(clientsBefore.length, "no client should exist before verification").toBe(0);
  });

  it("a duplicate register stays enumeration-safe (202, never 409)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: EMAIL, password: "Different!9999", name: "Someone Else" });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body).toMatchObject({ ok: true, email: EMAIL, verificationRequired: true });
  });

  it("login is blocked with 403 email_unverified before verification", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe("email_unverified");
  });

  it("verify-email starts the trial, establishes a session, and returns the trial-aware user", async () => {
    expect(userId, "register test must run first").toBeTruthy();
    const token = await createVerificationToken(userId as number);

    const agent = request.agent(app);
    const res = await agent.post("/api/auth/verify-email").send({ token });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.email).toBe(EMAIL);
    expect(res.body.effectiveTier).toBe("trial");
    expect(res.body.readOnly).toBe(false);
    expect(res.body.trialEndsAt, "trial clock must start at verification").toBeTruthy();
    expect(res.body.trialDaysRemaining).toBeGreaterThanOrEqual(13);
    expect(res.body.trialDaysRemaining).toBeLessThanOrEqual(14);

    // The verify response carried a session: the agent can now read /me.
    const me = await agent.get("/api/auth/me");
    expect(me.status, JSON.stringify(me.body)).toBe(200);
    expect(me.body.email).toBe(EMAIL);

    // The org's trial clock is now persisted.
    const { db, organizationsTable, clientsTable } = dbMod;
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId as number));
    expect(org.trialEndsAt).toBeTruthy();

    // The first client is provisioned at verification.
    const clientsAfter = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.organizationId, orgId as number));
    expect(clientsAfter.length, "first client should be created at verification").toBeGreaterThanOrEqual(
      1,
    );

    // The same token cannot be replayed.
    const reuse = await request(app).post("/api/auth/verify-email").send({ token });
    expect(reuse.status, JSON.stringify(reuse.body)).toBe(400);
    expect(reuse.body.code).toBe("invalid_token");
  });
});
