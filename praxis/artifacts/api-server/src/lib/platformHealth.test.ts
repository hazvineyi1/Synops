import { describe, it, expect } from "vitest";
import { computeEngagementRate } from "./platformHealth";

// Guards the /platform/alerts engagement rate. The bug: engagement was computed from raw active
// enrolments over learners (16 / 7 = 228%, clamped to a flat, meaningless 100%). The rate must be
// distinct active learners over total learners, and must stay within 0-100.

describe("computeEngagementRate", () => {
  it("is 100% when every learner has an active enrolment (7 of 7)", () => {
    expect(computeEngagementRate(7, 7)).toBe(100);
  });

  it("is a real per-learner figure when some learners are inactive (5 of 7 -> 71%)", () => {
    expect(computeEngagementRate(5, 7)).toBe(71);
  });

  it("rounds to the nearest whole percent", () => {
    expect(computeEngagementRate(1, 3)).toBe(33); // 33.33 -> 33
    expect(computeEngagementRate(2, 3)).toBe(67); // 66.67 -> 67
  });

  it("is 0% when no learner is active", () => {
    expect(computeEngagementRate(0, 7)).toBe(0);
  });

  it("returns 0 (not NaN or Infinity) when there are no learners", () => {
    expect(computeEngagementRate(0, 0)).toBe(0);
    expect(computeEngagementRate(3, 0)).toBe(0);
  });

  it("never exceeds 100% even if an enrolment count is passed by mistake (16 over 7)", () => {
    // This is the regression: the old code let 16/7 through and relied on the clamp. The helper
    // caps at 100 so a bad numerator can never render as a >100% engagement figure.
    expect(computeEngagementRate(16, 7)).toBe(100);
  });

  it("guards against non-finite and negative inputs", () => {
    expect(computeEngagementRate(NaN, 7)).toBe(0);
    expect(computeEngagementRate(3, NaN)).toBe(0);
    expect(computeEngagementRate(-4, 7)).toBe(0);
  });
});
