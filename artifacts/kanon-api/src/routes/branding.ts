import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, organizationsTable } from "@workspace/kanon-db";
import { normalizeHost } from "../lib/branding";
import { planFor, type OrgBilling } from "../lib/billing";

/**
 * Public white-label branding lookup. Resolves branding from the request host
 * ONLY, and the host never authorizes anything: this endpoint returns cosmetic
 * theming (name, accent, tagline, logo) for the matched tenant, or a neutral
 * unbranded response when the host matches no configured organization domain.
 *
 * We read the raw Host header rather than req.hostname (which trusts the proxy's
 * X-Forwarded-Host) so a client cannot spoof another tenant's branding.
 *
 * Branding is also entitlement-gated at read time: white-label branding is only
 * ever served through a custom-domain host match, so the host mapping itself is
 * the customDomain entitlement and the cosmetic fields are the whiteLabel
 * entitlement. When an org downgrades below the entitling tier we suppress its
 * branding (return the neutral default) instead of clearing its stored config,
 * so re-upgrading restores it. We never 402 or otherwise reveal a
 * matched-but-unentitled host: this stays a cosmetic endpoint that never
 * authorizes and never becomes a domain/tier oracle. customDomain implies
 * whiteLabel in the current tier model; both are checked so a future tier
 * reshuffle cannot accidentally leak white-label fields.
 */
const router = Router();

router.get("/branding", async (req, res): Promise<void> => {
  // Short cache so a downgrade-driven revocation propagates within ~1 minute.
  res.set("Cache-Control", "public, max-age=60");

  const host = normalizeHost(req.headers.host);
  if (!host) {
    res.json({ branded: false, organization: null });
    return;
  }

  const [org] = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      type: organizationsTable.type,
      accentColor: organizationsTable.accentColor,
      tagline: organizationsTable.tagline,
      logoUrl: organizationsTable.logoUrl,
      planTier: organizationsTable.planTier,
      subscriptionStatus: organizationsTable.subscriptionStatus,
      trialEndsAt: organizationsTable.trialEndsAt,
      currentPeriodEnd: organizationsTable.currentPeriodEnd,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.domain, host));

  if (!org) {
    res.json({ branded: false, organization: null });
    return;
  }

  const billing: OrgBilling = {
    id: org.id,
    type: org.type,
    planTier: org.planTier,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.currentPeriodEnd,
  };
  const { features } = planFor(billing);
  if (!features.customDomain || !features.whiteLabel) {
    res.json({ branded: false, organization: null });
    return;
  }

  res.json({
    branded: true,
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      accentColor: org.accentColor,
      tagline: org.tagline,
      logoUrl: org.logoUrl,
    },
  });
});

export default router;
