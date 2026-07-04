// Demo-only curriculum data, sector templates, and presentation helpers for the
// public Curriculum Builder demo.
//
// The actual rules engine now lives in the shared @workspace/compass-curriculum-engine
// package, so the public demo and the Compass API evaluate curricula with the same
// code. This module re-exports that engine for existing demo imports, adapts the
// demo's in-memory course shape to the engine's generalized input, and keeps the
// demo-specific standards picklist, starter templates, and markdown report renderer.

import {
  evaluateCurriculum,
  RULE_CATEGORY_LABELS,
  type CurriculumEvaluationInput,
  type QaReport,
  type Severity,
} from "@workspace/compass-curriculum-engine";

// Re-export every pure engine symbol so existing imports from
// "@/lib/curriculumRules" keep resolving (detectVerb, RULE_CATEGORY_LABELS,
// BLOOM_LEVELS, and all shared types).
export * from "@workspace/compass-curriculum-engine";

export interface DemoStandard {
  id: string;
  framework: string;
  code: string;
  label: string;
}

// A small, realistic standards picklist grouped by framework. Curated so the
// demo reads like a real cross-framework course without needing a live catalog.
// Frameworks span accreditation (nursing), workforce, and K-12 so the demo can
// tailor itself to the visitor's sector.
export const DEMO_STANDARDS: DemoStandard[] = [
  // Nursing accreditation: AACN Essentials, as reviewed for CCNE accreditation.
  { id: "ccne-d1", framework: "Nursing (CCNE)", code: "Domain 1", label: "Knowledge for nursing practice" },
  { id: "ccne-d2", framework: "Nursing (CCNE)", code: "Domain 2", label: "Person-centered care" },
  { id: "ccne-d5", framework: "Nursing (CCNE)", code: "Domain 5", label: "Quality and safety" },
  { id: "ccne-d6", framework: "Nursing (CCNE)", code: "Domain 6", label: "Interprofessional partnerships" },
  { id: "ccne-d8", framework: "Nursing (CCNE)", code: "Domain 8", label: "Informatics and healthcare technologies" },
  // Nursing accreditation: ACEN standards and end-of-program outcomes.
  { id: "acen-curriculum", framework: "Nursing (ACEN)", code: "Std 4", label: "Curriculum aligned to professional nursing standards" },
  { id: "acen-outcomes", framework: "Nursing (ACEN)", code: "Std 6", label: "End-of-program student learning outcomes" },
  // Workforce and professional development.
  { id: "atd-id", framework: "Workforce (ATD)", code: "ATD", label: "Instructional design and learning sciences" },
  { id: "atd-pc", framework: "Workforce (ATD)", code: "ATD", label: "Performance improvement and consulting" },
  { id: "shrm-lead", framework: "Leadership (SHRM)", code: "SHRM", label: "Leadership and navigation" },
  { id: "shrm-comm", framework: "Leadership (SHRM)", code: "SHRM", label: "Communication" },
  // K-12 frameworks.
  { id: "ccss-rst-9-10-7", framework: "ELA (CCSS)", code: "RST.9-10.7", label: "Translate technical information expressed in words and visuals" },
  { id: "ccss-ri-9-10-1", framework: "ELA (CCSS)", code: "RI.9-10.1", label: "Cite strong textual evidence to support analysis" },
  { id: "ccss-hss-id-a-2", framework: "Math (CCSS)", code: "HSS.ID.A.2", label: "Use statistics to compare center and spread of data sets" },
  { id: "ccss-hsf-if-b-4", framework: "Math (CCSS)", code: "HSF.IF.B.4", label: "Interpret key features of graphs and tables" },
  { id: "iste-1-5", framework: "Technology (ISTE)", code: "1.5", label: "Computational Thinker" },
  { id: "iste-1-3", framework: "Technology (ISTE)", code: "1.3", label: "Knowledge Constructor" },
  { id: "ngss-hs-ets1-2", framework: "Science (NGSS)", code: "HS-ETS1-2", label: "Design a solution to a complex real-world problem" },
];

export const DEMO_STANDARD_MAP: Record<string, DemoStandard> = Object.fromEntries(
  DEMO_STANDARDS.map((s) => [s.id, s]),
);

export type AssessmentType = "formative" | "summative";

export interface DemoObjective {
  id: string;
  text: string;
  standardId: string | null;
}

export interface DemoAssessment {
  id: string;
  title: string;
  type: AssessmentType;
  objectiveIds: string[];
}

export interface DemoCourse {
  title: string;
  gradeBand: string;
  termWeeks: number | null;
  objectives: DemoObjective[];
  assessments: DemoAssessment[];
}

