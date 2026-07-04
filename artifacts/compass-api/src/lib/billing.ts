import { and, count, eq, sql } from "drizzle-orm";
import {
  db,
  organizationsTable,
  coursesTable,
  projectsTable,
  clientsTable,
} from "@workspace/compass-db";

/**
 * Compass billing model.
 *
 * Billing is per organization (the tenant subscribes). A plan tier maps to an
 * active-course quota plus a small set of feature flags. The internal tenant is
 * always treated as enterprise/unlimited. The server is the boundary: every
 * quota/feature decision is made here from trusted DB state, never the client.
 */

export const PLAN_TIERS = ["trial", "starter", "professional", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);
}

/**
 * Resolve a plan tier from a Stripe Price lookup_key. Returns null when the key
 * matches no known plan. Used by the webhook/reconcile path to map a Stripe
 * subscription back to an entitlement tier without trusting client input.
 */
export function tierFromLookupKey(lookupKey: string | null | undefined): PlanTier | null {
  if (!lookupKey) return null;
  for (const plan of Object.values(PLANS)) {
    if (plan.monthlyLookupKey === lookupKey || plan.yearlyLookupKey === lookupKey) {
      return plan.tier;
    }
  }
  return null;
}

export interface PlanFeatures {
  /** White-label branding (custom name/tagline/accent/logo) for the tenant. */
  whiteLabel: boolean;
  /** Export a QA/evidence report against multiple accreditor frameworks at once. */
  multiAccreditorExport: boolean;
  /** Map a custom domain to the tenant (resolved at deploy time). */
  customDomain: boolean;
}

export interface PlanDef {
  tier: PlanTier;
  label: string;
  /** Max simultaneously-active courses; null means unlimited. */
  activeCourseLimit: number | null;
  /** Stripe Price lookup_keys, set by the seed script (absent for trial). */
  monthlyLookupKey?: string;
  yearlyLookupKey?: string;
  features: PlanFeatures;
}

export const PLANS: Record<PlanTier, PlanDef> = {
  trial: {
    tier: "trial",
    label: "Trial",
    activeCourseLimit: 2,
    features: { whiteLabel: false, multiAccreditorExport: false, customDomain: false },
  },
  starter: {
    tier: "starter",
    label: "Starter",
    activeCourseLimit: 10,
    monthlyLookupKey: "compass_starter_monthly",
    yearlyLookupKey: "compass_starter_yearly",
    features: { whiteLabel: false, multiAccreditorExport: false, customDomain: false },
  },
  professional: {
    tier: "professional",
    label: "Professional",
    activeCourseLimit: 50,
    monthlyLookupKey: "compass_professional_monthly",
    yearlyLookupKey: "compass_professional_yearly",
    features: { whiteLabel: true, multiAccreditorExport: true, customDomain: false },
  },
  enterprise: {
    tier: "enterprise",
    label: "Enterprise",
    activeCourseLimit: null,
    monthlyLookupKey: "compass_enterprise_monthly",
    yearlyLookupKey: "compass_enterprise_yearly",
    features: { whiteLabel: true, multiAccreditorExport: true, customDomain: true },
  },
};

/** The Stripe subscription statuses we treat as currently entitling the tenant. */
const ENTITLING_STATUSES = new Set(["trialing", "active", "past_due"]);

