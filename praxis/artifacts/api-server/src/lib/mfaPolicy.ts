import { FACILITATOR_ROLES } from "./roles";

/**
 * Two-factor policy: which roles MUST have 2FA enabled.
 *
 * The admin tiers (super_admin, partner_admin, org_admin) administer tenants and
 * their people, so 2FA is mandatory for them. Enforcement is by forced enrolment,
 * not lockout: an admin without 2FA can still sign in and reach ONLY the security
 * page to enrol; the rest of the console is gated until they do (see the SPA MFA
 * gate). This mirrors how Canvas/Okta roll out an org-wide 2FA requirement without
 * locking existing admins out.
 */
const MFA_REQUIRED_ROLES = new Set<string>(FACILITATOR_ROLES);

export function mfaRequiredForRole(role: string): boolean {
  return MFA_REQUIRED_ROLES.has(role);
}

/** True when this user's role requires 2FA but they have not enabled it yet. */
export function mfaSetupRequired(user: { role: string; mfaEnabled?: boolean | null }): boolean {
  return mfaRequiredForRole(user.role) && !user.mfaEnabled;
}
