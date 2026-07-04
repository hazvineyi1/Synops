import { describe, it, expect } from "vitest";
import {
  detectVerb,
  evaluateCourse,
  type EngineCourse,
} from "./index";

describe("detectVerb", () => {
  it("classifies a measurable Bloom verb", () => {
    const d = detectVerb("Analyze the causes of the 2008 financial crisis.");
    expect(d.kind).toBe("measurable");
    expect(d.bloomLevel).toBe("Analyze");
    expect(d.verb).toBe("analyze");
  });

  it("strips a leading stem before classifying", () => {
    const d = detectVerb(
      "By the end of the unit, students will be able to design a data dashboard.",
    );
    expect(d.kind).toBe("measurable");
    expect(d.bloomLevel).toBe("Create");
    expect(d.verb).toBe("design");
  });

  it("flags a non-observable verb as vague", () => {
    const d = detectVerb("Understand how charts can mislead an audience.");
    expect(d.kind).toBe("vague");
    expect(d.bloomLevel).toBeNull();
    expect(d.suggestion).toBeTruthy();
  });

  it("flags a vague lead phrase as vague", () => {
    const d = detectVerb("Become familiar with bias in data collection.");
    expect(d.kind).toBe("vague");
  });

  it("returns missing for empty text", () => {
    expect(detectVerb("   ").kind).toBe("missing");
  });
});

describe("evaluateCourse", () => {
  const course: EngineCourse = {
    title: "Foundations of Data Literacy",
    gradeBand: "Intro",
    termWeeks: 12,
    objectives: [
      { id: "o1", text: "Interpret measures of center and spread to compare two data sets.", standardId: "s1", standardLabel: "Math HSS.ID.A.2" },
      { id: "o2", text: "Understand how data visualizations can mislead an audience.", standardId: "s2", standardLabel: "ELA RST.9-10.7" },
      { id: "o3", text: "Design a data dashboard that answers a real-world question.", standardId: null },
      { id: "o4", text: "Recognize common sources of bias in data collection.", standardId: "s3", standardLabel: "ELA RI.9-10.1" },
    ],
    assessments: [
      { id: "a1", title: "Unit 1 data analysis quiz", type: "summative", objectiveIds: ["o1"] },
      { id: "a2", title: "Misleading-chart critique", type: "formative", objectiveIds: ["o2", "o4"] },
    ],
  };

  const report = evaluateCourse(course);

  it("produces a score strictly between 0 and 100 for an imperfect course", () => {
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThan(100);
  });

  it("fails measurability on the vague objective (o2)", () => {
    const f = report.findings.find((x) => x.id === "measure-o2");
    expect(f?.severity).toBe("fail");
  });

  it("fails standards alignment on the unmapped objective (o3)", () => {
    const f = report.findings.find((x) => x.id === "standard-o3");
    expect(f?.severity).toBe("fail");
  });

  it("fails assessment coverage on the unassessed objective (o3)", () => {
    const f = report.findings.find((x) => x.id === "assess-o3");
    expect(f?.severity).toBe("fail");
  });

  it("passes measurability on the well-formed objectives (o1, o4)", () => {
    expect(report.findings.find((x) => x.id === "measure-o1")?.severity).toBe("pass");
    expect(report.findings.find((x) => x.id === "measure-o4")?.severity).toBe("pass");
  });

  it("emits exactly five category scores", () => {
    expect(report.categoryScores).toHaveLength(5);
  });

  it("reports a Bloom distribution covering detected levels", () => {
    const levels = report.bloomDistribution.map((b) => b.level);
    expect(levels).toContain("Understand"); // o1 Interpret
    expect(levels).toContain("Create"); // o3 Design
    expect(levels).toContain("Remember"); // o4 Recognize
  });

  it("uses the human-readable standard label in the pass message", () => {
    const f = report.findings.find((x) => x.id === "standard-o1");
    expect(f?.message).toContain("Math HSS.ID.A.2");
  });
});
