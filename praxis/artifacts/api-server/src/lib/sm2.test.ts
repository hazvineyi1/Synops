import { describe, it, expect } from "vitest";
import { sm2Update } from "./sm2";

/**
 * The critical non-punitive invariant: a weak or incorrect answer must NEVER decrease the mastery
 * percentage. These tests pin that contract so a future scoring tweak can't silently reintroduce a
 * punitive delta. The spaced-repetition scheduling (ef/interval/reps) may still react to a weak
 * answer - only the mastery score is protected.
 */

const EF = 2.5, INTERVAL = 1, REPS = 0;

describe("sm2Update - non-punitive mastery", () => {
  it("NEVER decreases mastery, for any starting mastery and any grade", () => {
    for (let m = 0; m <= 1.0001; m += 0.05) {
      const mastery = Math.min(1, Math.round(m * 100) / 100);
      for (const grade of [0, 1, 2, 3]) {
        const out = sm2Update(mastery, EF, INTERVAL, REPS, grade);
        expect(out.mastery, `mastery ${mastery} grade ${grade} must not decrease`).toBeGreaterThanOrEqual(mastery);
      }
    }
  });

  it("awards ZERO (not a negative delta) for a wrong answer at high mastery", () => {
    // grade 0 (no understanding) and grade 1 (shaky) at 0.7 mastery: target is below 0.7, so the
    // learner keeps their 0.7 rather than losing ground.
    expect(sm2Update(0.7, EF, INTERVAL, REPS, 0).mastery).toBe(0.7);
    expect(sm2Update(0.7, EF, INTERVAL, REPS, 1).mastery).toBe(0.7);
  });

  it("still rewards strong reasoning with a positive gain", () => {
    const before = 0.3;
    const after = sm2Update(before, EF, INTERVAL, REPS, 3).mastery;
    expect(after).toBeGreaterThan(before);
  });

  it("keeps mastery within [0, 1]", () => {
    for (const grade of [0, 1, 2, 3]) {
      const out = sm2Update(0.99, EF, INTERVAL, REPS, grade);
      expect(out.mastery).toBeLessThanOrEqual(1);
      expect(out.mastery).toBeGreaterThanOrEqual(0);
    }
  });

  it("preserves the thresholds: solid answers approach but do not reach the 0.8 bar; mastery answers can", () => {
    // Repeated grade-2 (solid) reasoning converges toward ~0.78, staying just under the 0.8 mastery bar.
    let m = 0;
    for (let i = 0; i < 30; i++) m = sm2Update(m, EF, INTERVAL, REPS, 2).mastery;
    expect(m).toBeLessThan(0.8);
    expect(m).toBeGreaterThan(0.7);
    // A clear mastery-level (grade 3) answer can carry it over the bar.
    const over = sm2Update(m, EF, INTERVAL, REPS, 3).mastery;
    expect(over).toBeGreaterThanOrEqual(0.8);
  });

  it("still resets the spaced-repetition schedule on a failed grade (tutoring cadence unchanged)", () => {
    const out = sm2Update(0.6, EF, 10, 5, 0); // grade < 1 resets reps/interval
    expect(out.reps).toBe(0);
    expect(out.interval).toBe(1);
  });
});
