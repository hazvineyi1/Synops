import { z } from "zod";
import {
  getMeetingTemplate,
  type MeetingType,
  type TemplateAgendaItem,
} from "./meetingTemplates";

/**
 * Agenda intelligence. Two responsibilities, both AI-optional:
 *
 *  1. extractStreamsFromNotes: turn a meeting's free-text notes into THREE
 *     live-capture streams - decisions, action items (owner + due date), and open
 *     questions. Tries the built-in AI integration first and always falls back to
 *     a deterministic, dependency-free rules extractor, so the product works fully
 *     with no AI configured. Empty notes short-circuit to empty streams.
 *
 *  2. buildNextAgenda: assemble the proposed agenda for the NEXT meeting
 *     DETERMINISTICALLY from the next meeting type's standing template plus
 *     carried-forward open action items, open questions, and unmet exit criteria.
 *     The agenda STRUCTURE never depends on AI, only the stream extraction does.
 *
 * All generated text is sanitized to honor the project's copy rules: no em dashes
 * and no emojis.
 */

const AGENDA_MODEL = "gpt-5.4";
const NOTES_AI_LIMIT = 16000;
const MAX_ITEMS = 40;

export type ActionCategory = "general" | "content" | "review" | "accessibility";

export interface ExtractedActionItem {
  title: string;
  description: string | null;
  ownerName: string | null;
  category: ActionCategory;
  weekIndex: number | null;
  dueAt: string | null;
}

export interface ExtractedDecision {
  text: string;
  decidedBy: string | null;
}

export interface ExtractedOpenQuestion {
  text: string;
}

export interface ExtractedStreams {
  provider: "openai" | "rules";
  decisions: ExtractedDecision[];
  actionItems: ExtractedActionItem[];
  openQuestions: ExtractedOpenQuestion[];
}

export interface StreamsInput {
  notes: string;
  projectTitle: string;
  courseTitle: string | null;
  termWeeks: number | null;
  meetingTitle: string;
}

// A single agenda item in the generated NEXT-meeting agenda.
export interface ExtractedAgendaItem {
  title: string;
  minutes: number;
  prompts: string[];
}

// What carries forward from the just-closed meeting into the next agenda.
export interface CarryForward {
  openActionItems: { title: string; ownerName: string | null }[];
  openQuestions: string[];
  unmetExitCriteria: string[];
  newDecisionCount: number;
  newActionItemCount: number;
  newOpenQuestionCount: number;
}

export interface NextAgenda {
  nextMeetingType: MeetingType;
  proposedDate: string | null;
  proposedTime: string | null;
  summary: string[];
  items: ExtractedAgendaItem[];
  openActionCount: number;
  openQuestionCount: number;
  unmetExitCriteriaCount: number;
}