/** Just the billing-relevant columns of an organization. */
export interface OrgBilling {
  id: number;
  type: string | null;
  planTier: string;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * The tier a tenant is currently entitled to. The internal tenant is always
 * enterprise. Otherwise, while the subscription is entitling (trialing/active/
 * past_due) the purchased `planTier` applies; any other status (canceled,
 * incomplete, none) falls back to the trial tier so quotas/features tighten.
 */
export function effectiveTier(org: OrgBilling): PlanTier {
  if (org.type === "internal") return "enterprise";
  if (ENTITLING_STATUSES.has(org.subscriptionStatus) && isPlanTier(org.planTier)) {
    return org.planTier;
  }
  return "trial";
}

export function planFor(org: OrgBilling): PlanDef {
  return PLANS[effectiveTier(org)];
}

export function activeCourseLimit(org: OrgBilling): number | null {
  return planFor(org).activeCourseLimit;
}

export type PlanFeature = keyof PlanFeatures;

/** The minimum tier that grants each feature, used for upgrade prompts. */
export const FEATURE_REQUIRED_TIER: Record<PlanFeature, PlanTier> = {
  whiteLabel: "professional",
  multiAccreditorExport: "professional",
  customDomain: "enterprise",
};

const FEATURE_UPGRADE_MESSAGE: Record<PlanFeature, string> = {
  whiteLabel:
    "White-label branding is not included in your current plan. Contact us to unlock it.",
  multiAccreditorExport:
    "Evidence packet export is not included in your current plan. Contact us to unlock it.",
  customDomain:
    "Custom domain is not included in your current plan. Contact us to assign a custom domain.",
};

export interface UpgradeRequiredBody {
  error: "upgrade_required";
  feature: PlanFeature;
  requiredTier: PlanTier;
  message: string;
}

/**
 * Standard 402 payload for a feature the actor's plan does not include. The
 * `message` is human-readable (surfaced directly in the UI); `feature` and
 * `requiredTier` let the client offer a targeted upgrade.
 */
export function upgradeRequiredBody(feature: PlanFeature): UpgradeRequiredBody {
  return {
    error: "upgrade_required",
    feature,
    requiredTier: FEATURE_REQUIRED_TIER[feature],
    message: FEATURE_UPGRADE_MESSAGE[feature],
  };
}

export function hasTrialExpired(org: OrgBilling): boolean {
  if (org.subscriptionStatus !== "trialing") return false;
  if (!org.trialEndsAt) return false;
  return org.trialEndsAt.getTime() < Date.now();
}

/**
 * Whether a tenant may currently CREATE or EDIT curriculum data. The internal
 * tenant always can. A paid subscription in good standing (active/past_due) can,
 * provided it resolves to a real paid tier. A trial can write while its clock is
 * still running OR has not been started yet (trialEndsAt null); it becomes
 * READ-ONLY only once the clock has been SET and has ELAPSED. Every other
 * subscription state (canceled, incomplete, etc.) is also read-only: the tenant
 * keeps full read access but must upgrade to write again.
 *
 * The "not started" (trialEndsAt null) case is treated as writable on purpose:
 * in production a trial clock is only ever null before email verification, and
 * an unverified account has no session, so the read-only middleware never runs
 * for it. Freezing that state would only penalize the indeterminate/default org
 * shape (e.g. an admin-provisioned org) with no security benefit. The genuine
 * read-only trigger is an EXPIRED trial (clock set, in the past). This is the
 * single source of truth the read-only middleware enforces; the client mirrors
 * it only as a UX hint.
 */
export function canWrite(org: OrgBilling): boolean {
  if (org.type === "internal") return true;
  const status = org.subscriptionStatus;
  if (status === "active" || status === "past_due") {
    return isPlanTier(org.planTier) && org.planTier !== "trial";
  }
  if (status === "trialing") {
    return org.trialEndsAt == null || org.trialEndsAt.getTime() > Date.now();
  }
  return false;
}

export function isReadOnly(org: OrgBilling): boolean {
  return !canWrite(org);
}

/**
 * Whole days left in an active trial, rounded up; 0 once it has lapsed. Null when
 * the org is not on a (started) trial. Display only; `canWrite` is the boundary.
 */
export function trialDaysRemaining(org: OrgBilling): number | null {
  if (org.subscriptionStatus !== "trialing" || !org.trialEndsAt) return null;
  const ms = org.trialEndsAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * The presentational billing summary attached to AuthUser so the client can show
 * a trial banner and disable write affordances. NONE of these fields authorize
 * anything; the server enforces `canWrite` on every mutation.
 */
export interface BillingSummary {
  effectiveTier: PlanTier;
  planLabel: string;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  readOnly: boolean;
}

export function buildBillingSummary(org: OrgBilling): BillingSummary {
  const tier = effectiveTier(org);
  return {
    effectiveTier: tier,
    planLabel: PLANS[tier].label,
    trialEndsAt: org.trialEndsAt ? org.trialEndsAt.toISOString() : null,
    trialDaysRemaining: trialDaysRemaining(org),
    readOnly: isReadOnly(org),
  };
}

/**
 * The billing summary for an actor with no concrete organization (a global
 * admin/super_admin). Such actors bypass org scoping and write freely, so they
 * are never read-only and carry no trial.
 */
export function globalBillingSummary(): BillingSummary {
  return {
    effectiveTier: "enterprise",
    planLabel: PLANS.enterprise.label,
    trialEndsAt: null,
    trialDaysRemaining: null,
    readOnly: false,
  };
}

// pg advisory-lock namespace (classid) for org-scoped billing serialization.
const BILLING_LOCK_NAMESPACE = 815;

export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Count an organization's currently-active courses: a course whose owning
 * project has status 'active'. This is the metered quantity for plan limits.
 */
export async function countActiveCourses(orgId: number, exec: Executor = db): Promise<number> {
  const rows = await exec
    .select({ c: count() })
    .from(coursesTable)
    .innerJoin(projectsTable, eq(projectsTable.id, coursesTable.projectId))
    .innerJoin(clientsTable, eq(clientsTable.id, projectsTable.clientId))
    .where(and(eq(clientsTable.organizationId, orgId), eq(projectsTable.status, "active")));
  return Number(rows[0]?.c ?? 0);
}

export async function loadOrgBilling(orgId: number, exec: Executor = db): Promise<OrgBilling | null> {
  const [org] = await exec
    .select({
      id: organizationsTable.id,
      type: organizationsTable.type,
      planTier: organizationsTable.planTier,
      subscriptionStatus: organizationsTable.subscriptionStatus,
      trialEndsAt: organizationsTable.trialEndsAt,
      currentPeriodEnd: organizationsTable.currentPeriodEnd,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId));
  return org ?? null;
}

/**
 * Whether an organization's effective plan tier includes a given feature. A
 * read-only entitlement check (no advisory lock needed). Missing org => false.
 */
export async function orgHasFeature(
  orgId: number,
  feature: PlanFeature,
  exec: Executor = db,
): Promise<boolean> {
  const org = await loadOrgBilling(orgId, exec);
  if (!org) return false;
  return planFor(org).features[feature];
}

export interface LimitExceeded {
  status: "limit_exceeded";
  tier: PlanTier;
  limit: number;
  current: number;
}

/**
 * Atomically enforce the active-course quota for `orgId` and, if there is room,
 * insert the course. A pg advisory transaction lock keyed by the org serializes
 * concurrent creates so two requests cannot both pass the check and overshoot
 * the limit. Global actors bypass metering (internal staff working in any org).
 */
export async function createCourseWithLimit<T>(
  orgId: number,
  isGlobalActor: boolean,
  insert: (exec: Executor) => Promise<T>,
): Promise<{ status: "created"; value: T } | LimitExceeded> {
  if (isGlobalActor) {
    return { status: "created", value: await insert(db) };
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BILLING_LOCK_NAMESPACE}, ${orgId})`);
    const org = await loadOrgBilling(orgId, tx);
    const tier = org ? effectiveTier(org) : "trial";
    const limit = org ? activeCourseLimit(org) : PLANS.trial.activeCourseLimit;
    if (limit !== null) {
      const current = await countActiveCourses(orgId, tx);
      if (current >= limit) {
        return { status: "limit_exceeded", tier, limit, current } as const;
      }
    }
    return { status: "created", value: await insert(tx) } as const;
  });
}

/**
 * Atomically enforce the active-course quota when an existing project is
 * (re)activated and, if there is room, apply the update. Activating a project
 * flips all of its courses to "active" (countActiveCourses only counts courses
 * whose project is active), so the quota check and the status update MUST happen
 * inside one transaction holding the org advisory lock - the same lock
 * createCourseWithLimit uses. Otherwise the lock would be released before the
 * update commits, and two concurrent activations (or an activation racing a
 * course create) could both pass the check and overshoot the limit.
 *
 * The current status is re-read inside the lock; an already-active project skips
 * the meter (its courses are already counted). Global actors bypass metering.
 */
export async function activateProjectWithLimit<T>(
  orgId: number,
  projectId: number,
  isGlobalActor: boolean,
  apply: (exec: Executor) => Promise<T>,
): Promise<{ status: "ok"; value: T } | LimitExceeded> {
  if (isGlobalActor) {
    return { status: "ok", value: await apply(db) };
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BILLING_LOCK_NAMESPACE}, ${orgId})`);
    const [proj] = await tx
      .select({ status: projectsTable.status })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    // Only the inactive -> active transition adds this project's courses to the
    // org's active-course total; an already-active project is unaffected.
    if (proj && proj.status !== "active") {
      const org = await loadOrgBilling(orgId, tx);
      const tier = org ? effectiveTier(org) : "trial";
      const limit = org ? activeCourseLimit(org) : PLANS.trial.activeCourseLimit;
      if (limit !== null) {
        const activeNow = await countActiveCourses(orgId, tx);
        const [{ c }] = await tx
          .select({ c: count() })
          .from(coursesTable)
          .where(eq(coursesTable.projectId, projectId));
        const wouldBe = activeNow + Number(c);
        if (wouldBe > limit) {
          return { status: "limit_exceeded", tier, limit, current: wouldBe } as const;
        }
      }
    }
    return { status: "ok", value: await apply(tx) } as const;
  });
}
