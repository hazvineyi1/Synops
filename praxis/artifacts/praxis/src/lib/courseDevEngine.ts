/**
 * Course Development engine (rule-based, deterministic). Turns a course title + description into
 * Bloom-aligned learning objectives and scaffolded assessment suggestions, and drafts interactive
 * video segments for the review gate. This is an instructional-design assist layer - a human always
 * reviews and edits the output (the interactive-video pipeline enforces this with a review gate).
 * No network calls; swap for a real model later behind the same function signatures.
 */

export type BloomLevel = 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create';

export const BLOOM_LEVELS: BloomLevel[] = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

export const BLOOM_VERBS: Record<BloomLevel, string[]> = {
  Remember: ['define', 'list', 'identify', 'recall', 'name', 'label', 'recognise'],
  Understand: ['explain', 'summarise', 'describe', 'interpret', 'classify', 'compare'],
  Apply: ['apply', 'demonstrate', 'use', 'implement', 'solve', 'carry out'],
  Analyze: ['analyse', 'differentiate', 'examine', 'contrast', 'categorise', 'break down'],
  Evaluate: ['evaluate', 'justify', 'critique', 'assess', 'recommend', 'defend'],
  Create: ['design', 'develop', 'compose', 'construct', 'formulate', 'produce'],
};

const BLOOM_COLOR: Record<BloomLevel, string> = {
  Remember: 'bg-slate-100 text-slate-700',
  Understand: 'bg-blue-100 text-blue-700',
  Apply: 'bg-emerald-100 text-emerald-700',
  Analyze: 'bg-amber-100 text-amber-700',
  Evaluate: 'bg-orange-100 text-orange-700',
  Create: 'bg-violet-100 text-violet-700',
};
export const bloomColor = (l: BloomLevel) => BLOOM_COLOR[l];

// Vague, non-measurable verbs an ID should avoid in an objective.
const VAGUE = ['understand', 'know', 'learn', 'appreciate', 'be aware', 'be familiar', 'grasp'];

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'in', 'on', 'with', 'this', 'that', 'course', 'learners', 'students', 'will', 'be', 'able', 'is', 'are', 'as', 'at', 'by', 'their', 'they', 'you', 'your', 'how', 'about', 'into', 'from', 'it', 'its']);

/** Pull a few topic keywords from the description (falls back to the title). */
export function topicKeywords(title: string, description: string): string[] {
  const words = `${description}`.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
  const freq: Record<string, number> = {};
  words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
  const ranked = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const picks = ranked.slice(0, 4);
  return picks.length ? picks : title.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 3);
}

export type Objective = { id: string; level: BloomLevel; verb: string; text: string; measurable: boolean; note: string };

/** Generate one objective per selected level, seeded from the title + description keywords. */
export function generateObjectives(title: string, description: string, levels: BloomLevel[]): Objective[] {
  const kws = topicKeywords(title, description);
  const topic = title.trim() || (kws[0] ?? 'the subject');
  const objTail: Record<BloomLevel, (kw: string) => string> = {
    Remember: (kw) => `the key terms and concepts of ${kw}`,
    Understand: (kw) => `how ${kw} works and why it matters in the workplace`,
    Apply: (kw) => `${kw} to complete a realistic workplace task`,
    Analyze: (kw) => `a scenario to distinguish effective from ineffective use of ${kw}`,
    Evaluate: (kw) => `an approach to ${kw} against defined criteria and recommend improvements`,
    Create: (kw) => `an original ${kw} plan or artefact for a given context`,
  };
  return levels.map((level, i) => {
    const verb = BLOOM_VERBS[level][i % BLOOM_VERBS[level].length];
    const kw = kws[i % Math.max(kws.length, 1)] ?? topic;
    const object = objTail[level](kw);
    const text = `Given a workplace context, learners will be able to ${verb} ${object}.`;
    const measurable = !VAGUE.some((v) => text.toLowerCase().includes(v));
    const note = measurable ? 'Observable, measurable verb.' : 'Contains a vague verb - make it observable.';
    return { id: `obj_${level}_${i}`, level, verb, text, measurable, note };
  });
}

export type AssessmentIdea = { level: BloomLevel; types: string[]; formative: boolean };

const ASSESS: Record<BloomLevel, string[]> = {
  Remember: ['Auto-graded quiz (MCQ / true-false)', 'Flashcard recall check'],
  Understand: ['Short-answer explanation', 'Concept map / labelled diagram'],
  Apply: ['Scenario task', 'Simulation / role-play', 'Worked practical'],
  Analyze: ['Case-study analysis', 'Compare-and-contrast brief'],
  Evaluate: ['Rubric-based critique', 'Peer review with criteria'],
  Create: ['Project or portfolio', 'Capstone artefact'],
};

export function suggestAssessments(levels: BloomLevel[]): { ideas: AssessmentIdea[]; warnings: string[] } {
  const ideas = levels.map((level) => ({
    level, types: ASSESS[level],
    formative: level === 'Remember' || level === 'Understand',
  }));
  const warnings: string[] = [];
  const higher = levels.filter((l) => ['Apply', 'Analyze', 'Evaluate', 'Create'].includes(l));
  if (levels.length > 0 && higher.length === 0) warnings.push('All assessments cluster at recall / comprehension. Add at least one application or higher-order task.');
  if (!ideas.some((i) => i.formative)) warnings.push('No formative assessment. Add a low-stakes check for learning before the graded tasks.');
  if (levels.includes('Create') && !levels.includes('Apply')) warnings.push('You jump to Create without an Apply step - consider scaffolding with an application task first.');
  return { ideas, warnings };
}

// ── Interactive video: AI auto-audit draft (mirrors the authoring mockup) ─────
export type VideoSegment = {
  id: string; label: string; start: string; end: string;
  qType: 'Multiple choice' | 'Free response' | 'Reflective pause';
  prompt: string; status: 'draft' | 'approved' | 'rejected';
};

const SEG_LABELS = ['Introduction', 'Core concept', 'Worked example', 'Common pitfalls', 'Application', 'Wrap-up'];
const QTYPES: VideoSegment['qType'][] = ['Multiple choice', 'Free response', 'Reflective pause'];

/** Draft interactive segments for a video (deterministic from title + a rough duration in seconds). */
export function draftVideoSegments(title: string, durationSec = 262): VideoSegment[] {
  const topic = (title || 'the topic').replace(/\(.*?\)/g, '').trim();
  const n = 4;
  const per = Math.floor(durationSec / n);
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;
  const prompts = [
    `Which statement best introduces ${topic}?`,
    `In your own words, explain the main idea of ${topic} so far.`,
    `Describe a moment you would apply this from ${topic} in your own work, and why.`,
    `Which platform or approach fits your own context best?`,
  ];
  return Array.from({ length: n }).map((_, i) => ({
    id: `seg_${i}`,
    label: SEG_LABELS[i % SEG_LABELS.length],
    start: fmt(i * per),
    end: fmt(Math.min(durationSec, (i + 1) * per)),
    qType: i === n - 1 ? 'Reflective pause' : QTYPES[i % 2] as VideoSegment['qType'],
    prompt: prompts[i % prompts.length],
    status: 'draft',
  }));
}
