// Deterministic, rules-based curriculum quality engine.
//
// Pure functions only: no network, no secrets, no randomness, no database. This is
// the single source of curriculum intelligence, shared by two callers - the public
// marketing demo (client-side, instant feedback) and the Compass API (server-side,
// authoritative, persisted). The input is intentionally decoupled from any caller's
// storage shape (see CurriculumEvaluationInput); each caller adapts its own data
// into this shape before evaluating.

export type Severity = "pass" | "warn" | "fail";

export type RuleCategory =
  | "measurability"
  | "standards"
  | "assessment"
  | "clarity"
  | "structure";

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  measurability: "Measurable outcomes",
  standards: "Standards alignment",
  assessment: "Assessment coverage",
  clarity: "Clarity and accessibility",
  structure: "Course structure",
};

export const BLOOM_LEVELS = [
  "Remember",
  "Understand",
  "Apply",
  "Analyze",
  "Evaluate",
  "Create",
] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

const BLOOM_VERBS: Record<BloomLevel, string[]> = {
  Remember: [
    "define", "list", "identify", "name", "recall", "label", "recognize",
    "state", "match", "repeat", "record", "select",
  ],
  Understand: [
    "explain", "summarize", "classify", "compare", "interpret", "paraphrase",
    "describe", "discuss", "illustrate", "translate", "restate", "report",
  ],
  Apply: [
    "apply", "demonstrate", "solve", "use", "calculate", "implement", "compute",
    "execute", "model", "operate", "modify", "graph",
  ],
  Analyze: [
    "analyze", "differentiate", "organize", "examine", "contrast", "investigate",
    "categorize", "deconstruct", "distinguish", "outline", "diagram",
  ],
  Evaluate: [
    "evaluate", "critique", "judge", "assess", "justify", "defend", "argue",
    "appraise", "rank", "prioritize", "recommend", "validate",
  ],
  Create: [
    "create", "design", "construct", "develop", "formulate", "produce",
    "compose", "plan", "generate", "build", "devise", "propose",
  ],
};

// Non-observable verbs that cannot be directly measured and should be rewritten.
const VAGUE_VERBS = new Set([
  "understand", "know", "learn", "appreciate", "comprehend", "grasp", "realize",
  "value", "believe", "internalize", "cover", "study", "familiarize", "explore",
  "consider", "think",
]);

// Multi-word stems that wrap an objective before the real action verb.
const LEADING_STEMS = [
  /^by the end of (this|the) (course|unit|lesson|module|term)[,:]?\s*/,
  /^the (learner|student)s?\s+will be able to\s+/,
  /^the (learner|student)s?\s+will\s+/,
  /^(learner|student)s?\s+will be able to\s+/,
  /^(learner|student)s?\s+will\s+/,
  /^swbat\s+/,
  /^be able to\s+/,
  /^able to\s+/,
  /^to\s+/,
];

// Multi-word vague phrases that imply a non-measurable outcome.
const VAGUE_PHRASES = [
  "be aware of",
  "become familiar with",
  "be familiar with",
  "gain an understanding of",
  "gain knowledge of",
  "have knowledge of",
  "develop an appreciation",
];

const MEASURABLE_VERB_SUGGESTION =
  "Rewrite with an observable verb such as explain, analyze, apply, evaluate, or design.";

// A persisted, enum-friendly summary of an objective's measurability, derived from
// the verb detection. Stored back onto objectives so the UI can badge them.
export type MeasurabilityStatus = "measurable" | "vague" | "unmeasurable";

export interface VerbDetection {
  verb: string | null;
  bloomLevel: BloomLevel | null;
  kind: "measurable" | "vague" | "missing";
  suggestion?: string;
}

/**
 * Inspect an objective's wording and classify its action verb. Strips common
 * objective stems ("Students will be able to ...") first, then matches the
 * leading verb against Bloom's taxonomy or the non-measurable verb list.
 */
