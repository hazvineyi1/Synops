import { describe, it, expect } from "vitest";
import {
  ROLE,
  isSuperAdmin,
  isFacilitator,
  isCoFacilitator,
  isInstructionalDesigner,
  isLearner,
  isFunder,
  canAdministerOrg,
  hasHubAccess,
  assignableRoles,
  canAssignRole,
  canAccessOrg,
  canAccessCourse,
} from "./roles";

// The permission matrix is the single source of truth that gates every scoped route. These are the
// exact predicates that the Section-A hardening added role checks around (billing/funder/docs behind
// isFacilitator, the assignment ceiling, org/course tenant scoping), so a regression here would
// re-open a security hole. Pure functions, no DB.

describe("tier predicates", () => {
  it("classifies each role into exactly one tier", () => {
    expect(isSuperAdmin(ROLE.SUPER_ADMIN)).toBe(true);
    expect(isSuperAdmin(ROLE.PARTNER_ADMIN)).toBe(false);

    // Facilitator tier = org_admin AND partner_admin (§6 flatten). This is what gates the financial
    // hubs: a learner/coach must NOT be a facilitator.
    expect(isFacilitator(ROLE.PARTNER_ADMIN)).toBe(true);
    expect(isFacilitator(ROLE.ORG_ADMIN)).toBe(true);
    expect(isFacilitator(ROLE.COACH)).toBe(false);
    expect(isFacilitator(ROLE.LEARNER)).toBe(false);
    expect(isFacilitator(ROLE.SUPER_ADMIN)).toBe(false);

    expect(isCoFacilitator(ROLE.COACH)).toBe(true);
    expect(isCoFacilitator(ROLE.PARTNER_ADMIN)).toBe(false);

    expect(isLearner(ROLE.LEARNER)).toBe(true);
    expect(isFunder(ROLE.FUNDER)).toBe(true);
    expect(isInstructionalDesigner(ROLE.INSTRUCTIONAL_DESIGNER)).toBe(true);
  });

  it("canAdministerOrg = super admin or facilitator (never a coach/learner/funder)", () => {
    expect(canAdministerOrg(ROLE.SUPER_ADMIN)).toBe(true);
    expect(canAdministerOrg(ROLE.PARTNER_ADMIN)).toBe(true);
    expect(canAdministerOrg(ROLE.ORG_ADMIN)).toBe(true);
    expect(canAdministerOrg(ROLE.COACH)).toBe(false);
    expect(canAdministerOrg(ROLE.LEARNER)).toBe(false);
    expect(canAdministerOrg(ROLE.FUNDER)).toBe(false);
  });

  it("hasHubAccess = super admin or instructional designer only", () => {
    expect(hasHubAccess(ROLE.SUPER_ADMIN)).toBe(true);
    expect(hasHubAccess(ROLE.INSTRUCTIONAL_DESIGNER)).toBe(true);
    expect(hasHubAccess(ROLE.PARTNER_ADMIN)).toBe(false);
    expect(hasHubAccess(ROLE.COACH)).toBe(false);
  });
});

describe("role-assignment ceiling", () => {
  it("only super admin may mint facilitators / IDs / super admins", () => {
    const superAssignable = assignableRoles(ROLE.SUPER_ADMIN);
    expect(superAssignable).toContain(ROLE.PARTNER_ADMIN);
    expect(superAssignable).toContain(ROLE.INSTRUCTIONAL_DESIGNER);
    expect(superAssignable).toContain(ROLE.SUPER_ADMIN);
  });

  it("a facilitator may create ONLY co-facilitators and learners", () => {
    const facAssignable = assignableRoles(ROLE.PARTNER_ADMIN);
    expect(facAssignable.sort()).toEqual([ROLE.COACH, ROLE.LEARNER].sort());
    // The critical negatives: a facilitator can never mint an admin-tier account.
    expect(canAssignRole(ROLE.PARTNER_ADMIN, ROLE.PARTNER_ADMIN)).toBe(false);
    expect(canAssignRole(ROLE.PARTNER_ADMIN, ROLE.SUPER_ADMIN)).toBe(false);
    expect(canAssignRole(ROLE.ORG_ADMIN, ROLE.ORG_ADMIN)).toBe(false);
    expect(canAssignRole(ROLE.PARTNER_ADMIN, ROLE.COACH)).toBe(true);
    expect(canAssignRole(ROLE.PARTNER_ADMIN, ROLE.LEARNER)).toBe(true);
  });

  it("a coach or learner may assign nothing", () => {
    expect(assignableRoles(ROLE.COACH)).toEqual([]);
    expect(assignableRoles(ROLE.LEARNER)).toEqual([]);
    expect(canAssignRole(ROLE.COACH, ROLE.LEARNER)).toBe(false);
  });
});

describe("org scope (canAccessOrg)", () => {
  const org = { id: "org1", partnerId: "pA" };

  it("super admin is unscoped", () => {
    expect(canAccessOrg({ role: ROLE.SUPER_ADMIN }, org)).toBe(true);
  });
  it("a member of the org can access it", () => {
    expect(canAccessOrg({ role: ROLE.ORG_ADMIN, organisationId: "org1" }, org)).toBe(true);
    expect(canAccessOrg({ role: ROLE.LEARNER, organisationId: "org1" }, org)).toBe(true);
  });
  it("a partner_admin can access any org under their partner", () => {
    expect(canAccessOrg({ role: ROLE.PARTNER_ADMIN, partnerId: "pA" }, org)).toBe(true);
  });
  it("DENIES cross-tenant access", () => {
    expect(canAccessOrg({ role: ROLE.PARTNER_ADMIN, partnerId: "pB" }, org)).toBe(false);
    expect(canAccessOrg({ role: ROLE.ORG_ADMIN, organisationId: "orgOther" }, org)).toBe(false);
    expect(canAccessOrg({ role: ROLE.LEARNER, organisationId: "orgOther" }, org)).toBe(false);
  });
});

describe("course scope (canAccessCourse)", () => {
  it("matches by org OR partner tenant, denies otherwise", () => {
    expect(canAccessCourse({ role: ROLE.SUPER_ADMIN }, { tenantId: "x" })).toBe(true);
    expect(canAccessCourse({ role: ROLE.LEARNER, organisationId: "org1" }, { tenantId: "org1" })).toBe(true);
    expect(canAccessCourse({ role: ROLE.PARTNER_ADMIN, partnerId: "pA" }, { tenantId: "pA" })).toBe(true);
    expect(canAccessCourse({ role: ROLE.LEARNER, organisationId: "org1", partnerId: "pA" }, { tenantId: "other" })).toBe(false);
  });
});
