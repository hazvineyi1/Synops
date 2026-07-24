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

/**
 * Demo personas are exempt from the 2FA setup gate. These are non-production, credential-less,
 * Enza-only accounts reachable ONLY via the one-click demo button (host-locked, and kill-switched
 * at go-live via ENABLE_DEMO_LOGIN=0). Forcing an authenticator app on a shared demo persona would
 * dead-end the demo, and there is no real person's data behind these accounts to protect. Real
 * admin accounts stay fully gated. These emails mirror the fixed demo identities in routes/auth.ts.
 */
const MFA_EXEMPT_EMAILS = new Set<string>([
  "demo.admin@enzaglobalmedia.co.za",
  "enza@student1.test",
]);

export function isMfaExemptEmail(email?: string | null): boolean {
  return !!email && MFA_EXEMPT_EMAILS.has(email.trim().toLowerCase());
}

/** True when this user's role requires 2FA but they have not enabled it yet. */
export function mfaSetupRequired(user: { role: string; mfaEnabled?: boolean | null; email?: string | null }): boolean {
  if (isMfaExemptEmail(user.email)) return false;
  return mfaRequiredForRole(user.role) && !user.mfaEnabled;
}