// ── Text hygiene ───────────────────────────────────────────────
// Replace em/en dashes with a plain hyphen and strip emoji so generated copy
// obeys the no-em-dash / no-emoji rule. Collapse runs of spaces.
export function sanitizeText(value: string): string {
  return value
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

function clampWeek(week: number, termWeeks: number | null): number | null {
  if (!Number.isFinite(week) || week < 0) return null;
  const upper = termWeeks && termWeeks > 0 ? termWeeks - 1 : 51;
  return Math.min(week, upper);
}

function categorize(text: string): ActionCategory {
  if (/\b(accessib\w*|wcag|alt[\s-]?text|caption|contrast|screen[\s-]?reader|aria)\b/i.test(text)) {
    return "accessibility";
  }
  if (/\b(review|qa|quality|feedback|approve|approval|revise|revision|proof)\b/i.test(text)) {
    return "review";
  }
  if (/\b(draft|write|author|content|module|lesson|storyboard|script|slide|video|assessment|rubric|outline)\b/i.test(text)) {
    return "content";
  }
  return "general";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (ISO_DATE.test(v)) return v;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  return HHMM.test(v) ? v : null;
}

function normalizeAiDueAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// The default cadence: the next meeting is proposed one week after this one, at
// the same time of day (or 10:00 when this meeting had no recorded time).
function defaultNextSlot(meetingDate: Date | null): { proposedDate: string | null; proposedTime: string | null } {
  if (!meetingDate || Number.isNaN(meetingDate.getTime())) {
    return { proposedDate: null, proposedTime: null };
  }
  const next = new Date(meetingDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const proposedDate = next.toISOString().slice(0, 10);
  const hh = String(next.getUTCHours()).padStart(2, "0");
  const mm = String(next.getUTCMinutes()).padStart(2, "0");
  const proposedTime = `${hh}:${mm}`;
  return { proposedDate, proposedTime: proposedTime === "00:00" ? "10:00" : proposedTime };
}

// ── Rules-based stream extraction (always available) ───────────

function rulesExtractActionItems(input: StreamsInput): ExtractedActionItem[] {
  const lines = input.notes.split(/\r?\n/);
  const items: ExtractedActionItem[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 3) continue;

    const isAction =
      /^[-*•]/.test(line) ||
      /\[\s?\]/.test(line) ||
      /\b(todo|to-do|action item|action:|next step|follow[\s-]?up|need to|needs to|will |should |assign|prepare|draft|review|create|update|send|schedule|fix|add)\b/i.test(
        line,
      );
    if (!isAction) continue;

    const text = line
      .replace(/^[-*•]\s*/, "")
      .replace(/^\[\s?\]\s*/, "")
      .replace(/^(action item|action|todo|to-do|next step|follow[\s-]?up)\s*[:-]\s*/i, "")
      .trim();
    if (text.length < 3) continue;
    // A bare question is an open question, not an action item.
    if (text.endsWith("?")) continue;

    let ownerName: string | null = null;
    const ownerMatch =
      text.match(/\bowner\s*:\s*([A-Za-z][\w .'-]{1,40})/i) ||
      text.match(/@([A-Za-z][\w.'-]{1,40})/);
    if (ownerMatch) ownerName = ownerMatch[1].trim();

    let weekIndex: number | null = null;
    const weekMatch = text.match(/\bweek\s*(\d{1,2})\b/i);
    if (weekMatch) weekIndex = clampWeek(parseInt(weekMatch[1], 10) - 1, input.termWeeks);

    const title = sanitizeText(text).slice(0, 280);
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      title,
      description: null,
      ownerName: ownerName ? sanitizeText(ownerName).slice(0, 200) : null,
      category: categorize(title),
      weekIndex,
      dueAt: null,
    });
    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

function rulesExtractDecisions(notes: string): ExtractedDecision[] {
  const lines = notes.split(/\r?\n/);
  const out: ExtractedDecision[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 3) continue;

    let text: string | null = null;
    const labelled = line.match(/^(?:[-*•]\s*)?(?:decision|decided|agreed|resolved)\s*[:-]\s*(.+)$/i);
    if (labelled && labelled[1].trim().length >= 3) {
      text = labelled[1].trim();
    } else if (/\b(decided to|agreed to|we will|we'll|going with|chose to|will go with)\b/i.test(line)) {
      text = line.replace(/^[-*•]\s*/, "").trim();
    }
    if (!text || text.length < 3) continue;

    const clean = sanitizeText(text).slice(0, 500);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ text: clean, decidedBy: null });
    if (out.length >= MAX_ITEMS) break;
  }

  return out;
}

function rulesExtractOpenQuestions(notes: string): ExtractedOpenQuestion[] {
  const lines = notes.split(/\r?\n/);
  const out: ExtractedOpenQuestion[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length < 3) continue;

    let text: string | null = null;
    const labelled = line.match(/^(?:[-*•]\s*)?(?:open question|question|q)\s*[:-]\s*(.+)$/i);
    if (labelled && labelled[1].trim().length >= 3) {
      text = labelled[1].trim();
    } else if (line.endsWith("?") && line.length >= 8) {
      text = line.replace(/^[-*•]\s*/, "").trim();
    } else if (/\b(tbd|to be decided|to be confirmed|unresolved|need to confirm|unclear|to discuss)\b/i.test(line)) {
      text = line.replace(/^[-*•]\s*/, "").trim();
    }
    if (!text || text.length < 3) continue;

    const clean = sanitizeText(text).slice(0, 500);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ text: clean });
    if (out.length >= MAX_ITEMS) break;
  }

  return out;
}

function rulesExtractStreams(input: StreamsInput): ExtractedStreams {
  return {
    provider: "rules",
    decisions: rulesExtractDecisions(input.notes),
    actionItems: rulesExtractActionItems(input),
    openQuestions: rulesExtractOpenQuestions(input.notes),
  };
}

// ── AI extraction (optional, behind env fallback) ──────────────

const AiActionItem = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  category: z.enum(["general", "content", "review", "accessibility"]).optional(),
  weekIndex: z.number().nullable().optional(),
  dueAt: z.string().nullable().optional(),
});

