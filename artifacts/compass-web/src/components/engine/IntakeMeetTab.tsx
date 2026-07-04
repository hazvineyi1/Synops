import { useEffect, useRef, useState } from "react";
import {
  useListMeetingRecordings,
  getListMeetingRecordingsQueryKey,
  useCreateMeetingRecording,
  useDeleteMeetingRecording,
  useRequestUploadUrl,
  useTranscribeMeetingRecording,
  useUpdateIntakeProgress,
  useGenerateIntakeAgenda,
  getGetIntakeProgressQueryKey,
  type IntakeProgress,
  type GeneratedAgenda,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Square,
  UploadCloud,
  Loader2,
  CheckCircle2,
  Trash2,
  Clock,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronRight,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Timer,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

// ---------------------------------------------------------------------------
// Rules-based kickoff interview (deterministic, no AI)
// ---------------------------------------------------------------------------

interface InterviewOption {
  value: string;
  label: string;
  next: string;
}

interface InterviewNode {
  id: string;
  prompt: string;
  options: InterviewOption[];
}

const INTERVIEW_NODES: Record<string, InterviewNode> = {
  start: {
    id: "start",
    prompt: "How will this course be delivered?",
    options: [
      { value: "in_person", label: "In person", next: "learner_profile" },
      { value: "async_online", label: "Online (asynchronous)", next: "learner_profile" },
      { value: "sync_online", label: "Online (synchronous)", next: "learner_profile" },
      { value: "hybrid", label: "Hybrid or HyFlex", next: "learner_profile" },
    ],
  },
  learner_profile: {
    id: "learner_profile",
    prompt: "What is the learners' existing experience level with this subject?",
    options: [
      { value: "novice", label: "Little to none", next: "scope_priority" },
      { value: "some_background", label: "Some background", next: "scope_priority" },
      { value: "experienced", label: "Experienced practitioners", next: "scope_priority" },
    ],
  },
  scope_priority: {
    id: "scope_priority",
    prompt: "What is the primary constraint shaping this project?",
    options: [
      { value: "speed", label: "Speed to launch", next: "design_approach" },
      { value: "depth", label: "Depth and rigor of learning", next: "design_approach" },
      { value: "compliance", label: "Accessibility and compliance requirements", next: "design_approach" },
      { value: "engagement", label: "Learner engagement and experience", next: "design_approach" },
    ],
  },
  design_approach: {
    id: "design_approach",
    prompt: "Which design approach will guide this project?",
    options: [
      { value: "addie", label: "ADDIE (linear phases)", next: "done" },
      { value: "sam", label: "SAM (iterative sprints)", next: "done" },
      { value: "backward_design", label: "Backward Design (UbD)", next: "done" },
      { value: "agile_id", label: "Agile ID (continuous delivery)", next: "done" },
    ],
  },
};

const INTERVIEW_SUMMARY_MAP: Record<string, Record<string, string>> = {
  start: {
    in_person: "Delivery: In person",
    async_online: "Delivery: Online (asynchronous)",
    sync_online: "Delivery: Online (synchronous)",
    hybrid: "Delivery: Hybrid or HyFlex",
  },
  learner_profile: {
    novice: "Learner profile: Little to no prior knowledge",
    some_background: "Learner profile: Some existing background",
    experienced: "Learner profile: Experienced practitioners",
  },
  scope_priority: {
    speed: "Primary constraint: Speed to launch",
    depth: "Primary constraint: Depth and rigor",
    compliance: "Primary constraint: Accessibility and compliance",
    engagement: "Primary constraint: Learner engagement",
  },
  design_approach: {
    addie: "Design approach: ADDIE",
    sam: "Design approach: SAM (iterative)",
    backward_design: "Design approach: Backward Design (UbD)",
    agile_id: "Design approach: Agile ID",
  },
};

type KickoffAnswers = {
  version?: number;
  designMethod?: string | null;
  currentNodeId?: string | null;
  completed?: boolean;
  answers?: Array<{ nodeId: string; prompt: string; value: string; label: string }>;
  summary?: string[];
};

function buildSummary(answers: KickoffAnswers["answers"]): string[] {
  if (!answers) return [];
  return answers.map((a) => INTERVIEW_SUMMARY_MAP[a.nodeId]?.[a.value] ?? `${a.prompt}: ${a.label}`);
}

// ---------------------------------------------------------------------------
// Segment definitions (source of truth; positional alignment with agendaChecks/segStatuses)
// ---------------------------------------------------------------------------

interface SegmentDef {
  index: number;
  title: string;
  minutes: number;
  lens: string;
  checks: string[];
  probes: string[];
}

interface PhaseDef {
  id: string;
  label: string;
  segments: SegmentDef[];
}

export const KICKOFF_PHASES: PhaseDef[] = [
  {
    id: "open",
    label: "Open",
    segments: [
      {
        index: 0,
        title: "Welcome and roles",
        minutes: 5,
        lens: "Andragogy",
        checks: [
          "Confirm attendees and decision-maker",
          "State purpose and outcomes",
          "Agree the timebox",
        ],
        probes: [
          "Who is the key decision-maker for this engagement?",
          "What does a successful kickoff look like for you today?",
        ],
      },
      {
        index: 1,
        title: "Goal and success criteria",
        minutes: 10,
        lens: "Backward Design",
        checks: [
          "Confirm the headline goal",
          "Define what success looks like",
          "Agree how it is measured",
        ],
        probes: [
          "What is the single most important outcome this course should achieve?",
          "How will you know the learners have succeeded?",
        ],
      },
    ],
  },
  {
    id: "discover",
    label: "Discover",
    segments: [
      {
        index: 2,
        title: "Learner and audience profile",
        minutes: 10,
        lens: "UDL",
        checks: [
          "Identify who the learners are",
          "Note prior knowledge and barriers",
          "Confirm access needs including WCAG 2.1 AA",
        ],
        probes: [
          "Who are the target learners and what brings them to this course?",
          "What barriers or access needs should we design for from the start?",
        ],
      },
      {
        index: 3,
        title: "Performance context and need",
        minutes: 10,
        lens: "Action mapping",
        checks: [
          "Describe the real-world task learners must perform",
          "Identify the current performance gap",
          "Confirm training is the right fix",
        ],
        probes: [
          "What should learners be able to do on the job after this course?",
          "What is getting in the way of that performance today?",
        ],
      },
      {
        index: 4,
        title: "Existing materials and assets",
        minutes: 10,
        lens: "Reuse / rights",
        checks: [
          "Inventory existing sources and media",
          "Confirm rights and licensing",
          "Decide: reuse, refresh, or rebuild for each item",
        ],
        probes: [
          "What materials already exist that we should consider?",
          "Are there any rights or licensing concerns we need to flag now?",
        ],
      },
      {
        index: 5,
        title: "Scope, modules and sequencing",
        minutes: 10,
        lens: "Constructive alignment",
        checks: [
          "Confirm module count and sequence logic",
          "Agree explicit out-of-scope items",
        ],
        probes: [
          "How many modules or units are we targeting?",
          "What is explicitly out of scope for this build?",
        ],
      },
    ],
  },
  {
    id: "assess",
    label: "Assess",
    segments: [
      {
        index: 6,
        title: "Learning objectives",
        minutes: 15,
        lens: "Bloom's taxonomy",
        checks: [
          "Draft or confirm course-level outcomes",
          "Verify verb level is appropriate for the audience",
          "Confirm each objective is measurable",
        ],
        probes: [
          "What verbs best describe the level of thinking or skill required?",
          "How will these objectives connect to the assessment strategy?",
        ],
      },
      {
        index: 7,
        title: "Evidence and assessment plan",
        minutes: 10,
        lens: "Backward Design",
        checks: [
          "Clarify how mastery is demonstrated",
          "Distinguish formative from summative assessment",
          "Confirm alignment to objectives",
        ],
        probes: [
          "How will learners show they have met each objective?",
          "What is the balance between practice checks and graded assessments?",
        ],
      },
      {
        index: 8,
        title: "Constraints, risks and compliance",
        minutes: 10,
        lens: "Risk / compliance",
        checks: [
          "Note timeline and budget constraints",
          "Confirm LMS and delivery modality",
          "Flag accessibility and compliance requirements",
        ],
        probes: [
          "What are the hard deadlines and budget guardrails?",
          "Are there compliance or regulatory requirements we must build to?",
        ],
      },
    ],
  },
  {
    id: "close",
    label: "Close",
    segments: [
      {
        index: 9,
        title: "Design approach and methodology",
        minutes: 10,
        lens: "ADDIE / SAM",
        checks: [
          "Confirm the design method (ADDIE, SAM, or other)",
          "Agree the review cadence",
          "Decide prototype vs full build",
        ],
        probes: [
          "Are we iterating in sprints or following a linear ADDIE process?",
          "What does a review cycle look like for this client?",
        ],
      },
      {
        index: 10,
        title: "Roles, owners and next steps",
        minutes: 10,
        lens: "RACI",
        checks: [
          "Assign owners to each action item",
          "Confirm the next checkpoint date",
          "Update the decision log",
        ],
        probes: [
          "Who is responsible for each deliverable?",
          "When and how will we check in before the next milestone?",
        ],
      },
      {
        index: 11,
        title: "Recap and confirm",
        minutes: 5,
        lens: "Synthesis",
        checks: [
          "Read back key decisions from the session",
          "Confirm open questions and who resolves them",
          "Agree the communication plan",
        ],
        probes: [
          "Are there decisions made today that need to be documented or communicated?",
          "What are the open questions we need to resolve before we meet again?",
        ],
      },
    ],
  },
];

export const ALL_SEGMENTS: SegmentDef[] = KICKOFF_PHASES.flatMap((p) => p.segments);
const TOTAL_SEGMENTS = ALL_SEGMENTS.length;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusCode(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: number }).status
    : undefined;
}

