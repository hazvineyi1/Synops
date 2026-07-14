import { Router } from "express";
import { db } from "@workspace/db";
import { brandThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

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

// GET /brand/theme
router.get("/brand/theme", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? "platform";
  let theme = await db.query.brandThemesTable.findFirst({
    where: eq(brandThemesTable.tenantId, tenantId),
  });
  if (!theme) {
    // Return default platform theme
    const [created] = await db
      .insert(brandThemesTable)
      .values({
        tenantId,
        tenantType: user.partnerId ? "partner" : "platform",
        displayName: "Synops Praxis",
        primaryColor: "#1a1f36",
        secondaryColor: "#3b82f6",
        accentColor: "#10b981",
        credentialTitle: "PraxisMark",
      })
      .returning();
    theme = created;
  }
  res.json(toThemeResponse(theme));
});

// PUT /brand/theme
router.put("/brand/theme", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? "platform";
  const existing = await db.query.brandThemesTable.findFirst({
    where: eq(brandThemesTable.tenantId, tenantId),
  });

  const fields = {
    displayName: req.body.displayName,
    primaryColor: req.body.primaryColor,
    secondaryColor: req.body.secondaryColor,
    accentColor: req.body.accentColor,
    logoUrl: req.body.logoUrl,
    faviconUrl: req.body.faviconUrl,
    fontFamily: req.body.fontFamily,
    credentialTitle: req.body.credentialTitle,
    emailSenderName: req.body.emailSenderName,
    customDomain: req.body.customDomain,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(brandThemesTable)
      .set(fields)
      .where(eq(brandThemesTable.tenantId, tenantId))
      .returning();
    res.json(toThemeResponse(updated));
  } else {
    const [created] = await db
      .insert(brandThemesTable)
      .values({ ...fields, tenantId, tenantType: user.partnerId ? "partner" : "platform" })
      .returning();
    res.json(toThemeResponse(created));
  }
});

export default router;