const AiDecision = z.object({
  text: z.string().min(1),
  decidedBy: z.string().nullable().optional(),
});

const AiOpenQuestion = z.object({
  text: z.string().min(1),
});

const AiResult = z.object({
  decisions: z.array(AiDecision).optional(),
  actionItems: z.array(AiActionItem).optional(),
  openQuestions: z.array(AiOpenQuestion).optional(),
});

async function getOpenAI() {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    return null;
  }
  try {
    const mod = await import("@workspace/compass-openai");
    return mod.openai;
  } catch {
    return null;
  }
}

function normalizeAiStreams(data: z.infer<typeof AiResult>, input: StreamsInput): ExtractedStreams {
  const actionItems: ExtractedActionItem[] = [];
  const seenAction = new Set<string>();
  for (const raw of data.actionItems ?? []) {
    const title = sanitizeText(raw.title).slice(0, 280);
    if (title.length < 3) continue;
    const key = title.toLowerCase();
    if (seenAction.has(key)) continue;
    seenAction.add(key);
    actionItems.push({
      title,
      description: raw.description ? sanitizeText(raw.description).slice(0, 2000) : null,
      ownerName: raw.ownerName ? sanitizeText(raw.ownerName).slice(0, 200) : null,
      category: raw.category ?? categorize(title),
      weekIndex: raw.weekIndex == null ? null : clampWeek(Math.trunc(raw.weekIndex), input.termWeeks),
      dueAt: normalizeAiDueAt(raw.dueAt),
    });
    if (actionItems.length >= MAX_ITEMS) break;
  }

  const decisions: ExtractedDecision[] = [];
  const seenDecision = new Set<string>();
  for (const raw of data.decisions ?? []) {
    const text = sanitizeText(raw.text).slice(0, 500);
    if (text.length < 3) continue;
    const key = text.toLowerCase();
    if (seenDecision.has(key)) continue;
    seenDecision.add(key);
    decisions.push({ text, decidedBy: raw.decidedBy ? sanitizeText(raw.decidedBy).slice(0, 200) : null });
    if (decisions.length >= MAX_ITEMS) break;
  }

  const openQuestions: ExtractedOpenQuestion[] = [];
  const seenQuestion = new Set<string>();
  for (const raw of data.openQuestions ?? []) {
    const text = sanitizeText(raw.text).slice(0, 500);
    if (text.length < 3) continue;
    const key = text.toLowerCase();
    if (seenQuestion.has(key)) continue;
    seenQuestion.add(key);
    openQuestions.push({ text });
    if (openQuestions.length >= MAX_ITEMS) break;
  }

  return { provider: "openai", decisions, actionItems, openQuestions };
}

