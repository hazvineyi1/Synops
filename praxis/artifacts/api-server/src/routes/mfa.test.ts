import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql, inArray, eq } from "drizzle-orm";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { hashPassword } from "../lib/auth";
import { totp } from "../lib/totp";
import { createOtpChallenge, verifyOtpChallenge, regenerateBackupCodes, consumeBackupCode, syncMfaEnabled } from "../lib/mfaService";

/**
 * Multi-factor auth end-to-end proof. Boots the real app over HTTP and drives enrolment + login.
 *
 * Covers: TOTP enrol -> verify -> backup codes issued once; the login challenge advertises the
 * enrolled methods; a valid TOTP satisfies login and issues a session; a backup code satisfies
 * login and is single-use; email-OTP challenge create/verify (expiry + wrong-code) at the service
 * level; and the gate mirror (users.mfa_enabled follows verified factors).
 *
 * DB-backed; skips cleanly with no database.
 */

const SUFFIX = `mfa-${Date.now()}`;
let server: Server;
let base: string;
let dbMod: typeof import("@workspace/db");
let hasDb = false;

const PASSWORD = "Sup3r-Secret-Pw!";
const userId = `u-${SUFFIX}`;
const adminId = `u-adm-${SUFFIX}`;
const email = `mfa-${SUFFIX}@t.test`;
const adminEmail = `adm-${SUFFIX}@t.test`;
const tok = `tok-${SUFFIX}`;

async function req(path: string, init?: RequestInit, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { cookie: `praxis_session=${token}` } : {}), ...(init?.headers ?? {}) },
  });
}

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret-32-chars-minimum-length";
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
    return;
  }
  const { db, usersTable, authSessionsTable } = dbMod;
  await db.insert(usersTable).values([
    { id: userId, email, role: "learner", status: "active", passwordHash: hashPassword(PASSWORD) },
    { id: adminId, email: adminEmail, role: "super_admin", status: "active", passwordHash: hashPassword(PASSWORD) },
  ]);
  await db.insert(authSessionsTable).values([{ token: tok, userId, expiresAt: new Date(Date.now() + 3600_000) }]);

  const app = (await import("../app")).default;
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!hasDb) return;
  const { db, usersTable, authSessionsTable, mfaFactorsTable, mfaBackupCodesTable, mfaChallengesTable } = dbMod;
  await db.delete(mfaFactorsTable).where(inArray(mfaFactorsTable.userId, [userId, adminId])).catch(() => {});
  await db.delete(mfaBackupCodesTable).where(inArray(mfaBackupCodesTable.userId, [userId, adminId])).catch(() => {});
  await db.delete(mfaChallengesTable).where(inArray(mfaChallengesTable.userId, [userId, adminId])).catch(() => {});
  await db.delete(authSessionsTable).where(inArray(authSessionsTable.token, [tok])).catch(() => {});
  await db.delete(usersTable).where(inArray(usersTable.id, [userId, adminId])).catch(() => {});
});

