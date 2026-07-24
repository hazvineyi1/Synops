import { Router } from "express";
import { db } from "@workspace/db";
import { brandThemesTable, partnersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { resolvePublicBrandByHost, normaliseHost } from "../lib/brandResolve";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const cleanHex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim() : fallback);
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

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

// GET /brand/public — PUBLIC branding for a hostname (custom domains). No auth: this powers the
// pre-auth/login page theming on a partner's custom domain. Uses the Host header, or an explicit
// ?host= override (useful for previews). Returns the platform default for the app's own domains.
router.get("/brand/public", async (req, res) => {
  const host = (typeof req.query.host === "string" && req.query.host) || req.headers.host || "";
  const brand = await resolvePublicBrandByHost(normaliseHost(host));
  res.json(brand);
});

// GET /brand/theme — the caller's own tenant theme (any authenticated user; used to render branding).
router.get("/brand/theme", requireAuth, async (req, res) => {
  const user = req.dbUser!;
  const tenantId = user.partnerId ?? "platform";
  const theme = await getOrCreateTheme(tenantId, user.partnerId ? "partner" : "platform");
  // Include the partner slug so the branding page can open a true live preview of the branded
  // sign-in (/sign-in?p=<slug>), which resolves the brand regardless of host or session.
  let slug: string | null = null;
  if (user.partnerId) {
    const partner = await db.query.partnersTable.findFirst({
      where: eq(partnersTable.id, user.partnerId),
      columns: { slug: true },
    });
    slug = partner?.slug ?? null;
  }
  res.json({ ...toThemeResponse(theme), slug });
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

/**
 * POST /brand/ai-generate — derive a white-label brand kit from a logo (and optional business card
 * + website + name) using Claude vision. Returns colours + personalization; it does NOT save -- the
 * client previews and then applies via PUT /brand/theme. Top-tier only.
 */
router.post("/brand/ai-generate", requireAuth, requireRole("super_admin", "partner_admin"), async (req, res) => {
  const { logoBase64, logoMediaType, cardBase64, cardMediaType, website, businessName } = req.body ?? {};
  if (!logoBase64 || !IMG_TYPES.includes(String(logoMediaType))) {
    res.status(400).json({ error: "A logo image (logoBase64 + logoMediaType png/jpeg/webp) is required." });
    return;
  }

  const content: any[] = [{ type: "image", source: { type: "base64", media_type: logoMediaType, data: logoBase64 } }];
  if (cardBase64 && IMG_TYPES.includes(String(cardMediaType))) {
    content.push({ type: "image", source: { type: "base64", media_type: cardMediaType, data: cardBase64 } });
  }
  content.push({
    type: "text",
    text: `You are a senior brand designer. From the logo${cardBase64 ? " and business card" : ""} above` +
      `${website ? `, the website ${website},` : ""}${businessName ? ` for "${businessName}",` : ""} produce a white-label brand kit for their learning platform.\n\n` +
      `Rules:\n- Derive colours from the logo. primaryColor is the dominant brand colour (used for headers/buttons), it must be dark/saturated enough for white text on it. secondaryColor and accentColor complement it.\n` +
      `- fontFamily is a websafe CSS font stack that suits the brand (e.g. "Inter, system-ui, sans-serif").\n` +
      `- displayName is the brand's name. credentialTitle is a short certificate name like "<Brand> Certificate". tagline is one short sentence.\n` +
      `- Return ONLY valid JSON, no markdown:\n{"displayName":"...","primaryColor":"#RRGGBB","secondaryColor":"#RRGGBB","accentColor":"#RRGGBB","fontFamily":"...","credentialTitle":"...","tagline":"..."}`,
  });

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    });
    const block = message.content[0];
    const raw = block && block.type === "text" ? block.text : "{}";
    let parsed: any;
    try { parsed = JSON.parse(raw); }
    catch { const m = raw.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }

    res.json({
      displayName: typeof parsed.displayName === "string" ? parsed.displayName.slice(0, 80) : (businessName ?? ""),
      primaryColor: cleanHex(parsed.primaryColor, "#1a1f36"),
      secondaryColor: cleanHex(parsed.secondaryColor, "#3b82f6"),
      accentColor: cleanHex(parsed.accentColor, "#10b981"),
      fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily.slice(0, 120) : "Inter, system-ui, sans-serif",
      credentialTitle: typeof parsed.credentialTitle === "string" ? parsed.credentialTitle.slice(0, 60) : "Certificate",
      tagline: typeof parsed.tagline === "string" ? parsed.tagline.slice(0, 160) : "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI request failed";
    const notConfigured = /not configured/i.test(msg);
    res.status(notConfigured ? 503 : 502).json({ error: notConfigured ? "AI is not configured on this server (set the AI env vars)." : "Could not analyse the brand image. You can still set colours manually." });
  }
});

export default router;