export function detectVerb(rawText: string): VerbDetection {
  let text = rawText.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { verb: null, bloomLevel: null, kind: "missing" };

  // Strip wrapping stems repeatedly (e.g. "By the end of the unit, students will be able to").
  let changed = true;
  while (changed) {
    changed = false;
    for (const stem of LEADING_STEMS) {
      const next = text.replace(stem, "");
      if (next !== text) {
        text = next.trim();
        changed = true;
      }
    }
  }

  for (const phrase of VAGUE_PHRASES) {
    if (text.startsWith(phrase)) {
      return {
        verb: phrase,
        bloomLevel: null,
        kind: "vague",
        suggestion: MEASURABLE_VERB_SUGGESTION,
      };
    }
  }

  const firstWord = text.split(" ")[0]?.replace(/[^a-z]/g, "") ?? "";
  if (!firstWord) return { verb: null, bloomLevel: null, kind: "missing" };

  for (const level of BLOOM_LEVELS) {
    if (BLOOM_VERBS[level].includes(firstWord)) {
      return { verb: firstWord, bloomLevel: level, kind: "measurable" };
    }
  }

  if (VAGUE_VERBS.has(firstWord)) {
    return {
      verb: firstWord,
      bloomLevel: null,
      kind: "vague",
      suggestion: MEASURABLE_VERB_SUGGESTION,
    };
  }

  return {
    verb: firstWord,
    bloomLevel: null,
    kind: "missing",
    suggestion:
      "No recognized measurable verb at the start of the outcome. Lead with an observable action verb.",
  };
}

/** Map a verb-detection kind to the persisted measurability enum. */
export function measurabilityFromDetection(
  kind: VerbDetection["kind"],
): MeasurabilityStatus {
  if (kind === "measurable") return "measurable";
  if (kind === "vague") return "unmeasurable";
  return "vague";
}

// A measurable criterion: a number, percentage, or a degree phrase.
const CRITERION_PATTERN =
  /(\d+\s?%|\d+\s+(of|out)|at least|with \d|accuracy|within|minimum|score of|by .* points|in under)/i;

// ---------------------------------------------------------------------------
// Generalized engine input (decoupled from any caller's storage shape).
// ---------------------------------------------------------------------------

export interface EvaluationObjective {
  id: string;
  text: string;
  // Standard / competency alignment. An empty array means the outcome is not
  // mapped to any framework standard.
  standardAlignmentIds: string[];
  // Optional human-readable label for the primary alignment, used only in
  // finding messages (e.g. "Nursing (CCNE) Domain 2").
  standardAlignmentLabel?: string;
}

export interface EvaluationAssessment {
  id: string;
  title: string;
  objectiveIds: string[];
}

export interface CurriculumEvaluationInput {
  title: string;
  gradeBand?: string | null;
  termWeeks?: number | null;
  objectives: EvaluationObjective[];
  assessments: EvaluationAssessment[];
}

export interface ObjectiveAnalysis {
  objectiveId: string;
  text: string;
  detection: VerbDetection;
  measurability: MeasurabilityStatus;
  wordCount: number;
  hasCriterion: boolean;
  compound: boolean;
  aligned: boolean;
  standardAlignmentIds: string[];
  standardAlignmentLabel?: string;
  assessmentCount: number;
}

export interface QaFinding {
  id: string;
  severity: Severity;
  category: RuleCategory;
  targetType: "course" | "objective" | "assessment";
  targetId?: string;
  targetLabel: string;
  message: string;
  remediation?: string;
}

export interface CategoryScore {
  category: RuleCategory;
  passed: number;
  total: number;
  score: number;
}

export interface QaReport {
  findings: QaFinding[];
  score: number;
  categoryScores: CategoryScore[];
  counts: { pass: number; warn: number; fail: number };
  bloomDistribution: { level: BloomLevel; count: number }[];
  objectiveAnalyses: ObjectiveAnalysis[];
}

const SEVERITY_WEIGHT: Record<Severity, number> = { pass: 1, warn: 0.5, fail: 0 };