/** Adapt the demo's in-memory course to the engine's generalized input. */
function demoCourseToInput(course: DemoCourse): CurriculumEvaluationInput {
  return {
    title: course.title,
    gradeBand: course.gradeBand,
    termWeeks: course.termWeeks,
    objectives: course.objectives.map((o) => {
      const std = o.standardId ? DEMO_STANDARD_MAP[o.standardId] : null;
      return {
        id: o.id,
        text: o.text,
        standardAlignmentIds: o.standardId ? [o.standardId] : [],
        standardAlignmentLabel: std ? `${std.framework} ${std.code}` : undefined,
      };
    }),
    assessments: course.assessments.map((a) => ({
      id: a.id,
      title: a.title,
      objectiveIds: a.objectiveIds,
    })),
  };
}

/** Evaluate a demo course with the shared rules engine. */
export function evaluateCourse(course: DemoCourse): QaReport {
  return evaluateCurriculum(demoCourseToInput(course));
}

let idCounter = 0;
export function nextDemoId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

// Sector starter templates. Each one is intentionally imperfect (one vague
// outcome, one unmapped outcome, one outcome with no assessment) so the QA stage
// has real issues to surface; the visitor fixes them and watches the score climb.
// This is the core demo hook, so it works across the sectors we sell into.
export type CourseTemplateId = "healthcare" | "corporate" | "k12";

export interface CourseTemplate {
  id: CourseTemplateId;
  name: string;
  audience: string;
  tagline: string;
  build: () => DemoCourse;
}

/** Healthcare: a prelicensure nursing course mapped to CCNE and ACEN standards. */
function buildHealthcareCourse(): DemoCourse {
  const o1 = nextDemoId("obj");
  const o2 = nextDemoId("obj");
  const o3 = nextDemoId("obj");
  const o4 = nextDemoId("obj");
  return {
    title: "Medical-Surgical Nursing: Adult Acute Care",
    gradeBand: "Prelicensure BSN",
    termWeeks: 15,
    objectives: [
      {
        id: o1,
        text: "Assess a postoperative patient for early signs of hemorrhage and infection.",
        standardId: "ccne-d2",
      },
      {
        id: o2,
        text: "Understand the pathophysiology of heart failure.",
        standardId: "ccne-d1",
      },
      {
        id: o3,
        text: "Demonstrate safe medication administration using the rights of medication administration.",
        standardId: null,
      },
      {
        id: o4,
        text: "Recognize early signs of clinical deterioration and escalate care.",
        standardId: "acen-outcomes",
      },
    ],
    assessments: [
      {
        id: nextDemoId("asm"),
        title: "Medical-surgical comprehensive exam",
        type: "summative",
        objectiveIds: [o1, o2],
      },
      {
        id: nextDemoId("asm"),
        title: "Medication administration skills validation",
        type: "formative",
        objectiveIds: [o3],
      },
    ],
  };
}

/** Corporate: a new-manager leadership program mapped to ATD and SHRM. */
function buildCorporateCourse(): DemoCourse {
  const o1 = nextDemoId("obj");
  const o2 = nextDemoId("obj");
  const o3 = nextDemoId("obj");
  const o4 = nextDemoId("obj");
  return {
    title: "Leadership Essentials for New Managers",
    gradeBand: "Workforce / corporate L&D",
    termWeeks: 6,
    objectives: [
      {
        id: o1,
        text: "Demonstrate active-listening techniques during a one-on-one meeting.",
        standardId: "shrm-comm",
      },
      {
        id: o2,
        text: "Understand the difference between managing and leading.",
        standardId: "shrm-lead",
      },
      {
        id: o3,
        text: "Apply a structured feedback model to deliver constructive feedback.",
        standardId: null,
      },
      {
        id: o4,
        text: "Develop a 30-60-90 day onboarding plan for a new team member.",
        standardId: "atd-id",
      },
    ],
    assessments: [
      {
        id: nextDemoId("asm"),
        title: "Leadership scenario role-play",
        type: "formative",
        objectiveIds: [o1, o2],
      },
      {
        id: nextDemoId("asm"),
        title: "Feedback conversation simulation",
        type: "summative",
        objectiveIds: [o3],
      },
    ],
  };
}

