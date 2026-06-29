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
  | "structure"
  | "readability"
  | "inclusive"
  | "balance";

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  measurability: "Measurable outcomes",
  standards: "Standards alignment",
  assessment: "Assessment coverage",
  clarity: "Clarity and accessibility",
  structure: "Course structure",
  readability: "Readability and student experience",
  inclusive: "Inclusive and culturally responsive language",
  balance: "Assessment balance and rigor",
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
// Readability & student-experience detectors (deterministic, no dependencies).
// ---------------------------------------------------------------------------

// Heuristic passive-voice detector: a "to be" form followed by a past participle.
// Covers regular -ed/-en participles plus common irregulars. Advisory only, so a
// few false positives are acceptable.
const PASSIVE_PATTERN =
  /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ed|\w+en|done|made|given|taken|shown|written|built|held|seen|known|met|paid|kept|told|sent|left|put|set|read|led|drawn|chosen|found|brought|taught|caught|begun)\b/i;

// Vague / ambiguous directive phrases that weaken an instruction's clarity.
const AMBIGUOUS_PHRASES = [
  "etc.", "etc", "and/or", "as appropriate", "as needed", "as applicable",
  "where appropriate", "various", "a number of", "and so on", "things like",
  "some things", "deal with", "work with various", "stuff", "tbd",
];

// Count vowel groups as a syllable estimate; drop a single trailing silent "e".
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 0;
  if (w.endsWith("e") && !/[aeiouy]e$/.test(w) && n > 1) n -= 1;
  return Math.max(1, n);
}