function truncate(text: string, max = 56): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}...` : t;
}

/** Analyze one objective in the context of the whole curriculum. */
export function analyzeObjective(
  objective: EvaluationObjective,
  assessments: EvaluationAssessment[],
): ObjectiveAnalysis {
  const detection = detectVerb(objective.text);
  const trimmed = objective.text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const assessmentCount = assessments.filter((a) =>
    a.objectiveIds.includes(objective.id),
  ).length;
  // A compound objective joins two outcomes with "and" / "as well as".
  const compound = /\b(and|as well as)\b/i.test(trimmed) && wordCount > 12;
  return {
    objectiveId: objective.id,
    text: trimmed,
    detection,
    measurability: measurabilityFromDetection(detection.kind),
    wordCount,
    hasCriterion: CRITERION_PATTERN.test(trimmed),
    compound,
    aligned: objective.standardAlignmentIds.length > 0,
    standardAlignmentIds: objective.standardAlignmentIds,
    standardAlignmentLabel: objective.standardAlignmentLabel,
    assessmentCount,
  };
}

/**
 * Run the full rules engine over a curriculum and return a structured QA report:
 * findings, per-category scores, an overall score, and a Bloom distribution.
 */
export function evaluateCurriculum(input: CurriculumEvaluationInput): QaReport {
  const findings: QaFinding[] = [];
  const analyses = input.objectives.map((o) =>
    analyzeObjective(o, input.assessments),
  );

  // Structure (course-level).
  findings.push(
    input.title.trim().length >= 3
      ? {
          id: "structure-title",
          severity: "pass",
          category: "structure",
          targetType: "course",
          targetLabel: "Course title",
          message: "Course has a descriptive title.",
        }
      : {
          id: "structure-title",
          severity: "fail",
          category: "structure",
          targetType: "course",
          targetLabel: "Course title",
          message: "Course is missing a title.",
          remediation: "Add a clear, descriptive course title in the Intake step.",
        },
  );

  findings.push(
    input.objectives.length >= 2
      ? {
          id: "structure-objectives",
          severity: "pass",
          category: "structure",
          targetType: "course",
          targetLabel: "Learning outcomes",
          message: `Course defines ${input.objectives.length} learning outcomes.`,
        }
      : {
          id: "structure-objectives",
          severity: input.objectives.length === 1 ? "warn" : "fail",
          category: "structure",
          targetType: "course",
          targetLabel: "Learning outcomes",
          message:
            input.objectives.length === 1
              ? "Only one learning outcome is defined."
              : "No learning outcomes are defined.",
          remediation: "Add learning outcomes in the Design step (aim for three to six).",
        },
  );

  findings.push(
    input.assessments.length >= 1
      ? {
          id: "structure-assessments",
          severity: "pass",
          category: "structure",
          targetType: "course",
          targetLabel: "Assessments",
          message: `Course defines ${input.assessments.length} assessments.`,
        }
      : {
          id: "structure-assessments",
          severity: "fail",
          category: "structure",
          targetType: "course",
          targetLabel: "Assessments",
          message: "No assessments are defined.",
          remediation: "Add at least one assessment and align it to your outcomes.",
        },
  );

  // Per-objective checks.
  for (const a of analyses) {
    const label = truncate(a.text || "Untitled outcome");

    // Measurability.
    if (a.detection.kind === "measurable") {
      findings.push({
        id: `measure-${a.objectiveId}`,
        severity: "pass",
        category: "measurability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: `Measurable verb "${a.detection.verb}" (Bloom: ${a.detection.bloomLevel}).`,
      });
    } else if (a.detection.kind === "vague") {
      findings.push({
        id: `measure-${a.objectiveId}`,
        severity: "fail",
        category: "measurability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: `Verb "${a.detection.verb}" is not observable or measurable.`,
        remediation: a.detection.suggestion ?? MEASURABLE_VERB_SUGGESTION,
      });
    } else {
      findings.push({
        id: `measure-${a.objectiveId}`,
        severity: "warn",
        category: "measurability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: "No recognized measurable action verb at the start of the outcome.",
        remediation:
          a.detection.suggestion ??
          "Begin the outcome with an observable verb such as explain or design.",
      });
    }

    // Standards alignment.
    findings.push(
      a.aligned
        ? {
            id: `standard-${a.objectiveId}`,
            severity: "pass",
            category: "standards",
            targetType: "objective",
            targetId: a.objectiveId,
            targetLabel: label,
            message: a.standardAlignmentLabel
              ? `Mapped to ${a.standardAlignmentLabel}.`
              : "Mapped to a framework standard.",
          }
        : {
            id: `standard-${a.objectiveId}`,
            severity: "fail",
            category: "standards",
            targetType: "objective",
            targetId: a.objectiveId,
            targetLabel: label,
            message: "Outcome is not mapped to any framework standard.",
            remediation: "Map the outcome to a standard, or tag it as enrichment.",
          },
    );

    // Assessment coverage.
    findings.push(
      a.assessmentCount > 0
        ? {
            id: `assess-${a.objectiveId}`,
            severity: "pass",
            category: "assessment",
            targetType: "objective",
            targetId: a.objectiveId,
            targetLabel: label,
            message: `Measured by ${a.assessmentCount} assessment${a.assessmentCount === 1 ? "" : "s"}.`,
          }
        : {
            id: `assess-${a.objectiveId}`,
            severity: "fail",
            category: "assessment",
            targetType: "objective",
            targetId: a.objectiveId,
            targetLabel: label,
            message: "No assessment measures this outcome.",
            remediation: "Add or link an assessment that evaluates this outcome.",
          },
    );

    // Clarity and accessibility (advisory).
    if (a.compound) {
      findings.push({
        id: `clarity-compound-${a.objectiveId}`,
        severity: "warn",
        category: "clarity",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: "Outcome may combine two outcomes in one statement.",
        remediation: "Split into separate single-focus outcomes so each can be assessed.",
      });
    } else if (a.wordCount > 28) {
      findings.push({
        id: `clarity-length-${a.objectiveId}`,
        severity: "warn",
        category: "clarity",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: `Outcome is long (${a.wordCount} words), which can reduce readability.`,
        remediation: "Tighten the wording for a clearer, more accessible outcome.",
      });
    } else if (a.text.length > 0) {
      findings.push({
        id: `clarity-${a.objectiveId}`,
        severity: "pass",
        category: "clarity",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: a.hasCriterion
          ? "Concise and includes a measurable criterion."
          : "Concise and readable.",
      });
    }
  }

  // Orphan assessments: defined but not aligned to any outcome.
  for (const assessment of input.assessments) {
    const linked = assessment.objectiveIds.filter((id) =>
      input.objectives.some((o) => o.id === id),
    );
    findings.push(
      linked.length > 0
        ? {
            id: `assess-link-${assessment.id}`,
            severity: "pass",
            category: "assessment",
            targetType: "assessment",
            targetId: assessment.id,
            targetLabel: truncate(assessment.title || "Untitled assessment"),
            message: `Aligned to ${linked.length} outcome${linked.length === 1 ? "" : "s"}.`,
          }
        : {
            id: `assess-link-${assessment.id}`,
            severity: "fail",
            category: "assessment",
            targetType: "assessment",
            targetId: assessment.id,
            targetLabel: truncate(assessment.title || "Untitled assessment"),
            message: "Assessment is not aligned to any outcome.",
            remediation: "Link this assessment to the outcomes it measures, or remove it.",
          },
    );
  }

  // Aggregate scores.
  const categories: RuleCategory[] = [
    "measurability",
    "standards",
    "assessment",
    "clarity",
    "structure",
  ];
  const categoryScores: CategoryScore[] = categories.map((category) => {
    const inCat = findings.filter((f) => f.category === category);
    const total = inCat.length;
    const weight = inCat.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0);
    return {
      category,
      passed: inCat.filter((f) => f.severity === "pass").length,
      total,
      score: total ? Math.round((weight / total) * 100) : 100,
    };
  });

  const totalWeight = findings.reduce(
    (sum, f) => sum + SEVERITY_WEIGHT[f.severity],
    0,
  );
  const score = findings.length
    ? Math.round((totalWeight / findings.length) * 100)
    : 0;

  const counts = {
    pass: findings.filter((f) => f.severity === "pass").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    fail: findings.filter((f) => f.severity === "fail").length,
  };

  const bloomDistribution = BLOOM_LEVELS.map((level) => ({
    level,
    count: analyses.filter((a) => a.detection.bloomLevel === level).length,
  })).filter((b) => b.count > 0);

  // Order findings fail -> warn -> pass for display.
  const order: Record<Severity, number> = { fail: 0, warn: 1, pass: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    findings,
    score,
    categoryScores,
    counts,
    bloomDistribution,
    objectiveAnalyses: analyses,
  };
}
