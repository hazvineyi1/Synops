import { describe, it, expect } from "vitest";
import {
  assembleEvidencePacket,
  type EvidencePacketInput,
  type PacketQaInput,
  DEFAULT_ACCENT_COLOR,
} from "@workspace/kanon-evidence-packet";
import type { QaReport } from "@workspace/kanon-curriculum-engine";

function baseInput(overrides: Partial<EvidencePacketInput> = {}): EvidencePacketInput {
  return {
    project: { id: 1, title: "BSN Pathophysiology", status: "active", stage: 3 },
    client: { id: 1, name: "Riverside School of Nursing", institution: "Riverside University" },
    courses: [{ id: 1, title: "Pathophysiology I", creditHours: 3 }],
    objectives: [
      { id: 10, text: "Analyze cellular responses to injury", cognitiveLevel: "Analyze", measurabilityStatus: "measurable" },
      { id: 11, text: "Understand homeostasis", cognitiveLevel: null, measurabilityStatus: null },
    ],
    assessments: [
      { id: 20, courseId: 1, title: "Case Study Exam", assessmentType: "summative", alignedObjectiveIds: [10] },
    ],
    framework: { name: "Commission on Collegiate Nursing Education", acronym: "CCNE" },
    competencies: [
      { id: 100, code: "1.1", description: "Apply foundational knowledge", domain: "Domain 1: Knowledge for Nursing Practice" },
      { id: 101, code: "1.2", description: "Integrate theory and evidence", domain: "Domain 1: Knowledge for Nursing Practice" },
      { id: 200, code: "2.1", description: "Establish therapeutic relationships", domain: "Domain 2: Person-Centered Care" },
    ],
    crosswalkLinks: [
      { competencyId: 100, objectiveId: 10, assessmentId: null, notes: "Direct map" },
      { competencyId: 101, objectiveId: null, assessmentId: 20, notes: null },
    ],
    qa: null,
    branding: { organizationName: "Riverside School of Nursing", tagline: "Care with evidence", accentColor: "not-a-hex" },
    generatedAt: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

function sampleQa(gateBlock: boolean): PacketQaInput {
  const report: QaReport = {
    findings: [
      { id: "f1", severity: "fail", category: "standards", targetType: "objective", targetId: "11", targetLabel: "Understand homeostasis", message: "Not mapped", remediation: "Map it" },
      { id: "f2", severity: "pass", category: "measurability", targetType: "objective", targetId: "10", targetLabel: "Analyze cellular responses", message: "Measurable verb" },
      { id: "f3", severity: "warn", category: "clarity", targetType: "objective", targetId: "11", targetLabel: "Understand homeostasis", message: "Vague" },
    ],
    score: 62,
    categoryScores: [
      { category: "measurability", passed: 1, total: 2, score: 50 },
      { category: "standards", passed: 0, total: 1, score: 0 },
    ],
    counts: { pass: 1, warn: 1, fail: 1 },
    bloomDistribution: [{ level: "Analyze", count: 1 }],
    objectiveAnalyses: [],
  };
  return { report, score: 62, status: gateBlock ? "fail" : "warn", gateBlock, runAt: "2026-06-23T12:00:00.000Z" };
}

describe("assembleEvidencePacket", () => {
  it("groups the matrix by domain and flags coverage and gaps", () => {
    const packet = assembleEvidencePacket(baseInput());

    expect(packet.matrix).toHaveLength(2);
    const domain1 = packet.matrix[0];
    expect(domain1.domain).toBe("Domain 1: Knowledge for Nursing Practice");
    expect(domain1.totalCount).toBe(2);
    expect(domain1.coveredCount).toBe(2);

    const row11 = domain1.rows.find((r) => r.competencyCode === "1.1")!;
    expect(row11.mappedObjectives.map((o) => o.ref)).toEqual(["LO1"]);
    expect(row11.notes).toEqual(["Direct map"]);
    const row12 = domain1.rows.find((r) => r.competencyCode === "1.2")!;
    expect(row12.mappedAssessments).toEqual(["Case Study Exam"]);

    // Competency 2.1 has no links -> gap.
    expect(packet.gaps).toHaveLength(1);
    expect(packet.gaps[0].competencyCode).toBe("2.1");
    expect(packet.summary.mappedCompetencyCount).toBe(2);
    expect(packet.summary.competencyCount).toBe(3);
    expect(packet.summary.coveragePercent).toBe(67);
  });

  it("builds the objectives table with stable refs and measurability counts", () => {
    const packet = assembleEvidencePacket(baseInput());
    expect(packet.objectives.map((o) => o.ref)).toEqual(["LO1", "LO2"]);
    expect(packet.objectives[0].bloom).toBe("Analyze");
    expect(packet.objectives[1].bloom).toBeNull();
    expect(packet.summary.measurableCount).toBe(1);
    expect(packet.summary.unclassifiedCount).toBe(1);
  });

  it("normalizes an invalid accent color to the neutral default", () => {
    const packet = assembleEvidencePacket(baseInput());
    expect(packet.branding.accentColor).toBe(DEFAULT_ACCENT_COLOR);
    const ok = assembleEvidencePacket(baseInput({ branding: { organizationName: "X", accentColor: "#aabbcc" } }));
    expect(ok.branding.accentColor).toBe("#aabbcc");
  });

  it("marks the packet as draft when no QA report exists", () => {
    const packet = assembleEvidencePacket(baseInput());
    expect(packet.qa).toBeNull();
    expect(packet.summary.qa).toBeNull();
    expect(packet.meta.isDraft).toBe(true);
    expect(packet.meta.draftReason).toMatch(/not been run/i);
  });

  it("includes a QA summary and excludes passing findings from top findings", () => {
    const packet = assembleEvidencePacket(baseInput({ qa: sampleQa(false) }));
    expect(packet.meta.isDraft).toBe(false);
    expect(packet.summary.qa?.score).toBe(62);
    expect(packet.qa?.categoryScores[0].label).toBe("Measurable outcomes");
    expect(packet.qa?.topFindings.every((f) => f.severity !== "pass")).toBe(true);
    expect(packet.qa?.topFindings).toHaveLength(2);
  });

  it("marks the packet as draft when the QA gate is blocked", () => {
    const packet = assembleEvidencePacket(baseInput({ qa: sampleQa(true) }));
    expect(packet.meta.isDraft).toBe(true);
    expect(packet.meta.draftReason).toMatch(/gate is blocked/i);
  });
});
