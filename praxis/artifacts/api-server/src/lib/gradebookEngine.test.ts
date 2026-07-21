import { describe, it, expect } from "vitest";
import { computeLearner, evaluateOffTrack, type GradebookColumn } from "./gradebookEngine";

// Pure gradebook math that feeds credentials and off-track alerts. These assert the exact behaviours
// the Section-A/B work depends on: correct overall %, and that a learner with STRONG grades is not
// flagged off-track merely for low content-completion (the fix that stopped a 100% learner being
// wrongly flagged), while genuine mastery-low / missing-summative signals still fire.

const col = (over: Partial<GradebookColumn> = {}): GradebookColumn => ({
  key: "k1", itemId: null, sourceType: "assignment", sourceId: "a1", title: "A", category: "Assignments",
  itemType: "summative", pointsPossible: 100, dueDate: null, includeInGrade: true, editable: false, position: 0,
  ...over,
});

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
});
