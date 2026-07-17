import { db } from "@workspace/db";
import { brandThemesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { EmailBrand } from "./mailer";

/**
 * Resolve the branding an email should wear for a given recipient's tenant.
 *
 * Tenancy mirrors the app: a user's brand is their partner's theme (partnerId), else the
 * platform theme. Returns safe Synops defaults when no theme row exists, so callers never
 * need to null-check. Best-effort — any DB hiccup falls back to defaults rather than throwing.
 */
export async function resolveEmailBrand(partnerId: string | null | undefined): Promise<EmailBrand> {
  const tenantId = partnerId ?? "platform";
  try {
    const t = await db.query.brandThemesTable.findFirst({ where: eq(brandThemesTable.tenantId, tenantId) });
    return {
      displayName: t?.displayName || "Synops Praxis",
      logoUrl: t?.logoUrl || null,
      primaryColor: t?.primaryColor || "#0F6E56",
      senderName: t?.emailSenderName || t?.displayName || null,
    };
  } catch {
    return { displayName: "Synops Praxis", logoUrl: null, primaryColor: "#0F6E56", senderName: null };
  }
}
