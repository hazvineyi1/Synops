import { Router } from "express";
import { db } from "@workspace/db";
import { credentialsTable, evidenceRecordsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { resolvePublicBrand } from "../lib/brandResolve";
import { buildCredentialPdf } from "../lib/credentialCert";

const router = Router();

const slug = (s: string) => (s || "credential").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "credential";

function toCredentialResponse(c: typeof credentialsTable.$inferSelect, baseUrl: string) {
  const verificationUrl = `${baseUrl}/verify/${c.id}`;
  return {
    id: c.id,
    userId: c.userId,
    moduleId: c.moduleId,
    moduleTitle: c.moduleTitle,
    issuedAt: c.issuedAt.toISOString(),
    decayDate: c.decayDate.toISOString(),
    status: c.status,
    masteryScore: Number(c.masteryScore),
    evidenceSummary: c.evidenceSummary,
    verificationUrl,
    badgeUrl: c.badgeUrl,
    partnerName: c.partnerName,
  };
}

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] ?? "https";
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

// GET /credentials
router.get("/credentials", requireAuth, async (req, res) => {
  const credentials = await db
    .select()
    .from(credentialsTable)
    .where(eq(credentialsTable.userId, req.userId!))
    .orderBy(desc(credentialsTable.issuedAt));
  const baseUrl = getBaseUrl(req);
  res.json(credentials.map(c => toCredentialResponse(c, baseUrl)));
});

// GET /credentials/:credentialId
router.get("/credentials/:credentialId", requireAuth, async (req, res) => {
  const credential = await db.query.credentialsTable.findFirst({
    where: eq(credentialsTable.id, req.params.credentialId),
  });
  if (!credential) { res.status(404).json({ error: "Not found" }); return; }
  res.json(toCredentialResponse(credential, getBaseUrl(req)));
});

// GET /credentials/:credentialId/certificate.pdf — tenant-branded certificate download.
// PUBLIC, like /verify: it renders only what the public verification page already shows, keyed by
// the unguessable credential UUID, so employers verifying a credential can download the PDF too.
router.get("/credentials/:credentialId/certificate.pdf", async (req, res) => {
  const credential = await db.query.credentialsTable.findFirst({
    where: eq(credentialsTable.id, req.params.credentialId),
  });
  if (!credential) { res.status(404).json({ error: "Not found" }); return; }

  const holder = await db.query.usersTable.findFirst({ where: eq(usersTable.id, credential.userId) });
  const holderName =
    (holder ? `${holder.firstName ?? ""} ${holder.lastName ?? ""}`.trim() || holder.email : "") || "Learner";
  const brand = await resolvePublicBrand(credential.partnerId);
  const buf = await buildCredentialPdf({
    holderName,
    moduleTitle: credential.moduleTitle,
    issuedAt: credential.issuedAt,
    decayDate: credential.decayDate,
    masteryScore: credential.masteryScore != null ? Number(credential.masteryScore) : null,
    status: credential.status,
    credentialId: credential.id,
    verificationUrl: `${getBaseUrl(req)}/verify/${credential.id}`,
    brand,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${slug(brand.credentialTitle)}-${slug(holderName)}.pdf"`);
  res.end(buf);
});

// GET /verify/:credentialId — PUBLIC, no auth
router.get("/verify/:credentialId", async (req, res) => {
  const credential = await db.query.credentialsTable.findFirst({
    where: eq(credentialsTable.id, req.params.credentialId),
  });
  if (!credential) { res.status(404).json({ error: "Credential not found" }); return; }

  // Check decay
  if (new Date() > credential.decayDate && credential.status === "valid") {
    await db
      .update(credentialsTable)
      .set({ status: "expired" })
      .where(eq(credentialsTable.id, credential.id));
    credential.status = "expired";
  }

  // Get holder
  const holder = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, credential.userId),
  });

  // Get evidence trail
  const evidence = await db
    .select()
    .from(evidenceRecordsTable)
    .where(eq(evidenceRecordsTable.credentialId, credential.id))
    .orderBy(evidenceRecordsTable.recordedAt);

  // Also get evidence by userId + sessionId linked evidence
  const sessionEvidence = await db
    .select()
    .from(evidenceRecordsTable)
    .where(eq(evidenceRecordsTable.userId, credential.userId))
    .orderBy(evidenceRecordsTable.recordedAt)
    .limit(20);

  const allEvidence = [...evidence, ...sessionEvidence.filter(e => !evidence.find(x => x.id === e.id))];

  // Tenant branding for the public page (it cannot call the auth-gated /brand/theme).
  const brand = await resolvePublicBrand(credential.partnerId);

  res.json({
    credentialId: credential.id,
    holderName: holder ? `${holder.firstName ?? ""} ${holder.lastName ?? ""}`.trim() || holder.email : "Unknown",
    moduleTitle: credential.moduleTitle,
    issuedAt: credential.issuedAt.toISOString(),
    decayDate: credential.decayDate.toISOString(),
    status: credential.status,
    masteryScore: Number(credential.masteryScore),
    evidenceItems: allEvidence.slice(0, 10).map(e => ({
      type: e.type,
      description: e.description,
      recordedAt: e.recordedAt.toISOString(),
      score: e.score ? Number(e.score) : null,
    })),
    partnerName: credential.partnerName,
    verifiedAt: new Date().toISOString(),
    certificateUrl: `${getBaseUrl(req)}/api/credentials/${credential.id}/certificate.pdf`,
    brand: {
      displayName: brand.displayName,
      logoUrl: brand.logoUrl,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      accentColor: brand.accentColor,
      credentialTitle: brand.credentialTitle,
    },
  });
});

export default router;
