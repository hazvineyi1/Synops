import { describe, it, expect } from "vitest";
import { mfaRequiredForRole, mfaSetupRequired } from "./mfaPolicy";

describe("mfaPolicy", () => {
  it("requires 2FA for the admin tiers", () => {
    expect(mfaRequiredForRole("super_admin")).toBe(true);
    expect(mfaRequiredForRole("partner_admin")).toBe(true);
    expect(mfaRequiredForRole("org_admin")).toBe(true);
  });

  it("does not require 2FA for non-admin roles", () => {
    expect(mfaRequiredForRole("learner")).toBe(false);
    expect(mfaRequiredForRole("coach")).toBe(false);
    expect(mfaRequiredForRole("funder")).toBe(false);
  });

  it("flags setup only when an admin has not enabled it", () => {
    expect(mfaSetupRequired({ role: "super_admin", mfaEnabled: false })).toBe(true);
    expect(mfaSetupRequired({ role: "super_admin", mfaEnabled: true })).toBe(false);
    expect(mfaSetupRequired({ role: "learner", mfaEnabled: false })).toBe(false);
  });
});
