import { Router } from "express";
import { db } from "@workspace/db";
import { brandThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router = Router();

type TenantType = "platform" | "partner" | "organisation";

function toThemeResponse(t: typeof brandThemesTable.$inferSelect) {
  return {
    id: t.id,
    tenantId: t.tenantId,
    tenantType: t.tenantType,
    displayName: t.displayName,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    accentColor: t.accentColor,
    logoUrl: t.logoUrl,
    faviconUrl: t.faviconUrl,
    fontFamily: t.fontFamily,
    credentialTitle: t.credentialTitle,
    emailSenderName: t.emailSenderName,
    customDomain: t.customDomain,
    updatedAt: t.updatedAt.toISOString(),
  };
}

async function getOrCreateTheme(tenantId: string, tenantType: TenantType) {
  const theme = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, tenantId) });
  if (theme) return theme;
  const [created] = await db
    .insert(brandThemesTable)
    .values({
      tenantId,
      tenantType,
      displayName: "Synops Praxis",
      primaryColor: "#1a1f36",
      secondaryColor: "#3b82f6",
      accentColor: "#10b981",
      credentialTitle: "PraxisMark",
    })
    .returning();
  return created;
}

function bodyFields(body: any) {
  return {
    displayName: body.displayName,
    primaryColor: body.primaryColor,
    secondaryColor: body.secondaryColor,
    accentColor: body.accentColor,
    logoUrl: body.logoUrl,
    faviconUrl: body.faviconUrl,
    fontFamily: body.fontFamily,
    credentialTitle: body.credentialTitle,
    emailSenderName: body.emailSenderName,
    customDomain: body.customDomain,
    updatedAt: new Date(),
  };
}

async function upsertTheme(tenantId: string, tenantType: TenantType, body: any) {
  const existing = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, tenantId) });
  const fields = bodyFields(body);
  if (existing) {
    const [updated] = await db.update(brandThemesTable).set(fields).where(eq(brandThemesTable.tenantId, tenantId)).returning();
    return updated;
  }
  const [created] = await db.insert(brandThemesTable).values({ ...fields, tenantId, tenantType }).returning();
  return created;
}

// GET /brand/theme — the caller's own tenant theme (any authenticated user; used to render branding).
router.get("/brand/theme", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? "platform";
  const theme = await getOrCreateTheme(tenantId, user.partnerId ? "partner" : "platform");
  res.json(toThemeResponse(theme));
});

// PUT /brand/theme — edit the caller's own tenant theme. White-label control is top-tier only.
router.put("/brand/theme", requireAuth, requireRole("super_admin", "partner_admin"), async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? "platform";
  const theme = await upsertTheme(tenantId, user.partnerId ? "partner" : "platform", req.body);
  res.json(toThemeResponse(theme));
});

// GET /brand/partner/:partnerId — a specific partner's theme (super_admin manages any partner).
router.get("/brand/partner/:partnerId", requireAuth, requireRole("super_admin"), async (req, res) => {
  const theme = await getOrCreateTheme(req.params.partnerId, "partner");
  res.json(toThemeResponse(theme));
});

// PUT /brand/partner/:partnerId — edit a specific partner's theme (super_admin only).
router.put("/brand/partner/:partnerId", requireAuth, requireRole("super_admin"), async (req, res) => {
  const theme = await upsertTheme(req.params.partnerId, "partner", req.body);
  res.json(toThemeResponse(theme));
});

export default router;