/** K-12: a data-literacy course mapped to Common Core standards. */
function buildK12Course(): DemoCourse {
  const o1 = nextDemoId("obj");
  const o2 = nextDemoId("obj");
  const o3 = nextDemoId("obj");
  const o4 = nextDemoId("obj");
  return {
    title: "Foundations of Data Literacy",
    gradeBand: "Grades 9 to 10",
    termWeeks: 12,
    objectives: [
      {
        id: o1,
        text: "Interpret measures of center and spread to compare two data sets.",
        standardId: "ccss-hss-id-a-2",
      },
      {
        id: o2,
        text: "Understand how data visualizations can mislead an audience.",
        standardId: "ccss-rst-9-10-7",
      },
      {
        id: o3,
        text: "Design a data dashboard that answers a real-world question.",
        standardId: null,
      },
      {
        id: o4,
        text: "Recognize common sources of bias in data collection.",
        standardId: "ccss-ri-9-10-1",
      },
    ],
    assessments: [
      {
        id: nextDemoId("asm"),
        title: "Unit 1 data analysis quiz",
        type: "summative",
        objectiveIds: [o1],
      },
      {
        id: nextDemoId("asm"),
        title: "Misleading-chart critique",
        type: "formative",
        objectiveIds: [o2, o4],
      },
    ],
  };
}

export const COURSE_TEMPLATES: CourseTemplate[] = [
  {
    id: "healthcare",
    name: "Healthcare and nursing",
    audience: "Prelicensure BSN",
    tagline: "Aligned to CCNE Essentials and ACEN standards.",
    build: buildHealthcareCourse,
  },
  {
    id: "corporate",
    name: "Corporate and workforce",
    audience: "Workforce / corporate L&D",
    tagline: "Leadership and onboarding aligned to ATD and SHRM.",
    build: buildCorporateCourse,
  },
  {
    id: "k12",
    name: "K-12 classroom",
    audience: "Grades 9 to 10",
    tagline: "Data literacy aligned to Common Core.",
    build: buildK12Course,
  },
];

export const COURSE_TEMPLATE_MAP: Record<CourseTemplateId, CourseTemplate> =
  Object.fromEntries(COURSE_TEMPLATES.map((t) => [t.id, t])) as Record<
    CourseTemplateId,
    CourseTemplate
  >;

/** Build a fresh course from a named sector template. */
export function buildTemplateCourse(id: CourseTemplateId): DemoCourse {
  return (COURSE_TEMPLATE_MAP[id] ?? COURSE_TEMPLATES[0]).build();
}

/** Default starter course for the demo: the healthcare/nursing template. */
export function buildExampleCourse(): DemoCourse {
  return buildHealthcareCourse();
}

function severitySymbol(severity: Severity): string {
  if (severity === "pass") return "[pass]";
  if (severity === "warn") return "[warn]";
  return "[fail]";
}

/** Render a plain-text / markdown handoff report for export. */
export function renderQaReportMarkdown(course: DemoCourse, report: QaReport): string {
  const lines: string[] = [];
  lines.push(`# ${course.title || "Untitled course"} - Curriculum QA Report`);
  lines.push("");
  lines.push(`Audience or level: ${course.gradeBand || "Not set"}`);
  lines.push(`Term length: ${course.termWeeks ? `${course.termWeeks} weeks` : "Not set"}`);
  lines.push(`Overall QA score: ${report.score}%`);
  lines.push(
    `Checks: ${report.counts.pass} passed, ${report.counts.warn} advisory, ${report.counts.fail} to fix`,
  );
  lines.push("");

  lines.push("## Category scores");
  for (const c of report.categoryScores) {
    lines.push(`- ${RULE_CATEGORY_LABELS[c.category]}: ${c.score}%`);
  }
  lines.push("");

  lines.push("## Learning outcomes");
  course.objectives.forEach((o, i) => {
    const analysis = report.objectiveAnalyses.find((a) => a.objectiveId === o.id);
    const std = o.standardId ? DEMO_STANDARD_MAP[o.standardId] : null;
    lines.push(`${i + 1}. ${o.text || "Untitled outcome"}`);
    lines.push(
      `   Bloom level: ${analysis?.detection.bloomLevel ?? "not detected"}; Standard: ${std ? `${std.framework} ${std.code}` : "unmapped"}; Assessments: ${analysis?.assessmentCount ?? 0}`,
    );
  });
  lines.push("");

  lines.push("## Assessments");
  course.assessments.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.title || "Untitled assessment"} (${a.type})`);
  });
  lines.push("");

  const openItems = report.findings.filter((f) => f.severity !== "pass");
  lines.push("## Items to resolve");
  if (openItems.length === 0) {
    lines.push("None. All checks passed.");
  } else {
    for (const f of openItems) {
      lines.push(`- ${severitySymbol(f.severity)} ${f.targetLabel}: ${f.message}`);
      if (f.remediation) lines.push(`  Fix: ${f.remediation}`);
    }
  }
  lines.push("");
  lines.push("Generated by the Synops Curriculum Builder demo.");
  return lines.join("\n");
}
