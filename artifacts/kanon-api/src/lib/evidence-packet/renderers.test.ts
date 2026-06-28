import { describe, it, expect } from "vitest";
import {
  assembleEvidencePacket,
  type EvidencePacketInput,
} from "@workspace/kanon-evidence-packet";
import type { QaReport } from "@workspace/kanon-curriculum-engine";
import { renderEvidencePacketPdf } from "./pdf";
import { renderEvidencePacketDocx } from "./docx";

function sampleReport(): QaReport {
  return {
    score: 72,
    counts: { pass: 8, warn: 2, fail: 1 },
    categoryScores: [
      { category: "measurability", score: 80, passed: 4, total: 5 },
      { category: "standards", score: 60, passed: 3, total: 5 },
    ],
    findings: [
      {
        id: "f1",
        severity: "fail",
        category: "standards",
        targetType: "objective",
        targetLabel: "LO2",
        message: "Objective is not mapped to any CCNE competency.",
        remediation: "Add a crosswalk link to a CCNE domain.",
      },
      {
        id: "f2",
        severity: "pass",
        category: "measurability",
        targetType: "objective",
        targetLabel: "LO1",
        message: "Objective uses a measurable verb.",
      },
    ],
    bloomDistribution: [
      { level: "Apply", count: 2 },
      { level: "Analyze", count: 1 },
    ],
    objectiveAnalyses: [],
  };
}

function sampleInput(withQa: boolean): EvidencePacketInput {
  return {
    project: { id: 1, title: "RN to BSN Bridge", status: "active", stage: 3 },
    client: { id: 1, name: "Riverside School of Nursing", institution: "Riverside University" },
    courses: [{ id: 1, title: "Foundations of Nursing Practice" }],
    objectives: [
      { id: 10, text: "Apply foundational nursing science to care decisions.", cognitiveLevel: "Apply", measurabilityStatus: "measurable" },
      { id: 11, text: "Understand health equity concepts.", cognitiveLevel: "Understand", measurabilityStatus: "vague" },
    ],
    assessments: [{ id: 20, courseId: 1, title: "Case Study Analysis", assessmentType: "summative", alignedObjectiveIds: [10] }],
    framework: { name: "Commission on Collegiate Nursing Education", acronym: "CCNE" },
    competencies: [
      { id: 100, code: "1.1", description: "Apply foundational knowledge to practice.", domain: "Domain 1: Knowledge for Nursing Practice" },
      { id: 101, code: "3.3", description: "Advance health equity.", domain: "Domain 3: Population Health" },
    ],
    crosswalkLinks: [{ competencyId: 100, objectiveId: 10, assessmentId: 20, notes: "Direct alignment" }],
    qa: withQa
      ? { report: sampleReport(), score: 72, status: "warn", gateBlock: true, runAt: "2026-06-24T00:00:00.000Z" }
      : null,
    branding: { organizationName: "Riverside Health", tagline: "Educating the next generation", accentColor: "#0b6e4f", logoUrl: null },
    generatedAt: "2026-06-24T12:00:00.000Z",
  };
}

describe("evidence packet renderers", () => {
  it("renders a non-empty PDF with the %PDF magic header", async () => {
    const packet = assembleEvidencePacket(sampleInput(true));
    const buf = await renderEvidencePacketPdf(packet);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a non-empty DOCX with the PK zip magic header", async () => {
    const packet = assembleEvidencePacket(sampleInput(true));
    const buf = await renderEvidencePacketDocx(packet);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("renders both formats when QA has not been run (no-QA / draft path)", async () => {
    const packet = assembleEvidencePacket(sampleInput(false));
    expect(packet.meta.isDraft).toBe(true);
    const pdf = await renderEvidencePacketPdf(packet);
    const docx = await renderEvidencePacketDocx(packet);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(docx.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
