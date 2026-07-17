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

/** Resolve a tenant's public brand (partner theme, else platform). Never throws. */
export async function resolvePublicBrand(partnerId?: string | null): Promise<PublicBrand> {
  const tenantId = partnerId ?? "platform";
  try {
    const t = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, tenantId) });
    if (!t) return DEFAULT_PUBLIC_BRAND;
    return {
      displayName: t.displayName || DEFAULT_PUBLIC_BRAND.displayName,
      logoUrl: t.logoUrl || null,
      primaryColor: t.primaryColor || DEFAULT_PUBLIC_BRAND.primaryColor,
      secondaryColor: t.secondaryColor || null,
      accentColor: t.accentColor || DEFAULT_PUBLIC_BRAND.accentColor,
      credentialTitle: t.credentialTitle || DEFAULT_PUBLIC_BRAND.credentialTitle,
    };
  } catch {
    return DEFAULT_PUBLIC_BRAND;
  }
}
