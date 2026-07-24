import { describe, it, expect } from "vitest";
import { sm2Update, masteryStep, MAX_MASTERY_STEP } from "./sm2";

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

  it("lets solid reasoning certify: repeated grade-2 crosses the 0.8 bar and converges toward its 0.85 target", () => {
    // Fair-grading design: solid, correct reasoning (grade 2, including a correct multiple-choice
    // pick) tops out at 0.85, so it CAN cross the 0.8 mastery bar over enough turns rather than
    // walling just below it. Early on it is still under the bar (measured climb, not an instant pass).
    let m = 0;
    const afterFew = (() => { let x = 0; for (let i = 0; i < 3; i++) x = sm2Update(x, EF, INTERVAL, REPS, 2).mastery; return x; })();
    expect(afterFew).toBeLessThan(0.8); // a few solid turns have not yet certified
    for (let i = 0; i < 30; i++) m = sm2Update(m, EF, INTERVAL, REPS, 2).mastery;
    expect(m).toBeGreaterThanOrEqual(0.8); // sustained solid reasoning eventually certifies
    expect(m).toBeLessThanOrEqual(0.85);   // but never past its target
  });

  it("climbs in MEASURED intervals: no single answer moves mastery by more than MAX_MASTERY_STEP", () => {
    // The visible meter must never leap. For every starting mastery and every grade, one update moves
    // the score by at most the cap (a tiny float epsilon allowed). This is what makes the meter feel
    // like earned, steady progress rather than a jackpot on one strong answer.
    for (let mm = 0; mm <= 1.0001; mm += 0.05) {
      const mastery = Math.min(1, Math.round(mm * 100) / 100);
      for (const grade of [0, 1, 2, 3]) {
        const out = sm2Update(mastery, EF, INTERVAL, REPS, grade);
        expect(out.mastery - mastery, `grade ${grade} at ${mastery} must step <= ${MAX_MASTERY_STEP}`).toBeLessThanOrEqual(MAX_MASTERY_STEP + 1e-9);
      }
    }
  });

  it("still reaches full mastery bar within about five clear-mastery answers", () => {
    // Grade-3 (clear mastery) with the measured cap reaches the 0.8 bar in ~5 exchanges, aligning
    // with the certification pacing floor (MIN_MASTERY_EXCHANGES).
    let m = 0;
    for (let i = 0; i < 5; i++) m = sm2Update(m, EF, INTERVAL, REPS, 3).mastery;
    expect(m).toBeGreaterThanOrEqual(0.8);
  });
});

describe("masteryStep (shared session + concept mastery step)", () => {
  it("starts from the given score (session-local), not from any global state", () => {
    // Five clear-mastery answers from 0 reach exactly the 0.8 bar - no float drift below it.
    let m = 0;
    const seq: number[] = [];
    for (let i = 0; i < 5; i++) { m = masteryStep(m, 3); seq.push(m); }
    expect(seq).toEqual([0.16, 0.32, 0.48, 0.64, 0.8]);
    expect(m).toBeGreaterThanOrEqual(0.8);
  });

  it("never decreases and never exceeds MAX_MASTERY_STEP per call", () => {
    for (let mm = 0; mm <= 1.0001; mm += 0.05) {
      const prev = Math.min(1, Math.round(mm * 100) / 100);
      for (const g of [0, 1, 2, 3]) {
        const out = masteryStep(prev, g);
        expect(out).toBeGreaterThanOrEqual(prev);
        expect(out - prev).toBeLessThanOrEqual(MAX_MASTERY_STEP + 1e-9);
      }
    }
  });

  it("awards nothing for a disengaged (grade 0) answer", () => {
    expect(masteryStep(0.5, 0)).toBe(0.5);
  });

  it("still resets the spaced-repetition schedule on a failed grade (tutoring cadence unchanged)", () => {
    const out = sm2Update(0.6, EF, 10, 5, 0); // grade < 1 resets reps/interval
    expect(out.reps).toBe(0);
    expect(out.interval).toBe(1);
  });
});
// (masteryStep drives both the persistent SM-2 score and the per-session meter, so its behaviour is
// pinned here directly in addition to the sm2Update tests above.)