describe("MFA multi-factor", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("mfa: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  let totpSecret = "";
  let backupCodes: string[] = [];

  it("enrols a TOTP factor: setup -> verify -> backup codes issued once", async () => {
    if (!hasDb) return;
    const setup = await req("/auth/mfa/totp/setup", { method: "POST", body: "{}" }, tok);
    expect(setup.status).toBe(200);
    const { secret } = await setup.json();
    totpSecret = secret;
    expect(secret).toBeTruthy();

    const verify = await req("/auth/mfa/totp/verify", { method: "POST", body: JSON.stringify({ code: totp(secret) }) }, tok);
    expect(verify.status).toBe(200);
    const body = await verify.json();
    expect(body.enrolled).toBe(true);
    expect(Array.isArray(body.backupCodes)).toBe(true);
    expect(body.backupCodes.length).toBeGreaterThanOrEqual(8);
    backupCodes = body.backupCodes;

    const factors = await (await req("/auth/mfa/factors", {}, tok)).json();
    expect(factors.factors.some((f: { type: string; verified: boolean }) => f.type === "totp" && f.verified)).toBe(true);
    expect(factors.backupCodesRemaining).toBe(backupCodes.length);
  });

  it("advertises the enrolled methods at login and requires the second factor", async () => {
    if (!hasDb) return;
    const res = await req("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.methods).toContain("totp");
    expect(body.user).toBeUndefined(); // no session yet
  });

  it("accepts a valid TOTP code and issues a session", async () => {
    if (!hasDb) return;
    const res = await req("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, code: totp(totpSecret) }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user?.email).toBe(email);
    expect(res.headers.get("set-cookie") ?? "").toContain("praxis_session=");
  });

  it("rejects a wrong second factor", async () => {
    if (!hasDb) return;
    const res = await req("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, code: "000000", method: "" }) });
    expect(res.status).toBe(401);
  });

  it("accepts a backup code once, then rejects its reuse", async () => {
    if (!hasDb) return;
    const code = backupCodes[0];
    const ok = await req("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, method: "backup", code }) });
    expect(ok.status).toBe(200);
    const reuse = await req("/auth/login", { method: "POST", body: JSON.stringify({ email, password: PASSWORD, method: "backup", code }) });
    expect(reuse.status).toBe(401);
  });

  it("email-OTP challenge: verifies the right code, rejects a wrong one, single-use", async () => {
    if (!hasDb) return;
    const code = await createOtpChallenge(userId, "email_otp", email);
    expect(await verifyOtpChallenge(userId, "email_otp", "000000")).toBe(false); // wrong
    expect(await verifyOtpChallenge(userId, "email_otp", code)).toBe(true); // right
    expect(await verifyOtpChallenge(userId, "email_otp", code)).toBe(false); // consumed
  });

  it("keeps users.mfa_enabled in sync with verified factors (the gate mirror)", async () => {
    if (!hasDb) return;
    const enabled = await syncMfaEnabled(userId);
    expect(enabled).toBe(true); // has a verified totp factor
    const { db, usersTable } = dbMod;
    const [row] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    expect(row.mfaEnabled).toBe(true);
  });

  it("still signs in a legacy TOTP user whose inline secret was not yet backfilled", async () => {
    if (!hasDb) return;
    const { db, usersTable } = dbMod;
    // A user enrolled under the OLD inline scheme: mfa_enabled + mfa_secret on users, NO mfa_factors.
    const legacyId = `u-legacy-${SUFFIX}`;
    const legacyEmail = `legacy-${SUFFIX}@t.test`;
    const secret = "GEZDGNBVGY3TQOJQ"; // fixed base32 test secret
    await db.insert(usersTable).values({
      id: legacyId, email: legacyEmail, role: "org_admin", status: "active",
      passwordHash: hashPassword(PASSWORD), mfaEnabled: true, mfaSecret: secret,
    });
    const res = await req("/auth/login", { method: "POST", body: JSON.stringify({ email: legacyEmail, password: PASSWORD, code: totp(secret) }) });
    expect(res.status).toBe(200);
    expect((await res.json()).user?.email).toBe(legacyEmail);
    await db.delete(usersTable).where(eq(usersTable.id, legacyId));
  });

  it("blocks removing the last verified factor while the role requires MFA", async () => {
    if (!hasDb) return;
    const { db, mfaFactorsTable } = dbMod;
    // Give the admin exactly one verified factor, then log them in a session.
    const [factor] = await db.insert(mfaFactorsTable).values({ userId: adminId, type: "totp", label: "Auth", secret: "GEZDGNBVGY3TQOJQ", verifiedAt: new Date() }).returning();
    await syncMfaEnabled(adminId);
    const admTok = `admtok-${SUFFIX}`;
    await dbMod.db.insert(dbMod.authSessionsTable).values({ token: admTok, userId: adminId, expiresAt: new Date(Date.now() + 3600_000) });
    const res = await req(`/auth/mfa/factors/${factor.id}`, { method: "DELETE" }, admTok);
    expect(res.status).toBe(400); // cannot remove the last one while required
    await db.delete(dbMod.authSessionsTable).where(eq(dbMod.authSessionsTable.token, admTok));
  });
});
