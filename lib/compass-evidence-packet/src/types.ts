// Evidence packet data model.
//
// This package is pure (no binary deps, no IO). It defines:
//  - input types that the API maps its DB rows into (decoupled from storage), and
//  - a normalized EvidencePacket output model that BOTH renderers (PDF, DOCX)
//    consume, so adding a second accreditor needs no renderer rework.

import type { QaReport, BloomLevel, RuleCategory, Severity } from "@workspace/compass-curriculum-engine";

// ---------------------------------------------------------------------------
// Inputs (mapped from DB rows by the API; never the raw storage shape).
// ---------------------------------------------------------------------------

export interface PacketProjectInput {
  id: number;
  title: string;
  status: string;
  stage: number;
  designMethod?: string | null;
  description?: string | null;
  targetDeliveryDate?: string | null;
}

export interface PacketClientInput {
  id: number;
  name: string;
  institution?: string | null;
}

export interface PacketCourseInput {
  id: number;
  title: string;
  creditHours?: number | null;
  modality?: string | null;
  accreditors?: string | null;
}

export interface PacketObjectiveInput {
  id: number;
  text: string;
  cognitiveLevel?: string | null;
  measurabilityStatus?: string | null;
}

export interface PacketAssessmentInput {
  id: number;
  courseId: number;
  title: string;
  assessmentType: string;
  alignedObjectiveIds: number[];
}

export interface PacketCompetencyInput {
  id: number;
  code: string;
  description: string;
  domain?: string | null;
}

export interface PacketCrosswalkLinkInput {
  competencyId: number;
  objectiveId?: number | null;
  assessmentId?: number | null;
  notes?: string | null;
}

export interface PacketFrameworkInput {
  name: string;
  acronym: string | null;
}

export interface PacketBrandingInput {
  organizationName: string;
  tagline?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
}

export interface PacketQaInput {
  report: QaReport;
  score: number;
  status: string;
  gateBlock: boolean;
  runAt: string;
}

export interface EvidencePacketInput {
  project: PacketProjectInput;
  client: PacketClientInput;
  courses: PacketCourseInput[];
  objectives: PacketObjectiveInput[];
  assessments: PacketAssessmentInput[];
  framework: PacketFrameworkInput;
  competencies: PacketCompetencyInput[];
  crosswalkLinks: PacketCrosswalkLinkInput[];
  qa: PacketQaInput | null;
  branding: PacketBrandingInput;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Output model (what both renderers consume).
// ---------------------------------------------------------------------------

// Neutral default used when an organization has no (valid) accent color.
export const DEFAULT_ACCENT_COLOR = "#1f3a5f";

export interface PacketMeta {
  title: string;
  accreditorName: string;
  accreditorAcronym: string | null;
  projectTitle: string;
  clientName: string;
  institution: string | null;
  courseTitles: string[];
  generatedAt: string;
  isDraft: boolean;
  draftReason: string | null;
}

export interface PacketBranding {
  organizationName: string;
  tagline: string | null;
  accentColor: string;
  logoUrl: string | null;
}

export interface PacketQaSummary {
  score: number;
  status: string;
  gateBlock: boolean;
  runAt: string;
  counts: { pass: number; warn: number; fail: number };
}

export interface PacketSummary {
  objectiveCount: number;
  assessmentCount: number;
  competencyCount: number;
  mappedCompetencyCount: number;
  coveragePercent: number;
  measurableCount: number;
  vagueCount: number;
  unmeasurableCount: number;
  unclassifiedCount: number;
  qa: PacketQaSummary | null;
}

export interface PacketMatrixObjectiveRef {
  ref: string;
  text: string;
}

export interface PacketMatrixRow {
  competencyCode: string;
  competencyDescription: string;
  mappedObjectives: PacketMatrixObjectiveRef[];
  mappedAssessments: string[];
  notes: string[];
  covered: boolean;
}

export interface PacketMatrixDomain {
  domain: string;
  rows: PacketMatrixRow[];
  coveredCount: number;
  totalCount: number;
}

export interface PacketObjectiveRow {
  ref: string;
  text: string;
  bloom: string | null;
  measurability: string | null;
}

export interface PacketCategoryScore {
  category: RuleCategory;
  label: string;
  score: number;
  passed: number;
  total: number;
}

export interface PacketFinding {
  severity: Severity;
  category: RuleCategory;
  categoryLabel: string;
  targetLabel: string;
  message: string;
  remediation: string | null;
}

export interface PacketQaDetail {
  categoryScores: PacketCategoryScore[];
  topFindings: PacketFinding[];
  bloomDistribution: { level: BloomLevel; count: number }[];
}

export interface PacketGap {
  competencyCode: string;
  competencyDescription: string;
  domain: string | null;
}

export interface EvidencePacket {
  meta: PacketMeta;
  branding: PacketBranding;
  summary: PacketSummary;
  matrix: PacketMatrixDomain[];
  objectives: PacketObjectiveRow[];
  qa: PacketQaDetail | null;
  gaps: PacketGap[];
}
