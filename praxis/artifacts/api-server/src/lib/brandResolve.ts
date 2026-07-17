import { db } from "@workspace/db";
import { brandThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Public-safe tenant branding used by unauthenticated surfaces (the public verification page and
 * the credential certificate PDF). Superset of EmailBrand — adds the secondary/accent colours and
 * the credential title. Resolved server-side from a tenant key so the public verify page (which
 * cannot call the auth-gated /brand/theme) can still be branded.
 */
export interface PublicBrand {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  accentColor: string;
  credentialTitle: string;
}

const DEFAULT_PUBLIC_BRAND: PublicBrand = {
  displayName: "Synops Praxis",
  logoUrl: null,
  primaryColor: "#1a1f36",
  secondaryColor: null,
  accentColor: "#10b981",
  credentialTitle: "PraxisMark",
};

function toPublicBrand(t: typeof brandThemesTable.$inferSelect | undefined | null): PublicBrand {
  if (!t) return DEFAULT_PUBLIC_BRAND;
  return {
    displayName: t.displayName || DEFAULT_PUBLIC_BRAND.displayName,
    logoUrl: t.logoUrl || null,
    primaryColor: t.primaryColor || DEFAULT_PUBLIC_BRAND.primaryColor,
    secondaryColor: t.secondaryColor || null,
    accentColor: t.accentColor || DEFAULT_PUBLIC_BRAND.accentColor,
    credentialTitle: t.credentialTitle || DEFAULT_PUBLIC_BRAND.credentialTitle,
  };
}

/** Resolve a tenant's public brand (partner theme, else platform). Never throws. */
export async function resolvePublicBrand(partnerId?: string | null): Promise<PublicBrand> {
  const tenantId = partnerId ?? "platform";
  try {
    const t = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, tenantId) });
    return toPublicBrand(t);
  } catch {
    return DEFAULT_PUBLIC_BRAND;
  }
}

/** Normalise a Host header to a bare hostname (strip port, lowercase, trim). */
export function normaliseHost(host?: string | null): string {
  return (host || "").split(":")[0].trim().toLowerCase();
}

/**
 * Resolve branding for an incoming request hostname. Powers custom domains: a partner that has
 * set brand_themes.customDomain to (e.g.) learn.theiracademy.com gets their theme on that host —
 * including the pre-auth login/marketing pages, before any user session exists. Falls back to the
 * platform default for the app's own domains or an unknown host. Never throws.
 */
export async function resolvePublicBrandByHost(host?: string | null): Promise<PublicBrand> {
  const h = normaliseHost(host);
  if (!h) return DEFAULT_PUBLIC_BRAND;
  try {
    const t = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.customDomain, h) });
    return toPublicBrand(t);
  } catch {
    return DEFAULT_PUBLIC_BRAND;
  }
}
