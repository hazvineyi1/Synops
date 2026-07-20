import { Router } from "express";
import { db } from "@workspace/db";
import { partnersTable, brandThemesTable, organisationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Public partner landing page data. GET /p/:slug returns the partner's brand kit and its
 * organisations so the platform can render a branded marketing/entry page (no auth) - the link a
 * partner shares with its own partners, organisations and stakeholders.
 */
const router = Router();

router.get("/p/:slug", async (req, res) => {
  const partner = await db.query.partnersTable.findFirst({ where: eq(partnersTable.slug, req.params.slug) });
  if (!partner) { res.status(404).json({ error: "Not found" }); return; }
  const brand = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, partner.id) });
  let orgs: { name: string; industry: string | null }[] = [];
  try {
    orgs = await db.select({ name: organisationsTable.name, industry: organisationsTable.industry })
      .from(organisationsTable).where(eq(organisationsTable.partnerId, partner.id));
  } catch { orgs = []; }
  res.json({
    slug: partner.slug,
    name: partner.name,
    brand: brand
      ? {
          displayName: brand.displayName,
          primaryColor: brand.primaryColor,
          secondaryColor: brand.secondaryColor,
          accentColor: brand.accentColor,
          logoUrl: brand.logoUrl,
          fontFamily: brand.fontFamily,
        }
      : null,
    orgs,
  });
});

export default router;
