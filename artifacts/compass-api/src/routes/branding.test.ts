import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import type { Express } from "express";

/**
 * DB-backed proof of read-time entitlement revocation on GET /branding.
 *
 * White-label branding is only ever served through a custom-domain host match,
 * so the host mapping is the customDomain entitlement and the cosmetic fields are
 * the whiteLabel entitlement. When an org's EFFECTIVE tier no longer includes
 * those features (a downgrade, by planTier or by subscriptionStatus), the public
 * endpoint suppresses its branding and returns the neutral default instead of
 * clearing the stored config. The endpoint never 402s or reveals that a host
 * matched-but-unentitled (it must not become a domain/tier oracle), and it reads
 * the raw Host header only (X-Forwarded-Host can never spoof another tenant).
 *
 * Fixtures are created directly in the DB (the test imports `app`, not the server
 * entrypoint, so the startup seed does not run) under unique slugs/domains and
 * are removed afterwards.
 */

const SUFFIX = `branding-${Date.now()}`;

let app: Express;
let dbMod: typeof import("@workspace/compass-db");

const orgIds: number[] = [];

const entDomain = `ent-${SUFFIX}.example.org`;
const proDomain = `pro-${SUFFIX}.example.org`;
const trialDomain = `trial-${SUFFIX}.example.org`;
const internalDomain = `internal-${SUFFIX}.example.org`;
const canceledDomain = `cancel-${SUFFIX}.example.org`;

const ENT_BRANDING = {
  name: "Enterprise Academy",
  accentColor: "#0a7c5b",
  tagline: "Designing better outcomes",
  logoUrl: "https://cdn.example.org/ent-logo.svg",
};

beforeAll(async () => {
  process.env.SESSION_SECRET ??= "test-only-secret";
  dbMod = await import("@workspace/compass-db");
  app = (await import("../app")).default;

  const { db, organizationsTable } = dbMod;

  const rows = await db
    .insert(organizationsTable)
    .values([
      {
        name: ENT_BRANDING.name,
        slug: `${SUFFIX}-ent`,
        type: "school",
        planTier: "enterprise",
        domain: entDomain,
        accentColor: ENT_BRANDING.accentColor,
        tagline: ENT_BRANDING.tagline,
        logoUrl: ENT_BRANDING.logoUrl,
      },
      {
        name: "Professional Academy",
        slug: `${SUFFIX}-pro`,
        type: "school",
        planTier: "professional",
        domain: proDomain,
        accentColor: "#123456",
        tagline: "Pro tagline",
        logoUrl: "https://cdn.example.org/pro-logo.svg",
      },
      {
        name: "Trial Academy",
        slug: `${SUFFIX}-trial`,
        type: "school",
        planTier: "trial",
        domain: trialDomain,
        accentColor: "#654321",
        tagline: "Trial tagline",
      },
      {
        name: "Synops Internal",
        slug: `${SUFFIX}-internal`,
        type: "internal",
        planTier: "trial",
        domain: internalDomain,
        accentColor: "#2b2b2b",
        tagline: "Internal tagline",
      },
      {
        // Purchased enterprise but the subscription lapsed: effective tier falls
        // back to trial, so branding must be revoked even though planTier is high.
        name: "Lapsed Academy",
        slug: `${SUFFIX}-cancel`,
        type: "school",
        planTier: "enterprise",
        subscriptionStatus: "canceled",
        domain: canceledDomain,
        accentColor: "#abcdef",
        tagline: "Lapsed tagline",
        logoUrl: "https://cdn.example.org/cancel-logo.svg",
      },
    ])
    .returning({ id: organizationsTable.id });
  for (const r of rows) orgIds.push(r.id);
}, 30000);

afterAll(async () => {
  const { db, organizationsTable } = dbMod;
  try {
    if (orgIds.length > 0) {
      await db.delete(organizationsTable).where(inArray(organizationsTable.id, orgIds));
    }
  } catch (err) {
    console.warn(`[branding.test] fixture cleanup failed: ${(err as Error).message}`);
  }
  try {
    await dbMod.pool.end();
  } catch {
    // Pool may already be closed when files share a module registry.
  }
}, 30000);

function getBranding(host: string) {
  return request(app).get("/api/branding").set("Host", host);
}

describe("GET /branding read-time entitlement revocation", () => {
  it("serves white-label branding for an entitled (enterprise) org on its domain", async () => {
    const res = await getBranding(entDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(true);
    expect(res.body.organization).toMatchObject({
      name: ENT_BRANDING.name,
      slug: `${SUFFIX}-ent`,
      type: "school",
      accentColor: ENT_BRANDING.accentColor,
      tagline: ENT_BRANDING.tagline,
      logoUrl: ENT_BRANDING.logoUrl,
    });
  });

  it("serves branding for an internal org (always enterprise) on its domain", async () => {
    const res = await getBranding(internalDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(true);
    expect(res.body.organization?.type).toBe("internal");
  });

  it("suppresses branding for a professional org (no customDomain entitlement)", async () => {
    const res = await getBranding(proDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(false);
    expect(res.body.organization).toBeNull();
  });

  it("suppresses branding for a trial org", async () => {
    const res = await getBranding(trialDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(false);
    expect(res.body.organization).toBeNull();
  });

  it("suppresses branding when the subscription lapsed despite an enterprise planTier", async () => {
    const res = await getBranding(canceledDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(false);
    expect(res.body.organization).toBeNull();
  });

  it("ignores X-Forwarded-Host so a custom domain cannot be spoofed", async () => {
    const res = await request(app)
      .get("/api/branding")
      .set("Host", "unmatched-host.example.com")
      .set("X-Forwarded-Host", entDomain);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(false);
    expect(res.body.organization).toBeNull();
  });

  it("returns the neutral default for a host that matches no org", async () => {
    const res = await getBranding(`nobody-${SUFFIX}.example.com`);
    expect(res.status).toBe(200);
    expect(res.body.branded).toBe(false);
    expect(res.body.organization).toBeNull();
  });
});
