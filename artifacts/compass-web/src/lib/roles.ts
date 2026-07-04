/**
 * Role helpers for the Compass curriculum engine. The server is the security
 * boundary; these helpers only shape the UI (which nav/routes to show).
 *
 * - admin / super_admin: global roles, see every tenant.
 * - school_admin: bound to one organization, manages its builders + allocations.
 * - builder: allocation-limited; only the scopes granted to them.
 */
export function isGlobalAdmin(role?: string | null): boolean {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdmin(role?: string | null): boolean {
  return role === "super_admin";
}

/**
 * Who can open the platform console (cross-organization overview, user
 * directory, white-label branding management). Global admins only.
 */
export function canViewConsole(role?: string | null): boolean {
  return isGlobalAdmin(role);
}

/**
 * Who may impersonate another user. UX gate only; the server independently
 * verifies the real actor is a super administrator before swapping the session.
 */
export function canImpersonate(role?: string | null): boolean {
  return isSuperAdmin(role);
}

export function isSchoolAdmin(role?: string | null): boolean {
  return role === "school_admin";
}

/** Anyone who can manage a school's builders and allocations. */
export function canManageSchool(role?: string | null): boolean {
  return isGlobalAdmin(role) || isSchoolAdmin(role);
}

export function isBuilder(role?: string | null): boolean {
  return role === "builder";
}

export function roleLabel(role?: string | null): string {
  switch (role) {
    case "admin":
      return "Administrator";
    case "super_admin":
      return "Super administrator";
    case "school_admin":
      return "School administrator";
    case "builder":
      return "Builder";
    default:
      return "Member";
  }
}
