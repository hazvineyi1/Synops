import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { decideImpersonationStart, type ImpersonationParty } from "../lib/impersonation";
import { blockWhileImpersonating } from "../lib/auth";

/**
 * Safeguard: impersonation is a privileged support tool and must refuse every
 * unsafe target. These assertions exercise the pure decision function and the
 * blockWhileImpersonating guard directly, with no DB or live session, mirroring
 * the repo's other safeguard tests. The end-to-end session-swap (id regeneration,
 * audit rows) is verified separately via the curl matrix.
 */

const superAdmin: ImpersonationParty = { id: 1, role: "super_admin", status: "active" };
const admin: ImpersonationParty = { id: 2, role: "admin", status: "active" };
const schoolAdmin: ImpersonationParty = { id: 3, role: "school_admin", status: "active" };
const builder: ImpersonationParty = { id: 4, role: "builder", status: "active" };
const hubClient: ImpersonationParty = { id: 5, role: "user", status: "active" };

describe("decideImpersonationStart", () => {
  it("allows a super admin to impersonate any active account, including admins", () => {
    expect(decideImpersonationStart(superAdmin, schoolAdmin)).toBe("allow");
    expect(decideImpersonationStart(superAdmin, builder)).toBe("allow");
    expect(decideImpersonationStart(superAdmin, hubClient)).toBe("allow");
    expect(decideImpersonationStart(superAdmin, admin)).toBe("allow");
    // A different super_admin account (not self) is also eligible.
    expect(
      decideImpersonationStart(superAdmin, { id: 9, role: "super_admin", status: "active" }),
    ).toBe("allow");
  });

  it("rejects an operator that is missing or deactivated (treated as unauthenticated)", () => {
    expect(decideImpersonationStart(null, builder)).toBe("operator_invalid");
    expect(
      decideImpersonationStart({ ...superAdmin, status: "deactivated" }, builder),
    ).toBe("operator_invalid");
  });

  it("rejects a non-super-admin operator, including the legacy global admin", () => {
    expect(decideImpersonationStart(admin, builder)).toBe("not_super_admin");
    expect(decideImpersonationStart(schoolAdmin, builder)).toBe("not_super_admin");
  });

  it("rejects a missing target", () => {
    expect(decideImpersonationStart(superAdmin, null)).toBe("target_not_found");
  });

  it("rejects impersonating yourself", () => {
    expect(decideImpersonationStart(superAdmin, { ...superAdmin })).toBe("self");
  });

  it("rejects a deactivated target", () => {
    expect(
      decideImpersonationStart(superAdmin, { ...builder, status: "deactivated" }),
    ).toBe("target_deactivated");
  });

});

function mockRes() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("blockWhileImpersonating guard", () => {
  it("rejects a request made while impersonating (prevents nesting and privileged writes)", () => {
    const req = { session: { userId: 4, impersonatorUserId: 1 } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    blockWhileImpersonating(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows a request when not impersonating", () => {
    const req = { session: { userId: 1 } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    blockWhileImpersonating(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
