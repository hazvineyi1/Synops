import { describe, it, expect } from "vitest";
import {
  computeLearner,
  evaluateOffTrack,
  letterFor,
  DEFAULT_BANDS,
  type GradebookColumn,
  type GradebookSettings,
} from "./gradebookEngine";

// Pure gradebook math that feeds credentials and off-track alerts. These assert the exact behaviours
// the Section-A/B work depends on: correct overall %, and that a learner with STRONG grades is not
// flagged off-track merely for low content-completion (the fix that stopped a 100% learner being
// wrongly flagged), while genuine mastery-low / missing-summative signals still fire.

const col = (over: Partial<GradebookColumn> = {}): GradebookColumn => ({
  key: "k1", itemId: null, sourceType: "assignment", sourceId: "a1", title: "A", category: "Assignments",
  itemType: "summative", gradeType: "points", pointsPossible: 100, dueDate: null, includeInGrade: true,
  editable: false, position: 0,
  ...over,
});

// A completion column (module content viewed). Formative + excluded from the grade, which is how the
// engine treats content completion: it feeds auto-scoring and the low-completion signal, not the mark.
const completionCol = (over: Partial<GradebookColumn> = {}): GradebookColumn =>
  col({ sourceType: "completion", itemType: "formative", gradeType: "completion", includeInGrade: false, pointsPossible: 1, ...over });

describe("computeLearner", () => {
  it("computes overall percent from included summative columns", () => {
    const cols = [col({ key: "k1" })];
    const c = computeLearner(cols, new Map([["k1", 0.9]]), undefined, false);
    expect(c.overallPercent).toBe(90);
  });

  it("returns null overall when there are no graded summative fractions", () => {
    const cols = [col({ key: "k1" })];
    const c = computeLearner(cols, new Map(), undefined, false);
    expect(c.overallPercent).toBeNull();
  });

  it("excludes non-graded (includeInGrade=false) columns from the overall", () => {
    const cols = [col({ key: "s1" }), col({ key: "c1", sourceType: "completion", itemType: "formative", includeInGrade: false, pointsPossible: 1 })];
    const c = computeLearner(cols, new Map([["s1", 0.8], ["c1", 0.1]]), undefined, false);
    expect(c.overallPercent).toBe(80); // completion column ignored
  });
});

describe("evaluateOffTrack", () => {
  it("flags mastery_low + off_track when overall is below the pass mark", () => {
    const cols = [col({ key: "k1" })];
    const c = computeLearner(cols, new Map([["k1", 0.5]]), undefined, false);
    const e = evaluateOffTrack(cols, c);
    expect(e.status).toBe("off_track");
    expect(e.reasons).toContain("mastery_low");
  });

  it("does NOT flag low_completion when graded performance is strong (the 100%-learner fix)", () => {
    const cols = [
      col({ key: "s1" }),
      col({ key: "c1", sourceType: "completion", itemType: "formative", includeInGrade: false, pointsPossible: 1 }),
    ];
    // Strong grade (95%), but low content-completion (10%).
    const c = computeLearner(cols, new Map([["s1", 0.95], ["c1", 0.1]]), undefined, false);
    const e = evaluateOffTrack(cols, c);
    expect(e.reasons).not.toContain("low_completion");
    expect(e.status).toBe("on_track");
  });

  it("DOES flag low_completion when grades are not strong", () => {
    const cols = [
      col({ key: "s1" }),
      col({ key: "c1", sourceType: "completion", itemType: "formative", includeInGrade: false, pointsPossible: 1 }),
    ];
    // Weak-but-passing-ish grade below PASS + low completion.
    const c = computeLearner(cols, new Map([["s1", 0.6], ["c1", 0.1]]), undefined, false);
    const e = evaluateOffTrack(cols, c);
    expect(e.status).toBe("off_track");
  });

  it("flags a missing overdue summative", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const cols = [col({ key: "k1", dueDate: past })];
    const c = computeLearner(cols, new Map(), undefined, false); // no score
    const e = evaluateOffTrack(cols, c);
    expect(e.reasons).toContain("missing_summative");
    expect(e.status).toBe("off_track");
  });

  it("is at_risk (not off_track) when overall sits between the pass and at-risk marks", () => {
    const cols = [col({ key: "k1" })];
    const c = computeLearner(cols, new Map([["k1", 0.75]]), undefined, false); // 75% -> [70,80)
    const e = evaluateOffTrack(cols, c);
    expect(e.status).toBe("at_risk");
    expect(e.reasons).toEqual([]);
  });

  it("flags trend_down on a declining summative series even when the average still passes", () => {
    const cols = [
      col({ key: "k1", sourceId: "a1", position: 0 }),
      col({ key: "k2", sourceId: "a2", position: 1 }),
      col({ key: "k3", sourceId: "a3", position: 2 }),
      col({ key: "k4", sourceId: "a4", position: 3 }),
    ];
    // Average = 71.25% (above the 70% pass), but the recent half is well below the early half.
    const c = computeLearner(cols, new Map([["k1", 0.9], ["k2", 0.85], ["k3", 0.6], ["k4", 0.5]]), undefined, false);
    expect(c.trend.dir).toBe("down");
    const e = evaluateOffTrack(cols, c);
    expect(e.reasons).toContain("trend_down");
    expect(e.status).toBe("off_track");
  });
});