function emptyChecks(): boolean[][] {
  return ALL_SEGMENTS.map((s) => Array(s.checks.length).fill(false));
}

function emptyStatuses(): string[] {
  return Array(TOTAL_SEGMENTS).fill("idle");
}

function parseChecks(raw: boolean[][] | undefined): boolean[][] {
  if (!raw || raw.length !== TOTAL_SEGMENTS) return emptyChecks();
  return ALL_SEGMENTS.map((seg, i) => {
    const row = raw[i];
    if (!Array.isArray(row)) return Array(seg.checks.length).fill(false);
    return seg.checks.map((_, j) => Boolean(row[j]));
  });
}

function parseStatuses(raw: string[] | undefined): string[] {
  if (!raw || raw.length !== TOTAL_SEGMENTS) return emptyStatuses();
  return raw.map((s) => (typeof s === "string" ? s : "idle"));
}

function checksProgress(checks: boolean[][], idx: number): { done: number; total: number } {
  const row = checks[idx] ?? [];
  return { done: row.filter(Boolean).length, total: ALL_SEGMENTS[idx]?.checks.length ?? 0 };
}

function allChecksDone(checks: boolean[][], idx: number): boolean {
  const { done, total } = checksProgress(checks, idx);
  return total > 0 && done === total;
}

function firstActiveSegment(checks: boolean[][], statuses: string[]): number {
  for (let i = 0; i < TOTAL_SEGMENTS; i++) {
    if (statuses[i] !== "done" && !allChecksDone(checks, i)) return i;
  }
  return 0;
}

function parseKickoffAnswers(raw: unknown): KickoffAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { version: 1, designMethod: null, currentNodeId: "start", completed: false, answers: [], summary: [] };
  }
  const obj = raw as Record<string, unknown>;
  return {
    version: typeof obj.version === "number" ? obj.version : 1,
    designMethod: typeof obj.designMethod === "string" ? obj.designMethod : null,
    currentNodeId: typeof obj.currentNodeId === "string" ? obj.currentNodeId : "start",
    completed: obj.completed === true,
    answers: Array.isArray(obj.answers) ? (obj.answers as KickoffAnswers["answers"]) : [],
    summary: Array.isArray(obj.summary) ? (obj.summary as string[]) : [],
  };
}

