// Pure assembler: maps decoupled inputs into the normalized EvidencePacket model.
// Framework-agnostic; it never assumes CCNE specifically.

import { RULE_CATEGORY_LABELS } from "@workspace/compass-curriculum-engine";
import {
  DEFAULT_ACCENT_COLOR,
  type EvidencePacket,
  type EvidencePacketInput,
  type PacketAssessmentInput,
  type PacketBranding,
  type PacketGap,
  type PacketMatrixDomain,
  type PacketMatrixObjectiveRef,
  type PacketMatrixRow,
  type PacketMeta,
  type PacketObjectiveInput,
  type PacketObjectiveRow,
  type PacketQaDetail,
  type PacketQaSummary,
  type PacketSummary,
} from "./types";

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeAccent(raw?: string | null): string {
  const v = raw?.trim();
  return v && HEX_RE.test(v) ? v : DEFAULT_ACCENT_COLOR;
}

export function assembleEvidencePacket(input: EvidencePacketInput): EvidencePacket {
  const {
    project,
    client,
    courses,
    objectives,
    assessments,
    framework,
    competencies,
    crosswalkLinks,
    qa,
    branding,
  } = input;

  // Stable, human-friendly reference for each objective (LO1, LO2, ...).
  const objRef = new Map<number, string>();
  objectives.forEach((o, i) => objRef.set(o.id, `LO${i + 1}`));

  const objectiveById = new Map<number, PacketObjectiveInput>();
  objectives.forEach((o) => objectiveById.set(o.id, o));
  const assessmentById = new Map<number, PacketAssessmentInput>();
  assessments.forEach((a) => assessmentById.set(a.id, a));

  const linksByCompetency = new Map<number, EvidencePacketInput["crosswalkLinks"]>();
  for (const link of crosswalkLinks) {
    const arr = linksByCompetency.get(link.competencyId) ?? [];
    arr.push(link);
    linksByCompetency.set(link.competencyId, arr);
  }

  // Build one matrix row per competency, capturing its domain for grouping.
  interface BuiltRow extends PacketMatrixRow {
    domain: string;
  }
  const builtRows: BuiltRow[] = competencies.map((c) => {
    const links = linksByCompetency.get(c.id) ?? [];
    const mappedObjectives: PacketMatrixObjectiveRef[] = [];
    const mappedAssessments: string[] = [];
    const notes: string[] = [];
    const seenObj = new Set<number>();
    const seenAssess = new Set<number>();
    for (const link of links) {
      if (link.objectiveId != null && !seenObj.has(link.objectiveId)) {
        const o = objectiveById.get(link.objectiveId);
        if (o) {
          mappedObjectives.push({ ref: objRef.get(o.id) ?? `#${o.id}`, text: o.text });
          seenObj.add(link.objectiveId);
        }
      }
      if (link.assessmentId != null && !seenAssess.has(link.assessmentId)) {
        const a = assessmentById.get(link.assessmentId);
        if (a) {
          mappedAssessments.push(a.title);
          seenAssess.add(link.assessmentId);
        }
      }
      const note = link.notes?.trim();
      if (note) notes.push(note);
    }
    return {
      domain: c.domain?.trim() || "Ungrouped",
      competencyCode: c.code,
      competencyDescription: c.description,
      mappedObjectives,
      mappedAssessments,
      notes,
      covered: mappedObjectives.length > 0 || mappedAssessments.length > 0,
    };
  });

  // Group rows by domain, preserving first-seen order.
  const domainOrder: string[] = [];
  const domainRows = new Map<string, PacketMatrixRow[]>();
  for (const r of builtRows) {
    if (!domainRows.has(r.domain)) {
      domainRows.set(r.domain, []);
      domainOrder.push(r.domain);
    }
    const { domain: _domain, ...row } = r;
    domainRows.get(r.domain)!.push(row);
  }
  const matrix: PacketMatrixDomain[] = domainOrder.map((domain) => {
    const rows = domainRows.get(domain)!;
    return {
      domain,
      rows,
      coveredCount: rows.filter((x) => x.covered).length,
      totalCount: rows.length,
    };
  });

  const gaps: PacketGap[] = builtRows
    .filter((r) => !r.covered)
    .map((r) => ({
      competencyCode: r.competencyCode,
      competencyDescription: r.competencyDescription,
      domain: r.domain,
    }));

  const mappedCompetencyCount = builtRows.filter((r) => r.covered).length;
  const competencyCount = competencies.length;
  const coveragePercent = competencyCount
    ? Math.round((mappedCompetencyCount / competencyCount) * 100)
    : 0;

  let measurableCount = 0;
  let vagueCount = 0;
  let unmeasurableCount = 0;
  let unclassifiedCount = 0;
  const objectiveRows: PacketObjectiveRow[] = objectives.map((o) => {
    const m = o.measurabilityStatus?.trim() || null;
    if (m === "measurable") measurableCount++;
    else if (m === "vague") vagueCount++;
    else if (m === "unmeasurable") unmeasurableCount++;
    else unclassifiedCount++;
    return {
      ref: objRef.get(o.id) ?? `#${o.id}`,
      text: o.text,
      bloom: o.cognitiveLevel?.trim() || null,
      measurability: m,
    };
  });

  let qaDetail: PacketQaDetail | null = null;
  let qaSummary: PacketQaSummary | null = null;
  if (qa) {
    const r = qa.report;
    qaDetail = {
      categoryScores: r.categoryScores.map((cs) => ({
        category: cs.category,
        label: RULE_CATEGORY_LABELS[cs.category],
        score: cs.score,
        passed: cs.passed,
        total: cs.total,
      })),
      topFindings: r.findings
        .filter((f) => f.severity !== "pass")
        .slice(0, 12)
        .map((f) => ({
          severity: f.severity,
          category: f.category,
          categoryLabel: RULE_CATEGORY_LABELS[f.category],
          targetLabel: f.targetLabel,
          message: f.message,
          remediation: f.remediation ?? null,
        })),
      bloomDistribution: r.bloomDistribution,
    };
    qaSummary = {
      score: qa.score,
      status: qa.status,
      gateBlock: qa.gateBlock,
      runAt: qa.runAt,
      counts: r.counts,
    };
  }

  const isDraft = !qa || qa.gateBlock;
  const draftReason = !qa
    ? "QA has not been run for this project"
    : qa.gateBlock
      ? "QA gate is blocked by unresolved failures"
      : null;

  const meta: PacketMeta = {
    title: `${framework.acronym ?? "Accreditation"} Curriculum Alignment Evidence Packet`,
    accreditorName: framework.name,
    accreditorAcronym: framework.acronym,
    projectTitle: project.title,
    clientName: client.name,
    institution: client.institution?.trim() || null,
    courseTitles: courses.map((c) => c.title),
    generatedAt: input.generatedAt,
    isDraft,
    draftReason,
  };

  const packetBranding: PacketBranding = {
    organizationName: branding.organizationName,
    tagline: branding.tagline?.trim() || null,
    accentColor: normalizeAccent(branding.accentColor),
    logoUrl: branding.logoUrl?.trim() || null,
  };

  const summary: PacketSummary = {
    objectiveCount: objectives.length,
    assessmentCount: assessments.length,
    competencyCount,
    mappedCompetencyCount,
    coveragePercent,
    measurableCount,
    vagueCount,
    unmeasurableCount,
    unclassifiedCount,
    qa: qaSummary,
  };

  return {
    meta,
    branding: packetBranding,
    summary,
    matrix,
    objectives: objectiveRows,
    qa: qaDetail,
    gaps,
  };
}
