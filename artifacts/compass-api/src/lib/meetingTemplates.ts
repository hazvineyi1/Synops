/**
 * Meeting-type template registry (code-only; no template data in the database).
 *
 * Each meeting is one of three types. A type supplies a standing pre-work
 * checklist, a standing agenda (ordered items with timing and prompts), and an
 * exit-criteria ("Definition of Done") checklist. When a meeting is created its
 * `agendaPlan` is SEEDED from this registry (see seedMeetingPlan); the seeded copy
 * is then the meeting's own editable workspace, so later edits to these constants
 * do not retroactively change past meetings.
 *
 * All copy here obeys the project rules: no em dashes and no emojis. Keep it that
 * way when editing.
 */

export type MeetingType = "kickoff" | "working" | "final";

export const MEETING_TYPES: readonly MeetingType[] = ["kickoff", "working", "final"];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  kickoff: "Kickoff",
  working: "Working Session",
  final: "Final",
};

export function isMeetingType(value: unknown): value is MeetingType {
  return value === "kickoff" || value === "working" || value === "final";
}

export interface TemplateAgendaItem {
  title: string;
  minutes: number;
  prompts: string[];
}

export interface MeetingTemplate {
  type: MeetingType;
  label: string;
  /** What participants should do before the meeting. */
  prework: string[];
  /** The standing running order for the meeting. */
  agenda: TemplateAgendaItem[];
  /** The "Definition of Done": what must be true to close the meeting. */
  exitCriteria: string[];
}

// ── The three templates ────────────────────────────────────────

const KICKOFF: MeetingTemplate = {
  type: "kickoff",
  label: MEETING_TYPE_LABELS.kickoff,
  prework: [
    "Share the project charter, scope, and timeline with all stakeholders.",
    "Confirm the assigned builder and the points of contact on each side.",
    "Collect existing course materials and the relevant standards framework.",
    "Confirm the accessibility target (WCAG 2.1 AA) and any 508 obligations.",
  ],
  agenda: [
    {
      title: "Introductions and roles",
      minutes: 10,
      prompts: [
        "Confirm who owns each part of the build.",
        "Agree how decisions are made and recorded.",
      ],
    },
    {
      title: "Scope, goals, and timeline",
      minutes: 15,
      prompts: [
        "Confirm the course list and target completion dates.",
        "Identify the first milestone and its due date.",
      ],
    },
    {
      title: "Compliance and accessibility (set early)",
      minutes: 10,
      prompts: [
        "Confirm WCAG 2.1 AA as the standard for all content.",
        "Note any 508 or institutional requirements.",
        "Agree how accessibility is reviewed each session.",
      ],
    },
    {
      title: "Ways of working",
      minutes: 10,
      prompts: [
        "Agree the meeting cadence and the working-session focus rotation.",
        "Confirm the tools used and where deliverables live.",
      ],
    },
    {
      title: "Decisions, actions, and open questions",
      minutes: 10,
      prompts: [
        "Record the decisions made today.",
        "Assign action items with owners and due dates.",
        "Capture open questions to resolve before the next session.",
      ],
    },
  ],
  exitCriteria: [
    "Scope, goals, and timeline are confirmed.",
    "Roles and the decision-making process are agreed.",
    "The accessibility standard (WCAG 2.1 AA) is set and understood.",
    "The first milestone has a date and an owner.",
  ],
};

const WORKING: MeetingTemplate = {
  type: "working",
  label: MEETING_TYPE_LABELS.working,
  prework: [
    "Review the open action items and update their status.",
    "Prepare the work in this session's focus area for review.",
    "Bring any blockers or open questions to discuss.",
  ],
  agenda: [
    {
      title: "Review progress and open actions",
      minutes: 10,
      prompts: [
        "Confirm what was completed since the last session.",
        "Update or reassign anything still open.",
      ],
    },
    {
      title: "Focus work",
      minutes: 25,
      prompts: [
        "Work through this session's focus area.",
        "Make and record the decisions needed to move forward.",
      ],
    },
    {
      title: "Accessibility check (WCAG 2.1 AA)",
      minutes: 10,
      prompts: [
        "Review new content against WCAG 2.1 AA.",
        "Log any accessibility action items.",
      ],
    },
    {
      title: "Wrap up",
      minutes: 10,
      prompts: [
        "Confirm new action items with owners and due dates.",
        "Capture open questions for next time.",
        "Agree the focus for the next session.",
      ],
    },
  ],
  exitCriteria: [
    "This session's focus work moved forward.",
    "New action items have owners and due dates.",
    "Accessibility was reviewed for any new content.",
    "The focus for the next session is agreed.",
  ],
};