const INITIAL_INTERVIEW: KickoffAnswers = {
  version: 1,
  designMethod: null,
  currentNodeId: "start",
  completed: false,
  answers: [],
  summary: [],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  projectId: number;
  intakeProgress: IntakeProgress | undefined;
}

// ---------------------------------------------------------------------------
// Lens badge color mapping
// ---------------------------------------------------------------------------

const LENS_COLORS: Record<string, string> = {
  "Andragogy": "bg-indigo-100 text-indigo-800",
  "Backward Design": "bg-sky-100 text-sky-800",
  "UDL": "bg-teal-100 text-teal-800",
  "Action mapping": "bg-orange-100 text-orange-800",
  "Reuse / rights": "bg-amber-100 text-amber-800",
  "Constructive alignment": "bg-lime-100 text-lime-800",
  "Bloom's taxonomy": "bg-violet-100 text-violet-800",
  "Risk / compliance": "bg-red-100 text-red-800",
  "ADDIE / SAM": "bg-blue-100 text-blue-800",
  "RACI": "bg-emerald-100 text-emerald-800",
  "Synthesis": "bg-purple-100 text-purple-800",
};

function LensBadge({ lens }: { lens: string }) {
  const cls = LENS_COLORS[lens] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-xs font-medium", cls)}>
      {lens}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SegmentRow
// ---------------------------------------------------------------------------

interface SegmentRowProps {
  seg: SegmentDef;
  checks: boolean[];
  status: string;
  isActive: boolean;
  expanded: boolean;
  onExpand: () => void;
  onCheckChange: (checkIdx: number, val: boolean) => void;
  onMarkDone: () => void;
  timerElapsed: number;
  timerRunning: boolean;
  onTimerToggle: () => void;
}

function SegmentRow({
  seg,
  checks,
  status,
  isActive,
  expanded,
  onExpand,
  onCheckChange,
  onMarkDone,
  timerElapsed,
  timerRunning,
  onTimerToggle,
}: SegmentRowProps) {
  const done = status === "done";
  const checkedCount = checks.filter(Boolean).length;
  const totalChecks = seg.checks.length;

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        done
          ? "border-green-200 bg-green-50/30"
          : isActive
          ? "border-primary/30 bg-primary/5"
          : "border-border bg-card",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={expanded}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
          expanded && "rounded-b-none",
        )}
      >
        <div className="shrink-0">
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          ) : (
            <div
              className={cn(
                "h-4 w-4 rounded-full border-2",
                isActive ? "border-primary" : "border-muted-foreground/40",
              )}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                done ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              {seg.title}
            </span>
            {isActive && !done && (
              <span className="text-xs font-medium text-primary">Active</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {seg.minutes}m
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
              checkedCount === totalChecks
                ? "bg-green-100 text-green-800"
                : "bg-muted text-muted-foreground",
            )}
          >
            {checkedCount}/{totalChecks}
          </span>
          {timerElapsed > 0 && (
            <span className="inline-flex items-center gap-1 font-mono">
              <Timer className="h-3 w-3" aria-hidden="true" />
              {formatDuration(timerElapsed)}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              expanded ? "rotate-180" : "",
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="flex items-center gap-2">
            <LensBadge lens={seg.lens} />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Checklist
            </div>
            <ul className="space-y-2">
              {seg.checks.map((check, ci) => {
                const checkId = `seg-${seg.index}-check-${ci}`;
                return (
                  <li key={ci} className="flex items-start gap-2">
                    <Checkbox
                      id={checkId}
                      checked={checks[ci] ?? false}
                      onCheckedChange={(v) => onCheckChange(ci, Boolean(v))}
                      aria-label={check}
                      className="mt-0.5 shrink-0"
                    />
                    <Label
                      htmlFor={checkId}
                      className={cn(
                        "cursor-pointer text-sm leading-snug",
                        checks[ci] ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {check}
                    </Label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Guided questions
            </div>
            <ul className="space-y-2">
              {seg.probes.map((probe, pi) => (
                <li
                  key={pi}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground"
                >
                  {probe}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={onTimerToggle}
              aria-label={timerRunning ? "Pause segment timer" : "Start segment timer"}
              className={cn(
                timerRunning && "border-red-300 text-red-700 hover:bg-red-50",
              )}
            >
              {timerRunning ? (
                <>
                  <Pause className="mr-1 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  {formatDuration(timerElapsed)} Pause
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {timerElapsed > 0 ? `Resume (${formatDuration(timerElapsed)})` : "Start timer"}
                </>
              )}
            </Button>

            {!done && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onMarkDone}
                className="text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Mark complete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function IntakeMeetTab({ projectId, intakeProgress }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updateIntake = useUpdateIntakeProgress();
  const generateAgenda = useGenerateIntakeAgenda();
  const requestUploadUrl = useRequestUploadUrl();
  const createRecording = useCreateMeetingRecording();
  const deleteRecording = useDeleteMeetingRecording();
  const transcribeRecording = useTranscribeMeetingRecording();

  const { data: allRecordings } = useListMeetingRecordings(projectId, {
    query: { enabled: !!projectId, queryKey: getListMeetingRecordingsQueryKey(projectId) },
  });

  // Kickoff recordings: project-scoped, no meeting id
  const kickoffRecordings = (allRecordings ?? []).filter((r) => r.meetingId == null);

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pastAgendasOpen, setPastAgendasOpen] = useState(false);
  const [viewingPastAgenda, setViewingPastAgenda] = useState(false);
  const [expandedSegIdx, setExpandedSegIdx] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Segment progress state (hydrated from intakeProgress)
  // ---------------------------------------------------------------------------

  const [checks, setChecks] = useState<boolean[][]>(() => emptyChecks());
  const [statuses, setStatuses] = useState<string[]>(() => emptyStatuses());
  const [kickoffAnswers, setKickoffAnswers] = useState<KickoffAnswers>(() => ({ ...INITIAL_INTERVIEW }));
  const [intakeNotes, setIntakeNotes] = useState<Record<string, string>>({});
  const hydratedRef = useRef(false);
  const lastChecksSavedRef = useRef("");
  const lastStatusesSavedRef = useRef("");
  const lastKickoffSavedRef = useRef("");
  const lastNotesSavedRef = useRef("");

  useEffect(() => {
    if (!intakeProgress || hydratedRef.current) return;
    hydratedRef.current = true;
    const parsedChecks = parseChecks(intakeProgress.agendaChecks);
    const parsedStatuses = parseStatuses(intakeProgress.segStatuses);
    setChecks(parsedChecks);
    setStatuses(parsedStatuses);
    lastChecksSavedRef.current = JSON.stringify(parsedChecks);
    lastStatusesSavedRef.current = JSON.stringify(parsedStatuses);

    const parsedKickoff = parseKickoffAnswers(intakeProgress.kickoffAnswers);
    setKickoffAnswers(parsedKickoff);
    lastKickoffSavedRef.current = JSON.stringify(parsedKickoff);

    const parsedNotes = (intakeProgress.notes && typeof intakeProgress.notes === "object" && !Array.isArray(intakeProgress.notes))
      ? (intakeProgress.notes as Record<string, string>)
      : {};
    setIntakeNotes(parsedNotes);
    lastNotesSavedRef.current = JSON.stringify(parsedNotes);

    // Auto-expand the first active segment
    const firstActive = firstActiveSegment(parsedChecks, parsedStatuses);
    setExpandedSegIdx(firstActive);
  }, [intakeProgress]);

  // Debounced autosave for segment checks + statuses
  useEffect(() => {
    if (!hydratedRef.current || !projectId) return;
    const snapChecks = JSON.stringify(checks);
    const snapStatuses = JSON.stringify(statuses);
    if (
      snapChecks === lastChecksSavedRef.current &&
      snapStatuses === lastStatusesSavedRef.current
    )
      return;
    if (updateIntake.isPending) return;

    const handle = setTimeout(() => {
      updateIntake.mutate(
        {
          projectId,
          data: {
            agendaChecks: checks,
            segStatuses: statuses,
          },
        },
        {
          onSuccess: () => {
            lastChecksSavedRef.current = snapChecks;
            lastStatusesSavedRef.current = snapStatuses;
            queryClient.invalidateQueries({
              queryKey: getGetIntakeProgressQueryKey(projectId),
            });
          },
          onError: () => {
            toast({
              title: "Couldn't save progress",
              description: "Your changes will retry automatically.",
              variant: "destructive",
            });
          },
        },
      );
    }, 800);
    return () => clearTimeout(handle);
  }, [checks, statuses, projectId, updateIntake.isPending]);

  // Debounced autosave for kickoffAnswers (separate from segment save)
  useEffect(() => {
    if (!hydratedRef.current || !projectId) return;
    const snap = JSON.stringify(kickoffAnswers);
    if (snap === lastKickoffSavedRef.current) return;
    const handle = setTimeout(() => {
      updateIntake.mutate(
        { projectId, data: { kickoffAnswers: kickoffAnswers as Record<string, unknown> } },
        {
          onSuccess: () => {
            lastKickoffSavedRef.current = snap;
            queryClient.invalidateQueries({ queryKey: getGetIntakeProgressQueryKey(projectId) });
          },
        },
      );
    }, 800);
    return () => clearTimeout(handle);
  }, [kickoffAnswers, projectId]);

  // ---------------------------------------------------------------------------
  // Interview handlers
  // ---------------------------------------------------------------------------

  const handleInterviewAnswer = (node: InterviewNode, option: InterviewOption) => {
    setKickoffAnswers((prev) => {
      const updatedAnswers = [
        ...(prev.answers ?? []).filter((a) => a.nodeId !== node.id),
        { nodeId: node.id, prompt: node.prompt, value: option.value, label: option.label },
      ];
      const completed = option.next === "done";
      return {
        version: 1,
        designMethod: node.id === "design_approach" ? option.value : (prev.designMethod ?? null),
        currentNodeId: completed ? null : option.next,
        completed,
        answers: updatedAnswers,
        summary: buildSummary(updatedAnswers),
      };
    });
  };

  const handleResetInterview = () => {
    setKickoffAnswers({ ...INITIAL_INTERVIEW });
  };

  // ---------------------------------------------------------------------------
  // Timer state (session-only; not persisted)
  // ---------------------------------------------------------------------------

  const [activeTimerIdx, setActiveTimerIdx] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState<number[]>(() =>
    Array(TOTAL_SEGMENTS).fill(0),
  );
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (activeTimerIdx == null) {
      if (timerIntervalRef.current != null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }
    timerIntervalRef.current = setInterval(() => {
      setTimerElapsed((prev) => {
        const next = [...prev];
        next[activeTimerIdx] = (next[activeTimerIdx] ?? 0) + 1;
        return next;
      });
    }, 1000);
    return () => {
      if (timerIntervalRef.current != null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [activeTimerIdx]);

  const handleTimerToggle = (idx: number) => {
    setActiveTimerIdx((prev) => (prev === idx ? null : idx));
  };

  // ---------------------------------------------------------------------------
  // Checklist handlers
  // ---------------------------------------------------------------------------

  const handleCheckChange = (segIdx: number, checkIdx: number, val: boolean) => {
    setChecks((prev) => {
      const next = prev.map((row, i) => (i === segIdx ? [...row] : row));
      next[segIdx][checkIdx] = val;
      return next;
    });
  };

  const handleMarkDone = (segIdx: number) => {
    setStatuses((prev) => {
      const next = [...prev];
      next[segIdx] = "done";
      return next;
    });
    setChecks((prev) => {
      const next = prev.map((row, i) =>
        i === segIdx ? row.map(() => true) : row,
      );
      return next;
    });
    // Stop timer if running for this segment
    if (activeTimerIdx === segIdx) setActiveTimerIdx(null);
    // Auto-expand next segment
    const nextIncomplete = ALL_SEGMENTS.findIndex(
      (s, i) => i > segIdx && statuses[i] !== "done",
    );
    if (nextIncomplete >= 0) setExpandedSegIdx(nextIncomplete);
  };

  // ---------------------------------------------------------------------------
  // Recording state
  // ---------------------------------------------------------------------------

  const [isRecording, setIsRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [pendingRec, setPendingRec] = useState<{
    blob: Blob;
    url: string;
    durationSec: number;
  } | null>(null);
  const [transcribingId, setTranscribingId] = useState<number | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recStreamRef = useRef<MediaStream | null>(null);

  // Recording elapsed ticker
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording) {
      interval = setInterval(() => setRecElapsed((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Revoke preview URL on change/unmount
  useEffect(() => {
    return () => {
      if (pendingRec) URL.revokeObjectURL(pendingRec.url);
    };
  }, [pendingRec]);

  // Release mic on unmount
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // already inactive
      }
      mediaRecorderRef.current = null;
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
    };
  }, []);

  const stopRecordingTracks = () => {
    recStreamRef.current?.getTracks().forEach((t) => t.stop());
    recStreamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (pendingRec) {
      URL.revokeObjectURL(pendingRec.url);
      setPendingRec(null);
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({
        title: "Recording not supported",
        description: "This browser cannot capture audio.",
        variant: "destructive",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const durationSec = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        setPendingRec({ blob, url: URL.createObjectURL(blob), durationSec });
        stopRecordingTracks();
      };
      mediaRecorderRef.current = recorder;
      recStartRef.current = Date.now();
      setRecElapsed(0);
      recorder.start();
      setIsRecording(true);
    } catch {
      stopRecordingTracks();
      mediaRecorderRef.current = null;
      toast({
        title: "Microphone blocked",
        description: "Allow microphone access to record.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const discardPending = () => {
    if (pendingRec) URL.revokeObjectURL(pendingRec.url);
    setPendingRec(null);
  };

  const saveRecording = async () => {
    if (!pendingRec) return;
    const contentType = pendingRec.blob.type || "audio/webm";
    const ext = contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("ogg")
        ? "ogg"
        : "webm";
    try {
      const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
        data: { contentType, size: pendingRec.blob.size, name: `kickoff-recording.${ext}` },
      });
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: pendingRec.blob,
      });
      if (!putRes.ok) throw new Error(`upload failed (${putRes.status})`);
      await createRecording.mutateAsync({
        projectId,
        data: {
          meetingId: undefined,
          kind: "upload",
          title: "Kickoff recording",
          objectPath,
          contentType,
          sizeBytes: pendingRec.blob.size,
          durationSec: pendingRec.durationSec,
        },
      });
      queryClient.invalidateQueries({
        queryKey: getListMeetingRecordingsQueryKey(projectId),
      });
      discardPending();
      toast({ title: "Recording saved" });
    } catch {
      toast({
        title: "Could not save recording",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const removeRecording = async (id: number) => {
    try {
      await deleteRecording.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListMeetingRecordingsQueryKey(projectId),
      });
    } catch {
      toast({
        title: "Could not remove recording",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const transcribe = async (id: number) => {
    setTranscribingId(id);
    try {
      await transcribeRecording.mutateAsync({ id });
      queryClient.invalidateQueries({
        queryKey: getListMeetingRecordingsQueryKey(projectId),
      });
      toast({
        title: "Transcript ready",
        description: "The recording has been transcribed.",
      });
    } catch (err) {
      const code = statusCode(err);
      if (code === 503) {
        setAiUnavailable(true);
        toast({
          title: "AI is not configured",
          description: "Transcription needs the AI integration.",
          variant: "destructive",
        });
      } else if (code === 413) {
        toast({
          title: "Recording too large",
          description: "Audio must be under 25 MB and 20 minutes.",
          variant: "destructive",
        });
      } else if (code === 422) {
        toast({
          title: "No speech detected",
          description: "Try a clearer recording.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Could not transcribe", variant: "destructive" });
      }
    } finally {
      setTranscribingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Transcript-to-notes pipeline
  // ---------------------------------------------------------------------------

  const [saveTranscriptPending, setSaveTranscriptPending] = useState(false);

  const handleSaveTranscriptToNotes = async (transcript: string) => {
    if (!projectId || !transcript) return;
    setSaveTranscriptPending(true);
    const updatedNotes = { ...intakeNotes, kickoff_transcript: transcript };
    setIntakeNotes(updatedNotes);
    const snap = JSON.stringify(updatedNotes);
    try {
      await updateIntake.mutateAsync({
        projectId,
        data: { notes: updatedNotes },
      });
      lastNotesSavedRef.current = snap;
      queryClient.invalidateQueries({ queryKey: getGetIntakeProgressQueryKey(projectId) });
      toast({ title: "Transcript saved to project notes" });
    } catch {
      toast({ title: "Could not save transcript", variant: "destructive" });
    } finally {
      setSaveTranscriptPending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Generate agenda
  // ---------------------------------------------------------------------------

  const handleGenerateAgenda = () => {
    generateAgenda.mutate(
      { projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetIntakeProgressQueryKey(projectId),
          });
          toast({ title: "Suggested agenda generated" });
        },
        onError: () => {
          toast({
            title: "Could not generate agenda",
            description: "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const totalDone = statuses.filter((s) => s === "done").length;
  const totalChecked = checks.flat().filter(Boolean).length;
  const totalCheckItems = ALL_SEGMENTS.reduce((sum, s) => sum + s.checks.length, 0);
  const currentActiveIdx = firstActiveSegment(checks, statuses);
  const generatedAgenda = intakeProgress?.generatedAgenda;
  const hasGeneratedAgenda =
    generatedAgenda != null &&
    typeof generatedAgenda === "object" &&
    (generatedAgenda as GeneratedAgenda).items?.length > 0;

  const totalMinutes = ALL_SEGMENTS.reduce((sum, s) => sum + s.minutes, 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const mainContent = viewingPastAgenda ? (
    <PastAgendaView
      agenda={generatedAgenda as GeneratedAgenda}
      onBack={() => setViewingPastAgenda(false)}
    />
  ) : (
    <CurrentAgendaView
      projectId={projectId}
      checks={checks}
      statuses={statuses}
      currentActiveIdx={currentActiveIdx}
      expandedSegIdx={expandedSegIdx}
      setExpandedSegIdx={setExpandedSegIdx}
      timerElapsed={timerElapsed}
      activeTimerIdx={activeTimerIdx}
      onTimerToggle={handleTimerToggle}
      onCheckChange={handleCheckChange}
      onMarkDone={handleMarkDone}
      totalDone={totalDone}
      totalChecked={totalChecked}
      totalCheckItems={totalCheckItems}
      totalMinutes={totalMinutes}
      isRecording={isRecording}
      recElapsed={recElapsed}
      pendingRec={pendingRec}
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onSaveRecording={saveRecording}
      onDiscardPending={discardPending}
      kickoffRecordings={kickoffRecordings}
      onRemoveRecording={removeRecording}
      onTranscribe={transcribe}
      transcribingId={transcribingId}
      aiUnavailable={aiUnavailable}
      createRecordingPending={createRecording.isPending || requestUploadUrl.isPending}
      onGenerateAgenda={handleGenerateAgenda}
      generateAgendaPending={generateAgenda.isPending}
      kickoffAnswers={kickoffAnswers}
      onInterviewAnswer={handleInterviewAnswer}
      onResetInterview={handleResetInterview}
      savedTranscript={intakeNotes["kickoff_transcript"] ?? null}
      onSaveTranscriptToNotes={handleSaveTranscriptToNotes}
      saveTranscriptPending={saveTranscriptPending}
    />
  );

  return (
    <div className="flex gap-0 overflow-hidden rounded-lg border border-border">
      {/* Sidebar */}
      <aside
        className={cn(
          "shrink-0 border-r border-border bg-muted/20 transition-all duration-200",
          sidebarOpen ? "w-56" : "w-10",
        )}
        aria-label="Agenda navigation"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-2 py-2">
            {sidebarOpen && (
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Agenda
              </span>
            )}
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto py-2">
              {/* Current agenda phases */}
              {KICKOFF_PHASES.map((phase) => (
                <div key={phase.id} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {phase.label}
                  </div>
                  {phase.segments.map((seg) => {
                    const isDone = statuses[seg.index] === "done";
                    const isActive = seg.index === currentActiveIdx && !viewingPastAgenda;
                    const { done: cdone, total: ctotal } = checksProgress(checks, seg.index);
                    return (
                      <button
                        key={seg.index}
                        type="button"
                        onClick={() => {
                          setViewingPastAgenda(false);
                          setExpandedSegIdx(seg.index);
                        }}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" aria-hidden="true" />
                        ) : (
                          <div
                            className={cn(
                              "h-3 w-3 shrink-0 rounded-full border",
                              isActive ? "border-primary" : "border-muted-foreground/40",
                            )}
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">{seg.title}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {cdone}/{ctotal}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Past agendas */}
              {hasGeneratedAgenda && (
                <div className="mt-2 border-t border-border pt-2">
                  <Collapsible open={pastAgendasOpen} onOpenChange={setPastAgendasOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Past agendas
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 text-muted-foreground transition-transform",
                          pastAgendasOpen && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <button
                        type="button"
                        onClick={() => setViewingPastAgenda(true)}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded px-3 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          viewingPastAgenda
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                          {(generatedAgenda as GeneratedAgenda).projectTitle ?? "Suggested agenda"}
                        </span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main pane */}
      <div className="min-w-0 flex-1 overflow-y-auto">{mainContent}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KickoffInterview component
// ---------------------------------------------------------------------------

interface KickoffInterviewProps {
  kickoffAnswers: KickoffAnswers;
  onAnswer: (node: InterviewNode, option: InterviewOption) => void;
  onReset: () => void;
}

function KickoffInterview({ kickoffAnswers, onAnswer, onReset }: KickoffInterviewProps) {
  const { completed, currentNodeId, answers, summary } = kickoffAnswers;
  const currentNode = completed || !currentNodeId ? null : INTERVIEW_NODES[currentNodeId];
  const hasProgress = (answers ?? []).length > 0;

  return (
    <section aria-labelledby="interview-heading" className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="interview-heading" className="text-sm font-semibold text-foreground">
          Pre-session profile
        </h3>
        {hasProgress && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start over
          </button>
        )}
      </div>

      {completed ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Profile saved. This feeds the session recap and agenda suggestion.</p>
          <ul className="space-y-1">
            {(summary ?? []).map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
                <span className="text-foreground">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : currentNode ? (
        <div className="space-y-3">
          {hasProgress && (
            <div className="flex gap-1" aria-label="Interview progress">
              {Object.keys(INTERVIEW_NODES).map((nodeId) => {
                const answered = (answers ?? []).some((a) => a.nodeId === nodeId);
                const isCurrent = nodeId === currentNodeId;
                return (
                  <div
                    key={nodeId}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      answered ? "bg-primary" : isCurrent ? "bg-primary/40" : "bg-muted",
                    )}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
          )}
          <p className="text-sm font-medium text-foreground">{currentNode.prompt}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {currentNode.options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onAnswer(currentNode, opt)}
                className="rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Answer a few questions before the session to tailor the recap and agenda.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CurrentAgendaView
// ---------------------------------------------------------------------------

interface CurrentAgendaViewProps {
  projectId: number;
  checks: boolean[][];
  statuses: string[];
  currentActiveIdx: number;
  expandedSegIdx: number | null;
  setExpandedSegIdx: (idx: number | null) => void;
  timerElapsed: number[];
  activeTimerIdx: number | null;
  onTimerToggle: (idx: number) => void;
  onCheckChange: (segIdx: number, checkIdx: number, val: boolean) => void;
  onMarkDone: (segIdx: number) => void;
  totalDone: number;
  totalChecked: number;
  totalCheckItems: number;
  totalMinutes: number;
  isRecording: boolean;
  recElapsed: number;
  pendingRec: { blob: Blob; url: string; durationSec: number } | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSaveRecording: () => void;
  onDiscardPending: () => void;
  kickoffRecordings: Array<{
    id: number;
    kind: string;
    title: string;
    objectPath?: string | null;
    durationSec?: number | null;
    transcript?: string | null;
    draftNotes?: string | null;
    createdAt: string;
  }>;
  onRemoveRecording: (id: number) => void;
  onTranscribe: (id: number) => void;
  transcribingId: number | null;
  aiUnavailable: boolean;
  createRecordingPending: boolean;
  onGenerateAgenda: () => void;
  generateAgendaPending: boolean;
  kickoffAnswers: KickoffAnswers;
  onInterviewAnswer: (node: InterviewNode, option: InterviewOption) => void;
  onResetInterview: () => void;
  savedTranscript: string | null;
  onSaveTranscriptToNotes: (transcript: string) => void;
  saveTranscriptPending: boolean;
}

function CurrentAgendaView({
  checks,
  statuses,
  currentActiveIdx,
  expandedSegIdx,
  setExpandedSegIdx,
  timerElapsed,
  activeTimerIdx,
  onTimerToggle,
  onCheckChange,
  onMarkDone,
  totalDone,
  totalChecked,
  totalCheckItems,
  totalMinutes,
  isRecording,
  recElapsed,
  pendingRec,
  onStartRecording,
  onStopRecording,
  onSaveRecording,
  onDiscardPending,
  kickoffRecordings,
  onRemoveRecording,
  onTranscribe,
  transcribingId,
  aiUnavailable,
  createRecordingPending,
  onGenerateAgenda,
  generateAgendaPending,
  kickoffAnswers,
  onInterviewAnswer,
  onResetInterview,
  savedTranscript,
  onSaveTranscriptToNotes,
  saveTranscriptPending,
}: CurrentAgendaViewProps) {
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<number | null>(null);

  // On mobile, collapse the kickoff phases into a single-open accordion to cut
  // scrolling; the phase holding the active segment opens and follows progress.
  // Desktop always shows every phase expanded.
  const isMobile = useIsMobile();
  const activePhaseId =
    KICKOFF_PHASES.find((p) => p.segments.some((s) => s.index === currentActiveIdx))?.id ??
    KICKOFF_PHASES[0].id;
  const [openPhaseId, setOpenPhaseId] = useState<string | null>(activePhaseId);
  useEffect(() => {
    setOpenPhaseId(activePhaseId);
  }, [activePhaseId]);

  return (
    <div className="flex flex-col">
      {/* Meeting header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {/* Record start control */}
          {!isRecording && !pendingRec ? (
            <Button size="sm" onClick={onStartRecording} aria-label="Start recording">
              <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Record
            </Button>
          ) : isRecording ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1.5">
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-red-600"
                aria-hidden="true"
              />
              <span className="font-mono text-sm text-red-700">{formatDuration(recElapsed)}</span>
              <span className="text-xs text-red-600">Recording</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
              Recording captured
            </div>
          )}

          {/* Progress summary */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>
              {totalDone}/{ALL_SEGMENTS.length} segments
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {totalChecked}/{totalCheckItems} checks
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Generate agenda button */}
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerateAgenda}
              disabled={generateAgendaPending}
              aria-label="Generate suggested agenda"
            >
              {generateAgendaPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              Suggest
            </Button>

            {/* Automation info popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label="About timers and automation"
                >
                  <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-sm" side="bottom" align="end">
                <div className="space-y-2">
                  <p className="font-semibold">Timers and automation</p>
                  <p className="text-muted-foreground">
                    Each segment has its own timer. Only one timer runs at a time;
                    starting a new one pauses the previous. Elapsed times are shown
                    next to each segment and are tracked for the session.
                  </p>
                  <p className="text-muted-foreground">
                    Checklist progress and segment status autosave as you work. The
                    "Suggest" button generates a rules-based agenda from the project,
                    course record, and learning objectives.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Total agenda time badge */}
        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kickoff agenda
          </span>
          <span className="text-xs text-muted-foreground">{totalMinutes} min total</span>
        </div>
      </div>

      {/* Pre-session interview */}
      <div className="p-4 pb-0">
        <KickoffInterview
          kickoffAnswers={kickoffAnswers}
          onAnswer={onInterviewAnswer}
          onReset={onResetInterview}
        />
      </div>

      {/* Phase-grouped segments */}
      <div className="space-y-4 p-4">
        {KICKOFF_PHASES.map((phase) => {
          const phaseOpen = !isMobile || openPhaseId === phase.id;
          const panelId = `phase-panel-${phase.id}`;
          const phaseDone = phase.segments.filter(
            (s) => statuses[s.index] === "done" || allChecksDone(checks, s.index),
          ).length;
          return (
            <section key={phase.id} aria-labelledby={`phase-${phase.id}`}>
              {isMobile ? (
                <div className="mb-2">
                  <button
                    type="button"
                    id={`phase-${phase.id}`}
                    onClick={() =>
                      setOpenPhaseId(openPhaseId === phase.id ? null : phase.id)
                    }
                    aria-expanded={phaseOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center gap-2 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {phase.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {phaseDone}/{phase.segments.length}
                    </span>
                    <div className="h-px flex-1 bg-border" aria-hidden="true" />
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        phaseOpen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              ) : (
                <div id={`phase-${phase.id}`} className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {phase.label}
                  </span>
                  <div className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              )}
              <div id={panelId} className="space-y-2" hidden={!phaseOpen}>
                {phase.segments.map((seg) => (
                  <SegmentRow
                    key={seg.index}
                    seg={seg}
                    checks={checks[seg.index] ?? []}
                    status={statuses[seg.index] ?? "idle"}
                    isActive={seg.index === currentActiveIdx}
                    expanded={expandedSegIdx === seg.index}
                    onExpand={() =>
                      setExpandedSegIdx(expandedSegIdx === seg.index ? null : seg.index)
                    }
                    onCheckChange={(ci, v) => onCheckChange(seg.index, ci, v)}
                    onMarkDone={() => onMarkDone(seg.index)}
                    timerElapsed={timerElapsed[seg.index] ?? 0}
                    timerRunning={activeTimerIdx === seg.index}
                    onTimerToggle={() => onTimerToggle(seg.index)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Wrap-up footer */}
        <section aria-labelledby="wrapup-heading" className="rounded-lg border border-border bg-muted/20 p-4">
          <h3
            id="wrapup-heading"
            className="mb-4 text-sm font-semibold text-foreground"
          >
            Wrap-up
          </h3>

          {/* Stop recording control */}
          {isRecording ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600"
                  aria-hidden="true"
                />
                <span className="font-mono text-sm text-red-700">
                  {formatDuration(recElapsed)}
                </span>
                <span className="text-sm text-red-600">Recording in progress</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto border-red-400 text-red-700 hover:bg-red-100"
                  onClick={onStopRecording}
                  aria-label="Stop recording"
                >
                  <Square className="mr-1 h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  Stop recording
                </Button>
              </div>
            </div>
          ) : pendingRec ? (
            <div className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
                Captured {formatDuration(pendingRec.durationSec)}. Review and save.
              </div>
              <audio controls src={pendingRec.url} className="w-full" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={onSaveRecording}
                  disabled={createRecordingPending}
                >
                  {createRecordingPending ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="mr-1 h-4 w-4" aria-hidden="true" />
                  )}
                  Save recording
                </Button>
                <Button size="sm" variant="ghost" onClick={onDiscardPending}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}

          {/* Saved recordings + transcripts */}
          {kickoffRecordings.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recordings
              </div>
              {aiUnavailable && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  AI transcription is not configured. Recordings are saved and playable.
                </div>
              )}
              {kickoffRecordings.map((r) => {
                const isUpload = r.kind === "upload" && !!r.objectPath;
                const hasTranscript = !!(r.transcript || r.draftNotes);
                const isExpanded = expandedTranscriptId === r.id;
                const isTranscribing = transcribingId === r.id;
                return (
                  <div key={r.id} className="rounded-lg border border-border bg-card">
                    <div className="flex items-center gap-3 p-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {r.title}
                          </span>
                          {hasTranscript && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 border-primary/20 bg-primary/10 text-primary shadow-none hover:bg-primary/10"
                            >
                              Transcript ready
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {r.durationSec ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDuration(r.durationSec)}
                            </span>
                          ) : null}
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {isUpload && r.objectPath ? (
                        <audio
                          controls
                          preload="none"
                          src={`/api/storage${r.objectPath}`}
                          className="h-8 w-36 max-w-[35%]"
                        />
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onRemoveRecording(r.id)}
                        aria-label={`Delete recording: ${r.title}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </Button>
                    </div>

                    {isUpload ? (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                        {hasTranscript ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setExpandedTranscriptId(isExpanded ? null : r.id)
                            }
                            aria-expanded={isExpanded}
                          >
                            <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                            {isExpanded ? "Hide transcript" : "View transcript"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => onTranscribe(r.id)}
                            disabled={isTranscribing || aiUnavailable}
                          >
                            {isTranscribing ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Sparkles className="mr-1 h-4 w-4" aria-hidden="true" />
                            )}
                            {isTranscribing ? "Transcribing..." : "Transcribe"}
                          </Button>
                        )}
                      </div>
                    ) : null}

                    {isUpload && isExpanded && hasTranscript ? (
                      <div className="border-t border-border bg-muted/10 p-4 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Transcript
                        </div>
                        <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {r.draftNotes ?? r.transcript}
                        </p>
                        {(() => {
                          const transcriptText = r.draftNotes ?? r.transcript ?? "";
                          const alreadySaved = savedTranscript === transcriptText;
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => onSaveTranscriptToNotes(transcriptText)}
                              disabled={saveTranscriptPending || alreadySaved}
                              aria-label="Save transcript to project notes for agenda generation"
                            >
                              {saveTranscriptPending ? (
                                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                              ) : alreadySaved ? (
                                <CheckCircle2 className="mr-1 h-4 w-4 text-green-600" aria-hidden="true" />
                              ) : (
                                <FileText className="mr-1 h-4 w-4" aria-hidden="true" />
                              )}
                              {alreadySaved ? "Saved to project notes" : "Save to project notes"}
                            </Button>
                          );
                        })()}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recap / next-steps summary */}
          <RecapSummary checks={checks} statuses={statuses} />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecapSummary
// ---------------------------------------------------------------------------

function RecapSummary({
  checks,
  statuses,
}: {
  checks: boolean[][];
  statuses: string[];
}) {
  const doneSegments = ALL_SEGMENTS.filter(
    (s) => statuses[s.index] === "done" || allChecksDone(checks, s.index),
  );
  const incomplete = ALL_SEGMENTS.filter(
    (s) => statuses[s.index] !== "done" && !allChecksDone(checks, s.index),
  );

  if (doneSegments.length === 0 && incomplete.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Session recap
      </div>

      {doneSegments.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Completed segments</div>
          <ul className="space-y-1">
            {doneSegments.map((s) => (
              <li key={s.index} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" aria-hidden="true" />
                <span className="text-foreground">{s.title}</span>
                <span className="text-xs text-muted-foreground">({s.minutes}m)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {incomplete.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Still to complete</div>
          <ul className="space-y-1">
            {incomplete.map((s) => {
              const { done, total } = checksProgress(checks, s.index);
              return (
                <li key={s.index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/40"
                    aria-hidden="true"
                  />
                  <span>{s.title}</span>
                  {done > 0 && (
                    <span className="text-xs">
                      ({done}/{total})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PastAgendaView (read-only)
// ---------------------------------------------------------------------------

function PastAgendaView({
  agenda,
  onBack,
}: {
  agenda: GeneratedAgenda;
  onBack: () => void;
}) {
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onBack}>
          <ChevronRight className="mr-1 h-4 w-4 rotate-180" aria-hidden="true" />
          Back to kickoff agenda
        </Button>
        <span className="text-sm font-semibold text-foreground">Suggested agenda</span>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          {agenda.projectTitle ? (
            <span className="text-sm font-medium text-foreground">{agenda.projectTitle}</span>
          ) : null}
          <Badge variant="secondary" className="shadow-none">
            {agenda.totalMinutes} min
          </Badge>
          <span className="text-xs text-muted-foreground">
            Generated {agenda.generatedAt ? new Date(agenda.generatedAt).toLocaleDateString() : ""}
          </span>
        </div>

        <ol className="space-y-3">
          {(agenda.items ?? []).map((item, i) => (
            <li key={i} className="rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-foreground">{item.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{item.minutes} min</span>
              </div>
              {item.prompts?.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {item.prompts.map((p, j) => (
                    <li key={j} className="text-sm text-muted-foreground">
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
