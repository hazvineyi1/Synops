/**
 * Canonical role & permission model — the single source of truth that maps the stored
 * `user_role` enum onto the five-tier model from the Praxis Role & Permission decision
 * doc. The enum values are kept as-is (no breaking rename); the TIER semantics live here.
 *
 * Tier mapping (decision doc §3 / §5):
 *   Super Admin           = super_admin
 *   Instructional Designer= instructional_designer      (Hub-only, new)
 *   Org / Facilitator     = org_admin | partner_admin    (partner folded in, §6 flatten)
 *   Co-facilitator        = coach                         (section-scoped)
 *   Learner               = learner
 */

export const ROLE = {
  SUPER_ADMIN: "super_admin",
  PARTNER_ADMIN: "partner_admin",
  ORG_ADMIN: "org_admin",
  COACH: "coach",
  LEARNER: "learner",
  INSTRUCTIONAL_DESIGNER: "instructional_designer",
  FUNDER: "funder",
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

// A minimal shape for scope checks; the real dbUser satisfies it.
export interface ScopedUser {
  role: Role | string;
  organisationId?: string | null;
  partnerId?: string | null;
}

// ── Tier predicates ────────────────────────────────────────────────────────────
export const isSuperAdmin = (r: string): boolean => r === ROLE.SUPER_ADMIN;
/** Org/Facilitator tier — partner_admin is folded in (decision §6). */
export const isFacilitator = (r: string): boolean => r === ROLE.ORG_ADMIN || r === ROLE.PARTNER_ADMIN;
export const isCoFacilitator = (r: string): boolean => r === ROLE.COACH;
export const isInstructionalDesigner = (r: string): boolean => r === ROLE.INSTRUCTIONAL_DESIGNER;
export const isLearner = (r: string): boolean => r === ROLE.LEARNER;
/**
 * Funder / sponsor tier (decision doc §10.2). Deliberately excluded from every delivery
 * and Hub predicate above — a funder gets read-only aggregate reporting via its own
 * scoped endpoints and nothing else. It sits ALONGSIDE the hierarchy, not inside it.
 */
export const isFunder = (r: string): boolean => r === ROLE.FUNDER;

/** Facilitator or above — may administer an organization's delivery layer. */
export const canAdministerOrg = (r: string): boolean => isSuperAdmin(r) || isFacilitator(r);

/** Hub access — Instructional Designers plus Super Admin (decision §4.5). */
export const hasHubAccess = (r: string): boolean => isSuperAdmin(r) || isInstructionalDesigner(r);

// Enum groups for `requireRole(...)` guards.
export const FACILITATOR_ROLES: Role[] = [ROLE.SUPER_ADMIN, ROLE.PARTNER_ADMIN, ROLE.ORG_ADMIN];
export const HUB_ROLES: Role[] = [ROLE.SUPER_ADMIN, ROLE.INSTRUCTIONAL_DESIGNER];

// ── Role-assignment ceiling (decision §4.2 / §9.2) ──────────────────────────────
// A Facilitator may create only Co-facilitators and Learners. Only Super Admin may
// mint Facilitators, Instructional Designers, or other Super Admins.
const FACILITATOR_ASSIGNABLE: Role[] = [ROLE.COACH, ROLE.LEARNER];
const SUPER_ADMIN_ASSIGNABLE: Role[] = [
  ROLE.SUPER_ADMIN,
  ROLE.INSTRUCTIONAL_DESIGNER,
  ROLE.PARTNER_ADMIN,
  ROLE.ORG_ADMIN,
  ROLE.COACH,
  ROLE.LEARNER,
];

export function assignableRoles(actorRole: string): Role[] {
  if (isSuperAdmin(actorRole)) return [...SUPER_ADMIN_ASSIGNABLE];
  if (isFacilitator(actorRole)) return [...FACILITATOR_ASSIGNABLE];
  return [];
}

export const canAssignRole = (actorRole: string, targetRole: string): boolean =>
  assignableRoles(actorRole).includes(targetRole as Role);

// ── Organization scope (decision §6 flatten) ────────────────────────────────────
// Scope is the single organisationId on the user. Super Admin is unscoped.
//
// TRANSITIONAL: a former partner_admin may still carry partnerId with a null
// organisationId until the flatten data-migration assigns each one a single org. Until
// then we also honour partner→org ownership so nothing breaks. Once every partner_admin
// has an organisationId, this partner branch can be deleted and org becomes the ONLY
// source of truth (decision §6).
export function canAccessOrg(
  user: ScopedUser,
  org: { id: string; partnerId?: string | null },
): boolean {
  if (isSuperAdmin(user.role)) return true;
  if (user.organisationId && user.organisationId === org.id) return true;
  if (user.role === ROLE.PARTNER_ADMIN && user.partnerId && org.partnerId && user.partnerId === org.partnerId) {
    return true;
  }
  return false;
}

/**
 * Scope against a course. A course's `tenantId` may be either an organisation OR a
 * partner — courses are frequently owned at the partner level and shared across that
 * partner's organisations. So a user is in scope if EITHER their org or their partner
 * matches the course's tenant.
 */
export function canAccessCourse(user: ScopedUser, course: { tenantId: string }): boolean {
  if (isSuperAdmin(user.role)) return true;
  if (user.organisationId && user.organisationId === course.tenantId) return true;
  if (user.partnerId && user.partnerId === course.tenantId) return true;
  return false;
}
