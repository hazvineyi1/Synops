import { describe, it, expect } from "vitest";
import { buildPdf } from "./accreditationExport";
import { LETTERHEAD } from "./letterhead";
import type { AccreditationReport } from "./accreditationEngine";

/**
 * Smoke test for the generated accreditation PDF: it must build a valid PDF end to end
 * (the letterhead helpers run against the real pdfkit document, catching any missing-method
 * regression the loose cast could otherwise hide) and must not carry an internal codename.
 */

const REPORT: AccreditationReport = {
  org: { id: "o1", name: "Acme Traders" },
  generatedAt: "2026-01-01T00:00:00.000Z",
  frameworks: ["qcto"],
  summary: {
    standardsInScope: 5, standardsCovered: 3, coveragePct: 60, standardsAssessed: 2, assessedPct: 40,
    overallMasteryPct: 71, learnersEvaluated: 12, coursesInScope: 4, coursesUnmapped: 1, standardsWithGaps: 2,
  },
  standards: [{
    framework: "qcto", code: "U1", title: "Test standard", nqfLevel: 4, credits: 8,
    coverageLevel: "full", status: "covered", enrolledLearners: 10, learnersCompleted: 6, completionPct: 60,
    learnersAssessed: 5, masteryPct: 70, passRatePct: 80, evidenceCount: 3, deliverables: [{ name: "Course A" }],
  }],
  gaps: { noEvidence: [{ code: "U2", title: "No evidence yet" }], unmappedCourses: [{ title: "Orphan course" }] },
} as unknown as AccreditationReport;

describe("accreditation PDF export", () => {
  it("builds a valid, non-empty PDF", async () => {
    const buf = await buildPdf(REPORT);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("uses the standard Synops Consulting Group letterhead identity", () => {
    // The generated report carries the registered provider name, never an internal codename.
    expect(LETTERHEAD.providerName).toBe("Synops Consulting Group");
    expect(LETTERHEAD.providerName).not.toMatch(/praxis|compass/i);
  });
});