async function aiExtractStreams(input: StreamsInput): Promise<ExtractedStreams | null> {
  const client = await getOpenAI();
  if (!client) return null;

  const weeksUpper = input.termWeeks && input.termWeeks > 0 ? input.termWeeks : 52;
  const clamped = input.notes.slice(0, NOTES_AI_LIMIT);

  const system =
    "You convert consulting meeting notes for an instructional-design project into structured JSON. " +
    "Respond with a single JSON object and nothing else. Do not use em dashes. Do not use emojis. " +
    'Schema: {"decisions":[{"text":string,"decidedBy":string|null}],' +
    '"actionItems":[{"title":string,"description":string|null,"ownerName":string|null,' +
    '"category":"general"|"content"|"review"|"accessibility","weekIndex":integer|null,"dueAt":string|null}],' +
    '"openQuestions":[{"text":string}]}. ' +
    "Decisions are settled choices the group made. Action items are tasks with an owner to do later. " +
    "Open questions are things still unresolved or needing a decision. " +
    `weekIndex is zero-based and only set when the notes name a specific week (0 to ${weeksUpper - 1}). ` +
    "Use category accessibility for WCAG or accessibility tasks. Keep titles concise and action oriented.";

  const user =
    `Project: ${input.projectTitle}\n` +
    `Course: ${input.courseTitle ?? "none"}\n` +
    `Term weeks: ${input.termWeeks ?? "unknown"}\n` +
    `This meeting: ${input.meetingTitle}\n\n` +
    `Meeting notes:\n${clamped}`;

  try {
    const resp = await client.chat.completions.create({
      model: AGENDA_MODEL,
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const content = resp.choices[0]?.message?.content;
    if (!content) return null;
    const parsed = AiResult.safeParse(JSON.parse(content));
    if (!parsed.success) return null;
    return normalizeAiStreams(parsed.data, input);
  } catch {
    return null;
  }
}

/**
 * Public entry point for stream extraction. Tries the built-in AI first (when
 * configured) and always falls back to the deterministic rules extractor. Empty
 * notes short-circuit to empty streams.
 */
export async function extractStreamsFromNotes(input: StreamsInput): Promise<ExtractedStreams> {
  if (input.notes.trim().length === 0) {
    return { provider: "rules", decisions: [], actionItems: [], openQuestions: [] };
  }
  const ai = await aiExtractStreams(input);
  if (ai) return ai;
  return rulesExtractStreams(input);
}

// ── Deterministic next-agenda assembly (no AI) ─────────────────

function cloneTemplateItems(items: readonly TemplateAgendaItem[]): ExtractedAgendaItem[] {
  return items.map((i) => ({ title: i.title, minutes: i.minutes, prompts: [...i.prompts] }));
}

/**
 * Build the proposed agenda for the NEXT meeting from its type's standing
 * template, folding in everything that carries forward from the meeting just
 * closed: open action items and unmet exit criteria become prompts on the opening
 * review item, and open questions become a dedicated "Open questions to resolve"
 * item. The structure is fully deterministic, so it is identical with or without
 * AI configured.
 */
export function buildNextAgenda(args: {
  nextMeetingType: MeetingType;
  meetingDate: Date | null;
  projectTitle: string;
  carry: CarryForward;
}): NextAgenda {
  const { nextMeetingType, meetingDate, projectTitle, carry } = args;
  const template = getMeetingTemplate(nextMeetingType);
  const slot = defaultNextSlot(meetingDate);
  const items = cloneTemplateItems(template.agenda);

  // Fold open actions and unmet exit criteria into the opening review item.
  if (items.length > 0) {
    const extra: string[] = [];
    for (const a of carry.openActionItems.slice(0, 8)) {
      const owner = a.ownerName ? ` (owner: ${sanitizeText(a.ownerName)})` : "";
      extra.push(`Status check: ${sanitizeText(a.title)}${owner}`);
    }
    for (const c of carry.unmetExitCriteria.slice(0, 8)) {
      extra.push(`Carry forward: ${sanitizeText(c)}`);
    }
    items[0].prompts.push(...extra);
  }

  // Open questions become a dedicated agenda item so they are not lost.
  if (carry.openQuestions.length > 0) {
    items.push({
      title: "Open questions to resolve",
      minutes: 10,
      prompts: carry.openQuestions.slice(0, 12).map((q) => `Resolve: ${sanitizeText(q)}`),
    });
  }

  const summary: string[] = [`Proposed ${template.label} agenda for ${sanitizeText(projectTitle)}.`];
  if (carry.newDecisionCount > 0) {
    summary.push(`${pluralize(carry.newDecisionCount, "decision")} recorded in the last meeting.`);
  }
  if (carry.newActionItemCount > 0) {
    summary.push(`${pluralize(carry.newActionItemCount, "new action item")} captured.`);
  }
  if (carry.openActionItems.length > 0) {
    summary.push(`${pluralize(carry.openActionItems.length, "open action item")} carried forward.`);
  }
  if (carry.openQuestions.length > 0) {
    summary.push(`${pluralize(carry.openQuestions.length, "open question")} carried forward.`);
  }
  if (carry.unmetExitCriteria.length > 0) {
    summary.push(
      `${pluralize(carry.unmetExitCriteria.length, "exit criterion", "exit criteria")} from the last meeting still unmet.`,
    );
  }

  return {
    nextMeetingType,
    proposedDate: slot.proposedDate,
    proposedTime: slot.proposedTime,
    summary,
    items,
    openActionCount: carry.openActionItems.length,
    openQuestionCount: carry.openQuestions.length,
    unmetExitCriteriaCount: carry.unmetExitCriteria.length,
  };
}