// Flesch-Kincaid grade level for a block of text. Returns 0 for empty input.
export function fleschKincaidGrade(text: string): number {
  const clean = text.trim();
  if (!clean) return 0;
  const words = clean.split(/\s+/).filter(Boolean);
  const sentences = Math.max(1, (clean.match(/[.!?]+/g) ?? []).length);
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  if (words.length === 0) return 0;
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

/** Does the text appear to use passive voice? */
export function hasPassiveVoice(text: string): boolean {
  return PASSIVE_PATTERN.test(text);
}

/** Ambiguous directive phrases present in the text (lowercased, deduped). */
export function findAmbiguousPhrases(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits = AMBIGUOUS_PHRASES.filter((p) => lower.includes(` ${p} `) || lower.includes(`${p} `) || lower.includes(` ${p}`));
  return Array.from(new Set(hits));
}

// ---------------------------------------------------------------------------
// Inclusive / culturally-responsive language detectors.
// ---------------------------------------------------------------------------

// Non-inclusive term -> suggested alternative. Matched on word boundaries,
// case-insensitive. Kept intentionally conservative to avoid false positives.
const NON_INCLUSIVE_TERMS: { pattern: RegExp; term: string; suggestion: string }[] = [
  { pattern: /\bmanpower\b/i, term: "manpower", suggestion: "workforce, staff, or labor" },
  { pattern: /\bman-?hours\b/i, term: "man-hours", suggestion: "person-hours or work-hours" },
  { pattern: /\bchairman\b/i, term: "chairman", suggestion: "chair or chairperson" },
  { pattern: /\bfreshman\b/i, term: "freshman", suggestion: "first-year student" },
  { pattern: /\bmankind\b/i, term: "mankind", suggestion: "humankind or humanity" },
  { pattern: /\bman-?made\b/i, term: "man-made", suggestion: "synthetic, artificial, or human-made" },
  { pattern: /\b(policeman|fireman|mailman|salesman)\b/i, term: "gendered job title", suggestion: "a gender-neutral title (police officer, firefighter, mail carrier, salesperson)" },
  { pattern: /\bblacklist\b/i, term: "blacklist", suggestion: "blocklist or denylist" },
  { pattern: /\bwhitelist\b/i, term: "whitelist", suggestion: "allowlist" },
  { pattern: /\bgrandfather(ed|\s+clause)?\b/i, term: "grandfather clause", suggestion: "legacy or exempted" },
  { pattern: /\bsanity\s+check\b/i, term: "sanity check", suggestion: "quick check or confidence check" },
  { pattern: /\bable-?bodied\b/i, term: "able-bodied", suggestion: "non-disabled" },
  { pattern: /\bthe\s+(disabled|handicapped)\b/i, term: "the disabled", suggestion: "people with disabilities (person-first language)" },
  { pattern: /\b(he\/she|s\/he|he or she)\b/i, term: "he/she", suggestion: 'singular "they" for gender-neutral phrasing' },
  { pattern: /\bthird[-\s]world\b/i, term: "third-world", suggestion: "low-income or developing" },
  { pattern: /\b(crazy|insane|lame)\b/i, term: "ableist adjective", suggestion: "precise descriptive language (e.g. surprising, intense, ineffective)" },
];

/** Non-inclusive terms found in the text, with suggested alternatives (deduped). */
export function findNonInclusiveTerms(text: string): { term: string; suggestion: string }[] {
  const found: { term: string; suggestion: string }[] = [];
  const seen = new Set<string>();
  for (const entry of NON_INCLUSIVE_TERMS) {
    if (entry.pattern.test(text) && !seen.has(entry.term)) {
      seen.add(entry.term);
      found.push({ term: entry.term, suggestion: entry.suggestion });
    }
  }
  return found;
}

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
  // Optional formative/summative classification. When absent, the balance
  // dimension skips the formative-feedback check for this assessment.
  type?: "formative" | "summative" | string | null;
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
  // Readability / inclusive signals.
  passiveVoice: boolean;
  ambiguousTerms: string[];
  gradeLevel: number;
  nonInclusiveTerms: { term: string; suggestion: string }[];
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
    passiveVoice: hasPassiveVoice(trimmed),
    ambiguousTerms: findAmbiguousPhrases(trimmed),
    gradeLevel: fleschKincaidGrade(trimmed),
    nonInclusiveTerms: findNonInclusiveTerms(trimmed),
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

    // Readability & student experience (advisory; warn, never gate-blocking).
    if (a.passiveVoice) {
      findings.push({
        id: `read-passive-${a.objectiveId}`,
        severity: "warn",
        category: "readability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: "Outcome appears to use passive voice, which can obscure who does what.",
        remediation: "Rewrite in the active voice with the learner as the subject (e.g. \"the student analyzes…\").",
      });
    }
    if (a.ambiguousTerms.length > 0) {
      findings.push({
        id: `read-ambiguous-${a.objectiveId}`,
        severity: "warn",
        category: "readability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: `Ambiguous wording: ${a.ambiguousTerms.map((t) => `"${t}"`).join(", ")}.`,
        remediation: "Replace vague directives with specific, concrete expectations.",
      });
    }
    if (!a.passiveVoice && a.ambiguousTerms.length === 0 && a.text.length > 0) {
      findings.push({
        id: `read-${a.objectiveId}`,
        severity: "pass",
        category: "readability",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: "Clear, active, and unambiguous wording.",
      });
    }

    // Inclusive / culturally responsive language (advisory; warn).
    for (const hit of a.nonInclusiveTerms) {
      findings.push({
        id: `incl-${a.objectiveId}-${hit.term.replace(/\W+/g, "")}`,
        severity: "warn",
        category: "inclusive",
        targetType: "objective",
        targetId: a.objectiveId,
        targetLabel: label,
        message: `Consider more inclusive language for "${hit.term}".`,
        remediation: `Use ${hit.suggestion}.`,
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

  // Inclusive-language scan over assessment titles too.
  for (const assessment of input.assessments) {
    for (const hit of findNonInclusiveTerms(assessment.title ?? "")) {
      findings.push({
        id: `incl-a-${assessment.id}-${hit.term.replace(/\W+/g, "")}`,
        severity: "warn",
        category: "inclusive",
        targetType: "assessment",
        targetId: assessment.id,
        targetLabel: truncate(assessment.title || "Untitled assessment"),
        message: `Consider more inclusive language for "${hit.term}".`,
        remediation: `Use ${hit.suggestion}.`,
      });
    }
  }

  // Course-level inclusive pass when the scan finds nothing.
  if (!findings.some((f) => f.category === "inclusive")) {
    findings.push({
      id: "inclusive-clean",
      severity: "pass",
      category: "inclusive",
      targetType: "course",
      targetLabel: "Inclusive language",
      message: "No non-inclusive terms were flagged across outcomes and assessments.",
    });
  }

  // Course-level readability: Flesch-Kincaid grade across all outcome text.
  const combinedOutcomeText = input.objectives.map((o) => o.text).join(". ");
  const courseGrade = fleschKincaidGrade(combinedOutcomeText);
  if (combinedOutcomeText.trim().length > 0) {
    findings.push(
      courseGrade > 16
        ? {
            id: "read-course-grade",
            severity: "warn",
            category: "readability",
            targetType: "course",
            targetLabel: "Reading level",
            message: `Outcomes read above a college-graduate level (Flesch-Kincaid grade ${courseGrade}).`,
            remediation: "Shorten sentences and prefer plainer words so expectations are accessible to all learners.",
          }
        : {
            id: "read-course-grade",
            severity: "pass",
            category: "readability",
            targetType: "course",
            targetLabel: "Reading level",
            message: `Outcomes are at an accessible reading level (Flesch-Kincaid grade ${courseGrade}).`,
          },
    );
  }

  // -------------------------------------------------------------------------
  // Assessment balance & rigor (course-level; advisory).
  // -------------------------------------------------------------------------

  // Cognitive distribution: how outcomes spread across Bloom's lower-order
  // (Remember/Understand) vs higher-order (Apply/Analyze/Evaluate/Create).
  const LOWER_ORDER: BloomLevel[] = ["Remember", "Understand"];
  const leveled = analyses.filter((a) => a.detection.bloomLevel !== null);
  if (leveled.length >= 3) {
    const higherOrder = leveled.filter(
      (a) => a.detection.bloomLevel && !LOWER_ORDER.includes(a.detection.bloomLevel),
    ).length;
    const higherShare = higherOrder / leveled.length;
    const distinctLevels = new Set(leveled.map((a) => a.detection.bloomLevel)).size;
    if (higherShare === 0) {
      findings.push({
        id: "balance-cognitive",
        severity: "warn",
        category: "balance",
        targetType: "course",
        targetLabel: "Cognitive rigor",
        message: "All measurable outcomes sit at the recall/comprehension level.",
        remediation: "Add higher-order outcomes (apply, analyze, evaluate, or create) so learners build deeper skills.",
      });
    } else if (distinctLevels === 1) {
      findings.push({
        id: "balance-cognitive",
        severity: "warn",
        category: "balance",
        targetType: "course",
        targetLabel: "Cognitive rigor",
        message: "Every outcome targets the same cognitive level, so the course lacks a difficulty progression.",
        remediation: "Vary Bloom levels across outcomes to scaffold from foundational to advanced thinking.",
      });
    } else {
      findings.push({
        id: "balance-cognitive",
        severity: "pass",
        category: "balance",
        targetType: "course",
        targetLabel: "Cognitive rigor",
        message: `Outcomes span ${distinctLevels} cognitive levels, with ${Math.round(higherShare * 100)}% higher-order.`,
      });
    }
  }

  // Formative/summative mix: low-stakes formative checks should exist alongside
  // graded summative assessments. Only evaluated when types are provided.
  const typed = input.assessments.filter((a) => a.type === "formative" || a.type === "summative");
  if (typed.length >= 2) {
    const formative = typed.filter((a) => a.type === "formative").length;
    const summative = typed.filter((a) => a.type === "summative").length;
    if (formative === 0) {
      findings.push({
        id: "balance-formative",
        severity: "warn",
        category: "balance",
        targetType: "course",
        targetLabel: "Formative assessment",
        message: "All assessments are summative — there are no low-stakes formative checks.",
        remediation: "Add formative assessments (quizzes, drafts, check-ins) so learners get feedback before they are graded.",
      });
    } else if (summative === 0) {
      findings.push({
        id: "balance-summative",
        severity: "warn",
        category: "balance",
        targetType: "course",
        targetLabel: "Summative assessment",
        message: "All assessments are formative — there is no summative measure of mastery.",
        remediation: "Add at least one summative assessment that certifies the outcomes were met.",
      });
    } else {
      findings.push({
        id: "balance-mix",
        severity: "pass",
        category: "balance",
        targetType: "course",
        targetLabel: "Assessment mix",
        message: `Balanced mix of ${formative} formative and ${summative} summative assessments.`,
      });
    }
  }

  // Aggregate scores.
  const categories: RuleCategory[] = [
    "measurability",
    "standards",
    "assessment",
    "clarity",
    "structure",
    "readability",
    "inclusive",
    "balance",
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