const FINAL: MeetingTemplate = {
  type: "final",
  label: MEETING_TYPE_LABELS.final,
  prework: [
    "Confirm all action items are closed or have a handoff plan.",
    "Complete the accessibility review for the full course.",
    "Prepare the final deliverables and documentation for handoff.",
  ],
  agenda: [
    {
      title: "Confirm completion against scope",
      minutes: 15,
      prompts: [
        "Walk through the original goals and confirm each is met.",
        "Note anything intentionally deferred.",
      ],
    },
    {
      title: "Accessibility and compliance sign-off",
      minutes: 10,
      prompts: [
        "Confirm WCAG 2.1 AA across the whole course.",
        "Confirm any 508 or institutional requirements are satisfied.",
      ],
    },
    {
      title: "Handoff",
      minutes: 15,
      prompts: [
        "Confirm where deliverables and documentation live.",
        "Confirm the owners for ongoing maintenance.",
        "Resolve or assign any remaining open questions.",
      ],
    },
    {
      title: "Close out",
      minutes: 10,
      prompts: [
        "Record the final decisions and sign-off.",
        "Confirm no action items remain open, or assign them.",
      ],
    },
  ],
  exitCriteria: [
    "All goals are met or deferrals are documented.",
    "Accessibility and compliance are signed off.",
    "Deliverables and documentation are handed off with owners.",
    "No action item remains open without an owner.",
  ],
};

export const MEETING_TEMPLATES: Record<MeetingType, MeetingTemplate> = {
  kickoff: KICKOFF,
  working: WORKING,
  final: FINAL,
};

export function getMeetingTemplate(type: MeetingType): MeetingTemplate {
  return MEETING_TEMPLATES[type];
}

/**
 * The default type for the NEXT meeting after one of the given type. Kickoff and
 * working sessions are followed by another working session by default; a final
 * meeting has no natural successor, so we still default to a working session (the
 * caller may override the next type explicitly when generating an agenda).
 */
export function suggestNextType(type: MeetingType): MeetingType {
  switch (type) {
    case "kickoff":
      return "working";
    case "working":
      return "working";
    case "final":
      return "working";
  }
}

// ── The seeded, per-meeting workspace shape (agendaPlan) ────────
// A meeting's `agendaPlan` column stores this JSON. It is the meeting's OWN
// editable copy of its template: pre-work and exit-criteria are simple
// checklists; the standing agenda mirrors the GeneratedAgenda item shape so the
// same checklist UI can render it.

export interface PlanChecklistItem {
  text: string;
  done: boolean;
}

export interface PlanAgendaItem {
  title: string;
  minutes: number;
  prompts: string[];
  done?: boolean;
  promptsDone?: boolean[];
}

export interface PlanExitCriterion {
  text: string;
  met: boolean;
}

export interface MeetingPlan {
  prework: PlanChecklistItem[];
  agenda: PlanAgendaItem[];
  exitCriteria: PlanExitCriterion[];
}

/** Build a fresh, unchecked workspace plan from a meeting type's template. */
export function seedMeetingPlan(type: MeetingType): MeetingPlan {
  const t = getMeetingTemplate(type);
  return {
    prework: t.prework.map((text) => ({ text, done: false })),
    agenda: t.agenda.map((i) => ({ title: i.title, minutes: i.minutes, prompts: [...i.prompts] })),
    exitCriteria: t.exitCriteria.map((text) => ({ text, met: false })),
  };
}
