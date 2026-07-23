// Public plan catalog for the Compass (Curriculum Builder) marketing site.
//
// Entitlements (course limits + feature flags) are the same tiers the server
// enforces in `artifacts/compass-api/src/lib/billing.ts` (`PLANS`); this module
// is the display/marketing projection of that catalog for the public Pricing
// page (labels, descriptions, published monthly prices, and highlight copy).
// The server remains the source of truth for what a subscription actually
// entitles a tenant to; nothing here grants access.
import type { PlanFeatures } from "./generated/api.schemas";

export type PlanCatalogEntryTier =
  | "trial"
  | "starter"
  | "professional"
  | "enterprise";

export interface PlanCatalogEntry {
  tier: PlanCatalogEntryTier;
  label: string;
  description: string;
  /** Max simultaneously-active courses; null means unlimited. */
  activeCourseLimit: number | null;
  /** Published list price per month, in cents. */
  monthlyPriceCents: number;
  features: PlanFeatures;
  highlights: string[];
}

// Mirrors the server-side `PLANS` tiers (limits + feature flags) and layers on
// the marketing copy and published prices the public site shows.
const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    tier: "starter",
    label: "Starter",
    description:
      "For individual designers and small teams building their first accredited courses.",
    activeCourseLimit: 10,
    monthlyPriceCents: 4900,
    features: {
      whiteLabel: false,
      multiAccreditorExport: false,
      customDomain: false,
    },
    highlights: [
      "Up to 10 active courses",
      "AI curriculum QA engine",
      "Standards alignment + crosswalks",
      "Evidence packet export",
    ],
  },
  {
    tier: "professional",
    label: "Professional",
    description:
      "For programs that need white-label delivery and multi-accreditor evidence.",
    activeCourseLimit: 50,
    monthlyPriceCents: 9900,
    features: {
      whiteLabel: true,
      multiAccreditorExport: true,
      customDomain: false,
    },
    highlights: [
      "Up to 50 active courses",
      "Everything in Starter",
      "White-label branding",
      "Multi-accreditor export",
      "Priority support",
    ],
  },
  {
    tier: "enterprise",
    label: "Enterprise",
    description:
      "For institutions running curriculum at scale with a custom domain and unlimited courses.",
    activeCourseLimit: null,
    monthlyPriceCents: 29900,
    features: {
      whiteLabel: true,
      multiAccreditorExport: true,
      customDomain: true,
    },
    highlights: [
      "Unlimited active courses",
      "Everything in Professional",
      "Custom domain",
      "SSO + dedicated onboarding",
      "SLA-backed support",
    ],
  },
];

/**
 * The public plan catalog. Static marketing data, so it never loads or errors;
 * the shape matches the react-query hooks the Pricing page expects.
 */
export function useListPlans(): {
  data: PlanCatalogEntry[];
  isLoading: boolean;
  isError: boolean;
} {
  return { data: PLAN_CATALOG, isLoading: false, isError: false };
}
