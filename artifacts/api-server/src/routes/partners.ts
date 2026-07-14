import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable, usersTable, organisationsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

function toPartnerResponse(p: typeof partnersTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    contactEmail: p.contactEmail,
    orgCount: p.orgCount,
    learnerCount: p.learnerCount,
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /partners
router.get("/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  const partners = await db.select().from(partnersTable);
  res.json(partners.map(toPartnerResponse));
});

// POST /partners
router.post("/partners", requireAuth, requireRole("super_admin"), async (req, res) => {
  const { name, slug, contactEmail } = req.body;
  const [partner] = await db
    .insert(partnersTable)
    .values({ name, slug, contactEmail, status: "onboarding" })
    .returning();
  res.status(201).json(toPartnerResponse(partner));
});

// GET /partners/:partnerId
router.get("/partners/:partnerId", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  // super_admin can see all; partner_admin can see own
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const partner = await db.query.partnersTable.findFirst({
    where: eq(partnersTable.id, partnerId),
  });
  if (!partner) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(toPartnerResponse(partner));
});

// PATCH /partners/:partnerId
router.patch("/partners/:partnerId", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, contactEmail, status } = req.body;
  const [updated] = await db
    .update(partnersTable)
    .set({ name, contactEmail, status, updatedAt: new Date() })
    .where(eq(partnersTable.id, partnerId))
    .returning();
  res.json(toPartnerResponse(updated));
});

// GET /partners/:partnerId/stats
router.get("/partners/:partnerId/stats", requireAuth, async (req, res) => {
  const { partnerId } = req.params;
  const user = req.dbUser!;
  if (user.role !== "super_admin" && user.partnerId !== partnerId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [orgCountResult] = await db
    .select({ count: count() })
    .from(organisationsTable)
    .where(eq(organisationsTable.partnerId, partnerId));
  const [learnerCountResult] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.partnerId, partnerId));

  res.json({
    partnerId,
    totalLearners: Number(learnerCountResult.count),
    activeEnrolments: 0,
    credentialsIssued: 0,
    completionRate: 0,
    orgCount: Number(orgCountResult.count),
  });
});

export default router;