describe("auto-score from completion", () => {
  it("fills an ungraded summative from the completion fraction and marks it auto", () => {
    const cols = [col({ key: "s1", sourceId: "a1" }), completionCol({ key: "c1", sourceId: "m1" })];
    const c = computeLearner(cols, new Map([["c1", 0.6]]), undefined, false); // s1 has no explicit grade
    expect(c.cells.s1.fraction).toBeCloseTo(0.6);
    expect(c.cells.s1.auto).toBe(true);
    expect(c.overallPercent).toBeCloseTo(60); // overall reflects the auto-filled score
  });

  it("averages multiple completion columns to drive the auto-fill", () => {
    const cols = [
      col({ key: "s1", sourceId: "a1" }),
      completionCol({ key: "c1", sourceId: "m1" }),
      completionCol({ key: "c2", sourceId: "m2" }),
    ];
    const c = computeLearner(cols, new Map([["c1", 0.4], ["c2", 0.8]]), undefined, false); // avg 0.6
    expect(c.cells.s1.fraction).toBeCloseTo(0.6);
    expect(c.cells.s1.auto).toBe(true);
  });

  it("does NOT auto-fill an explicitly graded summative", () => {
    const cols = [col({ key: "s1", sourceId: "a1" }), completionCol({ key: "c1", sourceId: "m1" })];
    const c = computeLearner(cols, new Map([["s1", 0.95], ["c1", 0.2]]), undefined, false);
    expect(c.cells.s1.fraction).toBeCloseTo(0.95);
    expect(c.cells.s1.auto).toBeUndefined();
  });
});

describe("grade type is display-only in the math", () => {
  it("pass_fail and completion grade types contribute by fraction like points do", () => {
    const cols = [
      col({ key: "pf", sourceId: "a1", gradeType: "pass_fail" }),
      col({ key: "pt", sourceId: "a2", gradeType: "points" }),
    ];
    const c = computeLearner(cols, new Map([["pf", 0.5], ["pt", 0.5]]), undefined, false);
    expect(c.overallPercent).toBeCloseTo(50); // grade type does not change the aggregate
  });
});

describe("weighted overall", () => {
  const settings = (over: Partial<GradebookSettings> = {}): GradebookSettings => ({
    weightingEnabled: true, summativeWeight: 100, formativeWeight: 0, categoryWeights: {},
    lettersEnabled: false, letterBands: DEFAULT_BANDS, ...over,
  });

  it("splits weight between summative and formative buckets", () => {
    const cols = [
      col({ key: "s1", sourceId: "a1", category: "Exams" }),
      col({ key: "f1", sourceId: "a2", category: "Homework", itemType: "formative" }),
    ];
    const c = computeLearner(cols, new Map([["s1", 0.8], ["f1", 0.6]]), undefined, false, settings({ summativeWeight: 70, formativeWeight: 30 }));
    expect(c.overallPercent).toBeCloseTo(74); // 0.8*70 + 0.6*30 = 74
  });

  it("applies per-category weights within the summative bucket", () => {
    const cols = [
      col({ key: "e1", sourceId: "a1", category: "Exams" }),
      col({ key: "q1", sourceId: "a2", category: "Quizzes" }),
    ];
    const c = computeLearner(cols, new Map([["e1", 0.9], ["q1", 0.5]]), undefined, false,
      settings({ categoryWeights: { Exams: 3, Quizzes: 1 } }));
    expect(c.overallPercent).toBeCloseTo(80); // (0.9*3 + 0.5*1)/4 = 0.8, vs 70 unweighted
  });
});

describe("letterFor", () => {
  it("maps percentages onto the default bands", () => {
    expect(letterFor(90, DEFAULT_BANDS)).toBe("A");
    expect(letterFor(89.9, DEFAULT_BANDS)).toBe("B");
    expect(letterFor(72, DEFAULT_BANDS)).toBe("C");
    expect(letterFor(0, DEFAULT_BANDS)).toBe("F");
  });
  it("returns null for a null percentage or empty bands", () => {
    expect(letterFor(null, DEFAULT_BANDS)).toBeNull();
    expect(letterFor(85, [])).toBeNull();
  });
});
