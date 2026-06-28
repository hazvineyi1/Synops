import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "wouter";
import {
  useListProjectMeetings,
  getListProjectMeetingsQueryKey,
  useListMeetingRecordings,
  getListMeetingRecordingsQueryKey,
  useCreateProjectMeeting,
  useUpdateMeeting,
  useDeleteMeeting,
  useProcessMeetingNotes,
  useSetAgendaChecklist,
  useSetMeetingChecklist,
  useListProjectActionItems,
  getListProjectActionItemsQueryKey,
  useCreateProjectActionItem,
  useUpdateActionItem,
  useDeleteActionItem,
  useListProjectDecisions,
  getListProjectDecisionsQueryKey,
  useListProjectOpenQuestions,
  getListProjectOpenQuestionsQueryKey,
  useListProjectCorrespondence,
  getListProjectCorrespondenceQueryKey,
  useCreateProjectCorrespondence,
  useUpdateCorrespondence,
  useDeleteCorrespondence,
  useGetAgendaSummary,
  getGetAgendaSummaryQueryKey,
  type Meeting,
  type MeetingPlan,
  type ActionItem,
  type Correspondence,
  type MeetingDecision,
  type MeetingOpenQuestion,
} from "@workspace/kanon-api-client";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Plus,
  Sparkles,
  Trash2,
  Pencil,
  ListChecks,
  Mail,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Clock,
  Link2,
  FileText,
  Gavel,
  HelpCircle,
  Mic,
  Square,
  Search,
  ClipboardList,
  Target,
  CheckCircle2,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { MeetingRecordings, formatDuration, type RecorderControlsHandle } from "@/components/engine/MeetingRecordings";
import { MeetingCalendar } from "@/components/engine/MeetingCalendar";
import { authErrorMessage } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO -> "yyyy-MM-ddThh:mm" for a datetime-local input, in local time. */
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value -> ISO (UTC Z), or undefined when empty. */
function localInputToIso(v: string): string | undefined {
  return v ? new Date(v).toISOString() : undefined;
}

/** ISO -> "yyyy-MM-dd" for a date input, in local time. */
function toDateOnlyInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** date value "yyyy-MM-dd" -> ISO anchored at local noon (avoids day-shift). */
function dateOnlyToIso(v: string): string | undefined {
  return v ? new Date(`${v}T12:00:00`).toISOString() : undefined;
}

function fmtDateTime(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  // A date-only value ("yyyy-MM-dd") parses as UTC midnight, which day-shifts in
  // negative timezones. Anchor it at local noon so the displayed day is stable.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  content: "Content",
  review: "Review",
  accessibility: "Accessibility",
};

const CATEGORY_STYLES: Record<string, string> = {
  general: "bg-muted text-foreground",
  content: "bg-sky-100 text-sky-800",
  review: "bg-violet-100 text-violet-800",
  accessibility: "bg-amber-100 text-amber-800",
};

type MeetingType = "kickoff" | "working" | "final";

const MEETING_TYPES: MeetingType[] = ["kickoff", "working", "final"];

const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  kickoff: "Kickoff",
  working: "Working",
  final: "Final",
};

const MEETING_TYPE_STYLES: Record<MeetingType, string> = {
  kickoff: "bg-emerald-100 text-emerald-800",
  working: "bg-sky-100 text-sky-800",
  final: "bg-violet-100 text-violet-800",
};

function isMeetingType(v: string): v is MeetingType {
  return v === "kickoff" || v === "working" || v === "final";
}

/** Recency key for a meeting: its scheduled time, else when it was created. */
function meetingRecency(m: Meeting): number {
  const t = m.scheduledAt ?? m.createdAt;
  const ms = t ? new Date(t).getTime() : 0;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Sort most-recent first; ties broken by id (newest row first). */
function byRecencyDesc(a: Meeting, b: Meeting): number {
  return meetingRecency(b) - meetingRecency(a) || b.id - a.id;
}

/** Compact sidebar row for the master-detail meeting list. */
function MeetingListRow({
  meeting,
  selected,
  onSelect,
}: {
  meeting: Meeting;
  selected: boolean;
  onSelect: () => void;
}) {
  const type: MeetingType = isMeetingType(meeting.meetingType) ? meeting.meetingType : "working";
  const completed = meeting.status === "completed";
  const when = meeting.scheduledAt ?? meeting.createdAt;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:bg-muted/50"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {meeting.title}
        </span>
        <Badge
          variant="secondary"
          className={`shrink-0 shadow-none hover:bg-current/0 ${MEETING_TYPE_STYLES[type]}`}
        >
          {MEETING_TYPE_LABELS[type]}
        </Badge>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        {completed ? (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Completed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" /> Scheduled
          </span>
        )}
        {when ? <span>{fmtDate(when)}</span> : null}
      </div>
    </button>
  );
}

/** Main-pane header selector that chooses which meeting is open for editing. */
function WorkingMeetingPicker({
  options,
  value,
  onChange,
}: {
  options: Meeting[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor="working-meeting"
        className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block"
      >
        Working meeting
      </Label>
      <Select
        value={value != null ? String(value) : undefined}
        onValueChange={(v) => onChange(Number(v))}
      >
        <SelectTrigger
          id="working-meeting"
          className="h-9 w-[200px] sm:w-[260px]"
          aria-label="Working meeting"
        >
          <SelectValue placeholder="Select a meeting" />
        </SelectTrigger>
        <SelectContent>
          {options.map((m) => {
            const type: MeetingType = isMeetingType(m.meetingType) ? m.meetingType : "working";
            return (
              <SelectItem key={m.id} value={String(m.id)}>
                <span className="flex items-center gap-2">
                  <span className="truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {MEETING_TYPE_LABELS[type]}
                    {m.status === "completed" ? " (Completed)" : ""}
                  </span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Read-only summary of a past meeting, shown in the reference drawer so a prior
 *  week can be read beside the meeting open in the main pane. Never mutates. */
function PastMeetingReferencePanel({
  meeting,
  decisions,
  questions,
  actionItems,
  recordingCount,
  onOpenInWorkspace,
}: {
  meeting: Meeting | null;
  decisions: MeetingDecision[];
  questions: MeetingOpenQuestion[];
  actionItems: ActionItem[];
  recordingCount: number;
  onOpenInWorkspace: () => void;
}) {
  if (!meeting) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a past meeting to read its notes beside the current one.
      </p>
    );
  }
  const type: MeetingType = isMeetingType(meeting.meetingType) ? meeting.meetingType : "working";
  const when = meeting.scheduledAt ?? meeting.createdAt;
  const notes = meeting.notes?.trim() ?? "";
  const plan = meeting.agendaPlan;
  const prework = plan?.prework ?? [];
  const agenda = plan?.agenda ?? [];
  const exitCriteria = plan?.exitCriteria ?? [];
  const empty =
    !notes &&
    !meeting.focus &&
    prework.length === 0 &&
    agenda.length === 0 &&
    exitCriteria.length === 0 &&
    decisions.length === 0 &&
    actionItems.length === 0 &&
    questions.length === 0;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-snug text-foreground">{meeting.title}</h4>
          <Badge
            variant="secondary"
            className={`shrink-0 shadow-none hover:bg-current/0 ${MEETING_TYPE_STYLES[type]}`}
          >
            {MEETING_TYPE_LABELS[type]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-700" aria-hidden="true" />
            Completed
            {when ? ` on ${fmtDate(when)}` : ""}
          </p>
          {recordingCount > 0 ? (
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Video className="h-3 w-3" aria-hidden="true" />
              {recordingCount} {recordingCount === 1 ? "recording" : "recordings"}
            </p>
          ) : null}
        </div>
      </div>

      {meeting.focus ? (
        <section className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Focus
          </h5>
          <p className="text-sm text-foreground">{meeting.focus}</p>
        </section>
      ) : null}

      {prework.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" /> Pre-work
          </h5>
          <ul className="space-y-1 text-sm text-foreground">
            {prework.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    item.done ? "text-emerald-700" : "text-muted-foreground/40"
                  }`}
                  aria-hidden="true"
                />
                <span className="sr-only">{item.done ? "Done:" : "Not done:"}</span>
                <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {agenda.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Standing agenda
          </h5>
          <ol className="space-y-2 text-sm text-foreground">
            {agenda.map((it, i) => {
              const promptsDone = it.promptsDone ?? [];
              const itemComplete =
                it.prompts.length > 0 ? it.prompts.every((_, j) => promptsDone[j]) : Boolean(it.done);
              return (
                <li key={i} className="rounded-md border border-border bg-card p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`font-medium ${itemComplete ? "text-muted-foreground line-through" : ""}`}>
                      {it.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{it.minutes} min</span>
                  </div>
                  {it.prompts.length > 0 ? (
                    <ul className="mt-1.5 space-y-1 pl-1">
                      {it.prompts.map((p, j) => {
                        const checked = Boolean(promptsDone[j]);
                        return (
                          <li key={j} className="flex items-start gap-2">
                            <CheckCircle2
                              className={`mt-0.5 h-3 w-3 shrink-0 ${
                                checked ? "text-emerald-700" : "text-muted-foreground/40"
                              }`}
                              aria-hidden="true"
                            />
                            <span className="sr-only">{checked ? "Done:" : "Not done:"}</span>
                            <span className={checked ? "text-muted-foreground line-through" : ""}>{p}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {notes ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Notes
          </h5>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{notes}</p>
        </section>
      ) : null}

      {decisions.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Gavel className="h-3.5 w-3.5" aria-hidden="true" /> Decisions
          </h5>
          <ul className="space-y-1.5 text-sm text-foreground">
            {decisions.map((d) => (
              <li key={d.id}>
                <p>{d.text}</p>
                {d.decidedBy ? (
                  <p className="text-xs text-muted-foreground">By {d.decidedBy}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {actionItems.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> Action items
          </h5>
          <ul className="space-y-1 text-sm text-foreground">
            {actionItems.map((a) => {
              const done = a.status === "done";
              return (
                <li key={a.id} className="flex items-start gap-2">
                  <CheckCircle2
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      done ? "text-emerald-700" : "text-muted-foreground/40"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="sr-only">{done ? "Done:" : "Not done:"}</span>
                  <span className={done ? "text-muted-foreground line-through" : ""}>{a.title}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {questions.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" /> Open questions
          </h5>
          <ul className="space-y-1 text-sm text-foreground">
            {questions.map((q) => {
              const resolved = q.status === "resolved";
              return (
                <li key={q.id} className={resolved ? "text-muted-foreground line-through" : ""}>
                  {resolved ? <span className="sr-only">Resolved:</span> : null}
                  {q.text}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {exitCriteria.length > 0 ? (
        <section className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Target className="h-3.5 w-3.5" aria-hidden="true" /> Definition of done
          </h5>
          <ul className="space-y-1 text-sm text-foreground">
            {exitCriteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    c.met ? "text-emerald-700" : "text-muted-foreground/40"
                  }`}
                  aria-hidden="true"
                />
                <span className="sr-only">{c.met ? "Met:" : "Not met:"}</span>
                <span className={c.met ? "text-muted-foreground line-through" : ""}>{c.text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? (
        <p className="text-sm text-muted-foreground">No notes were captured for this meeting.</p>
      ) : null}

      <Button variant="outline" size="sm" className="w-full" onClick={onOpenInWorkspace}>
        <ArrowUpRight className="mr-2 h-4 w-4" aria-hidden="true" /> Open in workspace
      </Button>
    </div>
  );
}

/** Drawer body shared by the desktop resizable panel and the mobile sheet: a
 *  search box, the completed-meeting list, and the read-only reference panel. */
function PastMeetingsDrawerContent({
  variant,
  meetings,
  totalCompleted,
  search,
  onSearch,
  selectedId,
  onSelect,
  referenceMeeting,
  referenceDecisions,
  referenceQuestions,
  referenceActionItems,
  referenceRecordingCount,
  onOpenInWorkspace,
  onCollapse,
}: {
  variant: "desktop" | "mobile";
  meetings: Meeting[];
  totalCompleted: number;
  search: string;
  onSearch: (value: string) => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  referenceMeeting: Meeting | null;
  referenceDecisions: MeetingDecision[];
  referenceQuestions: MeetingOpenQuestion[];
  referenceActionItems: ActionItem[];
  referenceRecordingCount: number;
  onOpenInWorkspace: (id: number) => void;
  onCollapse?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-3">
      {variant === "desktop" ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Past meetings
          </span>
          {onCollapse ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onCollapse}
              aria-label="Collapse past meetings drawer"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Label htmlFor="past-meeting-search" className="sr-only">
          Search past meetings
        </Label>
        <Input
          id="past-meeting-search"
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search past meetings"
          className="pl-9"
        />
      </div>

      {totalCompleted === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No past meetings yet. Completed meetings appear here for reference.
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No past meetings match "{search.trim()}".
        </div>
      ) : (
        <ScrollArea className="max-h-52 shrink-0 rounded-lg border border-border">
          <div className="space-y-2 p-2">
            {meetings.map((m) => (
              <MeetingListRow
                key={m.id}
                meeting={m}
                selected={m.id === selectedId}
                onSelect={() => onSelect(m.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
        <div className="border-b border-border px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            For reference
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3">
            <PastMeetingReferencePanel
              meeting={referenceMeeting}
              decisions={referenceDecisions}
              questions={referenceQuestions}
              actionItems={referenceActionItems}
              recordingCount={referenceRecordingCount}
              onOpenInWorkspace={() =>
                referenceMeeting && onOpenInWorkspace(referenceMeeting.id)
              }
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Client-side mirror of the server's next-type suggestion (meetingTemplates.ts:
// every type defaults to a following working session), used only to preselect the
// "next meeting type" control. The user can override before generating.
function suggestNextType(_current: MeetingType): MeetingType {
  return "working";
}

type AgendaPlan = NonNullable<Meeting["generatedAgenda"]>;

// Mirror of the server toggle for the proposed NEXT-meeting agenda so the
// optimistic cache update matches what the API will persist: flip a whole item
// (no prompt) or one prompt within an item.
function applyAgendaToggle(
  agenda: AgendaPlan,
  itemIndex: number,
  promptIndex: number | null,
  done: boolean,
): AgendaPlan {
  return {
    ...agenda,
    items: agenda.items.map((item, i) => {
      if (i !== itemIndex) return item;
      if (promptIndex == null) return { ...item, done };
      const promptsDone = item.promptsDone ? [...item.promptsDone] : [];
      while (promptsDone.length < item.prompts.length) promptsDone.push(false);
      promptsDone[promptIndex] = done;
      return { ...item, promptsDone };
    }),
  };
}

type PlanSection = "prework" | "agenda" | "exitCriteria";

// Mirror of the server toggle for the meeting's OWN plan (pre-work, standing
// agenda, exit criteria) so the optimistic cache update matches what the API
// persists.
function applyPlanToggle(
  plan: MeetingPlan,
  section: PlanSection,
  itemIndex: number,
  promptIndex: number | null,
  value: boolean,
): MeetingPlan {
  if (section === "prework") {
    return {
      ...plan,
      prework: plan.prework.map((it, i) => (i === itemIndex ? { ...it, done: value } : it)),
    };
  }
  if (section === "exitCriteria") {
    return {
      ...plan,
      exitCriteria: plan.exitCriteria.map((it, i) => (i === itemIndex ? { ...it, met: value } : it)),
    };
  }
  return {
    ...plan,
    agenda: plan.agenda.map((it, i) => {
      if (i !== itemIndex) return it;
      if (promptIndex == null) return { ...it, done: value };
      const promptsDone = it.promptsDone ? [...it.promptsDone] : [];
      while (promptsDone.length < it.prompts.length) promptsDone.push(false);
      promptsDone[promptIndex] = value;
      return { ...it, promptsDone };
    }),
  };
}

export default function ProjectMeetings() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const meetingsKey = getListProjectMeetingsQueryKey(projectId);
  const actionItemsKey = getListProjectActionItemsQueryKey(projectId);
  const decisionsKey = getListProjectDecisionsQueryKey(projectId);
  const openQuestionsKey = getListProjectOpenQuestionsQueryKey(projectId);
  const correspondenceKey = getListProjectCorrespondenceQueryKey(projectId);
  const summaryKey = getGetAgendaSummaryQueryKey(projectId);

  const { data: meetingsData } = useListProjectMeetings(projectId, {
    query: { enabled: !!projectId, queryKey: meetingsKey },
  });
  const { data: actionItemsData } = useListProjectActionItems(projectId, {
    query: { enabled: !!projectId, queryKey: actionItemsKey },
  });
  const { data: decisionsData } = useListProjectDecisions(projectId, {
    query: { enabled: !!projectId, queryKey: decisionsKey },
  });
  const { data: openQuestionsData } = useListProjectOpenQuestions(projectId, {
    query: { enabled: !!projectId, queryKey: openQuestionsKey },
  });
  const { data: correspondenceData } = useListProjectCorrespondence(projectId, {
    query: { enabled: !!projectId, queryKey: correspondenceKey },
  });
  const { data: summary } = useGetAgendaSummary(projectId, {
    query: { enabled: !!projectId, queryKey: summaryKey },
  });
  const { data: recordingsData } = useListMeetingRecordings(projectId, {
    query: { enabled: !!projectId, queryKey: getListMeetingRecordingsQueryKey(projectId) },
  });

  const meetings = useMemo(() => meetingsData ?? [], [meetingsData]);
  const actionItems = useMemo(() => actionItemsData ?? [], [actionItemsData]);
  const decisions = useMemo(() => decisionsData ?? [], [decisionsData]);
  const openQuestions = useMemo(() => openQuestionsData ?? [], [openQuestionsData]);
  const correspondence = useMemo(() => correspondenceData ?? [], [correspondenceData]);

  // Group the three live-capture streams by the meeting they were captured in so
  // each meeting card shows its own slice.
  const decisionsByMeeting = useMemo(() => {
    const map = new Map<number, MeetingDecision[]>();
    for (const d of decisions) {
      if (d.meetingId == null) continue;
      const arr = map.get(d.meetingId) ?? [];
      arr.push(d);
      map.set(d.meetingId, arr);
    }
    return map;
  }, [decisions]);

  const questionsByMeeting = useMemo(() => {
    const map = new Map<number, MeetingOpenQuestion[]>();
    for (const q of openQuestions) {
      if (q.meetingId == null) continue;
      const arr = map.get(q.meetingId) ?? [];
      arr.push(q);
      map.set(q.meetingId, arr);
    }
    return map;
  }, [openQuestions]);

  const actionItemsByMeeting = useMemo(() => {
    const map = new Map<number, ActionItem[]>();
    for (const a of actionItems) {
      if (a.sourceMeetingId == null) continue;
      const arr = map.get(a.sourceMeetingId) ?? [];
      arr.push(a);
      map.set(a.sourceMeetingId, arr);
    }
    return map;
  }, [actionItems]);

  // Per-meeting recording counts, used only for the read-only reference panel's
  // "N recordings" indicator. The editable MeetingRecordings panel fetches its
  // own data; this shares the same project-scoped query (same cache key).
  const recordingCountByMeeting = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of recordingsData ?? []) {
      if (r.meetingId == null) continue;
      map.set(r.meetingId, (map.get(r.meetingId) ?? 0) + 1);
    }
    return map;
  }, [recordingsData]);

  const createMeeting = useCreateProjectMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const processNotes = useProcessMeetingNotes();
  const setAgendaChecklist = useSetAgendaChecklist();
  const setMeetingChecklist = useSetMeetingChecklist();
  const createActionItem = useCreateProjectActionItem();
  const updateActionItem = useUpdateActionItem();
  const deleteActionItem = useDeleteActionItem();
  const createCorrespondence = useCreateProjectCorrespondence();
  const updateCorrespondence = useUpdateCorrespondence();
  const deleteCorrespondence = useDeleteCorrespondence();

  const fail = (err: unknown, fallback: string) =>
    toast({ title: authErrorMessage(err) || fallback, variant: "destructive" });
  const invalidateMeetings = () => queryClient.invalidateQueries({ queryKey: meetingsKey });
  const invalidateActionItems = () => queryClient.invalidateQueries({ queryKey: actionItemsKey });
  const invalidateDecisions = () => queryClient.invalidateQueries({ queryKey: decisionsKey });
  const invalidateOpenQuestions = () => queryClient.invalidateQueries({ queryKey: openQuestionsKey });
  const invalidateCorrespondence = () => queryClient.invalidateQueries({ queryKey: correspondenceKey });
  const invalidateSummary = () => queryClient.invalidateQueries({ queryKey: summaryKey });

  // ONE promise chain per meeting so every checklist write for that row is
  // serialized: at most one PATCH is in flight per meeting, so the server's
  // read-modify-write of its JSON columns never races itself, regardless of which
  // section (pre-work / standing agenda / exit criteria) or which blob (the
  // meeting's own `agendaPlan` vs the proposed next `generatedAgenda`) is toggled.
  // `pending` holds the still-unconfirmed transforms; when a response lands we
  // shift the one it confirms and replay ALL remaining pending transforms over the
  // returned row so an in-flight toggle in any other section is never erased.
  const toggleChains = useRef(new Map<number, Promise<unknown>>());
  const togglePending = useRef(new Map<number, ((m: Meeting) => Meeting)[]>());

  function runMeetingToggle(
    meetingId: number,
    apply: (m: Meeting) => Meeting,
    call: () => Promise<Meeting>,
  ) {
    const pending = togglePending.current.get(meetingId) ?? [];
    pending.push(apply);
    togglePending.current.set(meetingId, pending);

    queryClient.setQueryData<Meeting[]>(meetingsKey, (old) =>
      old?.map((m) => (m.id === meetingId ? apply(m) : m)),
    );

    const prev = toggleChains.current.get(meetingId) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => call())
      .then((updated) => {
        const rest = togglePending.current.get(meetingId) ?? [];
        rest.shift();
        let merged = updated;
        for (const fn of rest) merged = fn(merged);
        queryClient.setQueryData<Meeting[]>(meetingsKey, (old) =>
          old?.map((m) => (m.id === merged.id ? merged : m)),
        );
      })
      .catch((err) => {
        (togglePending.current.get(meetingId) ?? []).shift();
        fail(err, "Could not update the checklist");
        invalidateMeetings();
      });
    toggleChains.current.set(meetingId, next);
  }

  function toggleAgenda(meetingId: number, itemIndex: number, promptIndex: number | null, done: boolean) {
    runMeetingToggle(
      meetingId,
      (m) =>
        m.generatedAgenda
          ? { ...m, generatedAgenda: applyAgendaToggle(m.generatedAgenda, itemIndex, promptIndex, done) }
          : m,
      () => setAgendaChecklist.mutateAsync({ id: meetingId, data: { itemIndex, promptIndex, done } }),
    );
  }

  function togglePlan(
    meetingId: number,
    section: PlanSection,
    itemIndex: number,
    promptIndex: number | null,
    value: boolean,
  ) {
    runMeetingToggle(
      meetingId,
      (m) => ({ ...m, agendaPlan: applyPlanToggle(m.agendaPlan, section, itemIndex, promptIndex, value) }),
      () =>
        setMeetingChecklist.mutateAsync({
          id: meetingId,
          data: { section, itemIndex, promptIndex, value },
        }),
    );
  }

  // ---- New meeting form ----
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingType, setNewMeetingType] = useState<MeetingType>("working");
  const [newMeetingFocus, setNewMeetingFocus] = useState("");
  const [newMeetingAt, setNewMeetingAt] = useState("");

  // ---- Past-meeting drawer search (scoped to completed meetings only) ----
  const [meetingSearch, setMeetingSearch] = useState("");

  // Active (scheduled) meetings drive the main-pane working selector; completed
  // meetings populate the reference drawer. Both are most-recent first.
  const activeMeetings = useMemo(
    () => meetings.filter((m) => m.status !== "completed").sort(byRecencyDesc),
    [meetings],
  );
  const completedMeetings = useMemo(
    () => meetings.filter((m) => m.status === "completed").sort(byRecencyDesc),
    [meetings],
  );
  // The drawer search narrows only the past (completed) list; it must never
  // invalidate the working meeting open in the main pane.
  const filteredCompleted = useMemo(() => {
    const q = meetingSearch.trim().toLowerCase();
    if (!q) return completedMeetings;
    return completedMeetings.filter((m) => {
      const typeLabel = isMeetingType(m.meetingType) ? MEETING_TYPE_LABELS[m.meetingType] : "";
      return [m.title, m.notes ?? "", m.focus ?? "", m.meetingType, typeLabel]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [completedMeetings, meetingSearch]);

  // ---- Working meeting (editable, main pane) ----
  // Defaults to the most recent active meeting (else the most recent meeting
  // overall). Reconciled during render so it can never point at a meeting that no
  // longer exists (deleted).
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);

  const defaultMeetingId = useMemo(() => {
    if (activeMeetings.length > 0) return activeMeetings[0].id;
    return completedMeetings[0]?.id ?? null;
  }, [activeMeetings, completedMeetings]);

  const selectionValid =
    selectedMeetingId != null && meetings.some((m) => m.id === selectedMeetingId);
  const effectiveMeetingId = selectionValid ? selectedMeetingId : defaultMeetingId;
  const selectedMeeting = useMemo(
    () => meetings.find((m) => m.id === effectiveMeetingId) ?? null,
    [meetings, effectiveMeetingId],
  );

  // The working picker always includes the current working meeting, even when it
  // is completed (e.g. reopened from the reference drawer).
  const workingOptions = useMemo(() => {
    const list = [...activeMeetings];
    if (selectedMeeting && !list.some((m) => m.id === selectedMeeting.id)) {
      list.unshift(selectedMeeting);
    }
    return list;
  }, [activeMeetings, selectedMeeting]);

  // ---- Reference meeting (read-only, side drawer) ----
  // Independent of the working meeting so a past week can be read alongside the
  // current one. Defaults to the most recent completed meeting; reconciled so it
  // can never point at a meeting that no longer exists.
  const [referenceMeetingId, setReferenceMeetingId] = useState<number | null>(null);
  const referenceValid =
    referenceMeetingId != null && completedMeetings.some((m) => m.id === referenceMeetingId);
  const effectiveReferenceId = referenceValid
    ? referenceMeetingId
    : completedMeetings[0]?.id ?? null;
  const referenceMeeting = useMemo(
    () => meetings.find((m) => m.id === effectiveReferenceId) ?? null,
    [meetings, effectiveReferenceId],
  );

  // ---- Drawer presentation state ----
  const [drawerCollapsed, setDrawerCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const drawerPanelRef = useRef<ImperativePanelHandle>(null);
  const isMobile = useIsMobile();

  function addMeeting() {
    const title = newMeetingTitle.trim();
    if (!title) {
      toast({ title: "Give the meeting a title", variant: "destructive" });
      return;
    }
    createMeeting.mutate(
      {
        projectId,
        data: {
          title,
          meetingType: newMeetingType,
          focus: newMeetingFocus.trim() || undefined,
          scheduledAt: localInputToIso(newMeetingAt),
        },
      },
      {
        onSuccess: (created) => {
          invalidateMeetings();
          invalidateSummary();
          setNewMeetingTitle("");
          setNewMeetingType("working");
          setNewMeetingFocus("");
          setNewMeetingAt("");
          // Focus the new meeting so the page is immediately about it.
          setSelectedMeetingId(created.id);
          setNewMeetingOpen(false);
          toast({ title: "Meeting added" });
        },
        onError: (err) => fail(err, "Could not add the meeting"),
      },
    );
  }

  // ---- Delete meeting ----
  const [deletingMeeting, setDeletingMeeting] = useState<Meeting | null>(null);
  function confirmDeleteMeeting() {
    if (!deletingMeeting) return;
    deleteMeeting.mutate(
      { id: deletingMeeting.id },
      {
        onSuccess: () => {
          invalidateMeetings();
          invalidateActionItems();
          invalidateDecisions();
          invalidateOpenQuestions();
          invalidateSummary();
          // Drop the selection if the deleted meeting was focused; render-time
          // reconciliation falls back to the default (most recent active) meeting.
          if (deletingMeeting && selectedMeetingId === deletingMeeting.id) {
            setSelectedMeetingId(null);
          }
          setDeletingMeeting(null);
          toast({ title: "Meeting deleted" });
        },
        onError: (err) => fail(err, "Could not delete the meeting"),
      },
    );
  }

  // ---- Mark meeting completed / reopen ----
  function setMeetingStatus(meeting: Meeting, status: "scheduled" | "completed") {
    updateMeeting.mutate(
      { id: meeting.id, data: { status } },
      {
        onSuccess: () => {
          invalidateMeetings();
          toast({ title: status === "completed" ? "Meeting marked completed" : "Meeting reopened" });
        },
        onError: (err) => fail(err, "Could not update the meeting"),
      },
    );
  }

  // ---- New action item form ----
  const [aiTitle, setAiTitle] = useState("");
  const [aiCategory, setAiCategory] = useState("general");
  const [aiOwner, setAiOwner] = useState("");
  const [aiDue, setAiDue] = useState("");

  function addActionItem() {
    const title = aiTitle.trim();
    if (!title) {
      toast({ title: "Describe the action item", variant: "destructive" });
      return;
    }
    createActionItem.mutate(
      {
        projectId,
        data: {
          title,
          category: aiCategory as ActionItem["category"],
          ownerName: aiOwner.trim() || undefined,
          dueAt: dateOnlyToIso(aiDue),
        },
      },
      {
        onSuccess: () => {
          invalidateActionItems();
          invalidateSummary();
          setAiTitle("");
          setAiCategory("general");
          setAiOwner("");
          setAiDue("");
          toast({ title: "Action item added" });
        },
        onError: (err) => fail(err, "Could not add the action item"),
      },
    );
  }

  function toggleActionItem(item: ActionItem, done: boolean) {
    updateActionItem.mutate(
      { id: item.id, data: { status: done ? "done" : "open" } },
      {
        onSuccess: () => {
          invalidateActionItems();
          invalidateSummary();
        },
        onError: (err) => fail(err, "Could not update the action item"),
      },
    );
  }

  const [deletingItem, setDeletingItem] = useState<ActionItem | null>(null);
  function confirmDeleteItem() {
    if (!deletingItem) return;
    deleteActionItem.mutate(
      { id: deletingItem.id },
      {
        onSuccess: () => {
          invalidateActionItems();
          invalidateSummary();
          setDeletingItem(null);
          toast({ title: "Action item deleted" });
        },
        onError: (err) => fail(err, "Could not delete the action item"),
      },
    );
  }

  // ---- New correspondence form ----
  const [coDirection, setCoDirection] = useState("inbound");
  const [coSubject, setCoSubject] = useState("");
  const [coParty, setCoParty] = useState("");
  const [coOccurredAt, setCoOccurredAt] = useState("");
  const [coBody, setCoBody] = useState("");

  function addCorrespondence() {
    const subject = coSubject.trim();
    if (!subject) {
      toast({ title: "Add a subject", variant: "destructive" });
      return;
    }
    createCorrespondence.mutate(
      {
        projectId,
        data: {
          direction: coDirection as Correspondence["direction"],
          subject,
          party: coParty.trim() || undefined,
          body: coBody.trim() || undefined,
          occurredAt: dateOnlyToIso(coOccurredAt),
        },
      },
      {
        onSuccess: () => {
          invalidateCorrespondence();
          setCoDirection("inbound");
          setCoSubject("");
          setCoParty("");
          setCoOccurredAt("");
          setCoBody("");
          toast({ title: "Correspondence logged" });
        },
        onError: (err) => fail(err, "Could not log the correspondence"),
      },
    );
  }

  const [editingCo, setEditingCo] = useState<Correspondence | null>(null);
  const [deletingCo, setDeletingCo] = useState<Correspondence | null>(null);

  function confirmDeleteCorrespondence() {
    if (!deletingCo) return;
    deleteCorrespondence.mutate(
      { id: deletingCo.id },
      {
        onSuccess: () => {
          invalidateCorrespondence();
          setDeletingCo(null);
          toast({ title: "Correspondence deleted" });
        },
        onError: (err) => fail(err, "Could not delete the correspondence"),
      },
    );
  }

  // ---- Promote correspondence to action item ----
  const [promoteFrom, setPromoteFrom] = useState<Correspondence | null>(null);
  const [promoteTitle, setPromoteTitle] = useState("");
  const [promoteOwner, setPromoteOwner] = useState("");
  const [promoteDue, setPromoteDue] = useState("");

  function openPromote(co: Correspondence) {
    setPromoteFrom(co);
    setPromoteTitle(`Follow up: ${co.subject}`.slice(0, 300));
    setPromoteOwner("");
    setPromoteDue("");
  }

  function submitPromote() {
    if (!promoteFrom) return;
    const title = promoteTitle.trim();
    if (!title) {
      toast({ title: "Describe the action item", variant: "destructive" });
      return;
    }
    createActionItem.mutate(
      {
        projectId,
        data: {
          title,
          ownerName: promoteOwner.trim() || undefined,
          dueAt: dateOnlyToIso(promoteDue),
          sourceCorrespondenceId: promoteFrom.id,
        },
      },
      {
        onSuccess: () => {
          invalidateActionItems();
          invalidateSummary();
          setPromoteFrom(null);
          toast({ title: "Action item created from correspondence" });
        },
        onError: (err) => fail(err, "Could not create the action item"),
      },
    );
  }

  const correspondenceById = useMemo(() => {
    const map = new Map<number, Correspondence>();
    for (const c of correspondence) map.set(c.id, c);
    return map;
  }, [correspondence]);

  const openCount = summary?.openActionItems ?? actionItems.filter((a) => a.status === "open").length;

  // ---- Recorder state for split Record/Stop controls ----
  // The Record button sits ABOVE the agenda; Stop sits BELOW the recordings list.
  // MeetingRecordings owns the MediaRecorder lifecycle and notifies us via
  // onControlsReady (stable handles) + onStateChange (re-render triggers).
  const [recorderIsRecording, setRecorderIsRecording] = useState(false);
  const [recorderElapsed, setRecorderElapsed] = useState(0);
  const [recorderHasPending, setRecorderHasPending] = useState(false);
  const recorderControlsRef = useRef<RecorderControlsHandle>({
    start: () => {},
    stop: () => {},
  });

  // The editable workspace for the working meeting. Built once and reused by both
  // the desktop resizable layout and the mobile layout so it mounts a single time.
  const mainPaneNode = selectedMeeting ? (
    <div className="space-y-4">
      {/* Record control -- visible only when idle (not recording and no pending review) */}
      {!recorderIsRecording && !recorderHasPending ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
          <span className="text-sm text-muted-foreground">
            Capture meeting audio to generate the next agenda.
          </span>
          <Button size="sm" onClick={() => recorderControlsRef.current.start()}>
            <Mic className="mr-1 h-4 w-4" aria-hidden="true" /> Record
          </Button>
        </div>
      ) : null}

      <MeetingCard
        key={selectedMeeting.id}
        meeting={selectedMeeting}
        isProcessing={processNotes.isPending}
        isSavingNotes={updateMeeting.isPending}
        onSaveDetails={(data, done) =>
          updateMeeting.mutate(
            { id: selectedMeeting.id, data },
            {
              onSuccess: () => {
                invalidateMeetings();
                invalidateSummary();
                toast({ title: "Meeting updated" });
                done();
              },
              onError: (err) => fail(err, "Could not update the meeting"),
            },
          )
        }
        onGenerate={(nextMeetingType) =>
          processNotes.mutate(
            { id: selectedMeeting.id, data: { nextMeetingType } },
            {
              onSuccess: (res) => {
                invalidateMeetings();
                invalidateActionItems();
                invalidateDecisions();
                invalidateOpenQuestions();
                invalidateSummary();
                toast({
                  title: "Next agenda generated",
                  description: `${res.createdActionItems.length} action item${
                    res.createdActionItems.length === 1 ? "" : "s"
                  }, ${res.createdDecisions.length} decision${
                    res.createdDecisions.length === 1 ? "" : "s"
                  }, ${res.createdOpenQuestions.length} open question${
                    res.createdOpenQuestions.length === 1 ? "" : "s"
                  } captured (${res.provider === "openai" ? "AI" : "rules"}).`,
                });
              },
              onError: (err) => fail(err, "Could not generate the agenda"),
            },
          )
        }
        onDelete={() => setDeletingMeeting(selectedMeeting)}
        onSetStatus={(status) => setMeetingStatus(selectedMeeting, status)}
        onTogglePlan={(section, itemIndex, promptIndex, value) =>
          togglePlan(selectedMeeting.id, section, itemIndex, promptIndex, value)
        }
        onToggleAgenda={(itemIndex, promptIndex, done) =>
          toggleAgenda(selectedMeeting.id, itemIndex, promptIndex, done)
        }
      />
      <MeetingRecordings
        key={`rec-${selectedMeeting.id}`}
        projectId={projectId}
        meeting={{
          id: selectedMeeting.id,
          title: selectedMeeting.title,
          notes: selectedMeeting.notes ?? "",
        }}
        onInsertNotes={(meetingId, notes) =>
          updateMeeting.mutateAsync({ id: meetingId, data: { notes } }).then(() => {
            invalidateMeetings();
            invalidateSummary();
          })
        }
        onControlsReady={(controls) => {
          recorderControlsRef.current = controls;
        }}
        onStateChange={(state) => {
          setRecorderIsRecording(state.isRecording);
          setRecorderElapsed(state.recElapsed);
          setRecorderHasPending(state.hasPending);
        }}
      />

      {/* Stop control -- visible only while recording */}
      {recorderIsRecording ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
          <span className="font-mono text-sm text-foreground">{formatDuration(recorderElapsed)}</span>
          <span className="text-sm text-muted-foreground">Recording in progress</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto border-red-600 text-red-700 hover:bg-red-50"
            onClick={() => recorderControlsRef.current.stop()}
          >
            <Square className="mr-1 h-3.5 w-3.5 fill-current" aria-hidden="true" /> Stop
          </Button>
        </div>
      ) : null}
    </div>
  ) : (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Search className="mb-3 h-8 w-8 text-muted" aria-hidden="true" />
        <p>Select a meeting to open it.</p>
      </CardContent>
    </Card>
  );

  return (
    <ProjectWorkspace subtitle="Run kickoff, working, and final meetings with type-aware agendas. Record audio, transcribe, and generate the next agenda.">
      {() => (
        <Tabs defaultValue="meetings" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-4">
            <TabsTrigger value="meetings">Agendas</TabsTrigger>
            <TabsTrigger value="actions">Action items</TabsTrigger>
            <TabsTrigger value="correspondence">Correspondence</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          {/* ============================ MEETINGS ============================ */}
          <TabsContent value="meetings" className="space-y-4">
            {meetings.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center text-muted-foreground">
                  <CalendarClock className="h-12 w-12 text-muted" aria-hidden="true" />
                  <p>No meetings yet. Schedule one to start the cycle.</p>
                  <Button onClick={() => setNewMeetingOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New meeting
                  </Button>
                </CardContent>
              </Card>
            ) : isMobile ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="sm">
                          <PanelLeftOpen className="mr-2 h-4 w-4" aria-hidden="true" /> Past meetings
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="left" className="w-[88vw] max-w-sm p-0">
                        <SheetHeader className="border-b border-border p-4 text-left">
                          <SheetTitle>Past meetings</SheetTitle>
                        </SheetHeader>
                        <div className="h-[calc(100%-4.5rem)]">
                          <PastMeetingsDrawerContent
                            variant="mobile"
                            meetings={filteredCompleted}
                            totalCompleted={completedMeetings.length}
                            search={meetingSearch}
                            onSearch={setMeetingSearch}
                            selectedId={effectiveReferenceId}
                            onSelect={(id) => setReferenceMeetingId(id)}
                            referenceMeeting={referenceMeeting}
                            referenceDecisions={
                              referenceMeeting ? decisionsByMeeting.get(referenceMeeting.id) ?? [] : []
                            }
                            referenceQuestions={
                              referenceMeeting ? questionsByMeeting.get(referenceMeeting.id) ?? [] : []
                            }
                            referenceActionItems={
                              referenceMeeting
                                ? actionItemsByMeeting.get(referenceMeeting.id) ?? []
                                : []
                            }
                            referenceRecordingCount={
                              referenceMeeting
                                ? recordingCountByMeeting.get(referenceMeeting.id) ?? 0
                                : 0
                            }
                            onOpenInWorkspace={(id) => {
                              setSelectedMeetingId(id);
                              setMobileDrawerOpen(false);
                            }}
                          />
                        </div>
                      </SheetContent>
                    </Sheet>
                    <WorkingMeetingPicker
                      options={workingOptions}
                      value={effectiveMeetingId}
                      onChange={(id) => setSelectedMeetingId(id)}
                    />
                  </div>
                  <Button onClick={() => setNewMeetingOpen(true)} size="sm">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New meeting
                  </Button>
                </div>
                {mainPaneNode}
              </div>
            ) : (
              <ResizablePanelGroup
                direction="horizontal"
                autoSaveId="project-meetings-drawer"
                className="h-[calc(100vh-15rem)] min-h-[34rem] items-stretch"
              >
                <ResizablePanel
                  ref={drawerPanelRef}
                  collapsible
                  collapsedSize={0}
                  defaultSize={30}
                  minSize={22}
                  maxSize={46}
                  onCollapse={() => setDrawerCollapsed(true)}
                  onExpand={() => setDrawerCollapsed(false)}
                  className="min-w-0 rounded-lg border border-border bg-card"
                >
                  <PastMeetingsDrawerContent
                    variant="desktop"
                    meetings={filteredCompleted}
                    totalCompleted={completedMeetings.length}
                    search={meetingSearch}
                    onSearch={setMeetingSearch}
                    selectedId={effectiveReferenceId}
                    onSelect={(id) => setReferenceMeetingId(id)}
                    referenceMeeting={referenceMeeting}
                    referenceDecisions={
                      referenceMeeting ? decisionsByMeeting.get(referenceMeeting.id) ?? [] : []
                    }
                    referenceQuestions={
                      referenceMeeting ? questionsByMeeting.get(referenceMeeting.id) ?? [] : []
                    }
                    referenceActionItems={
                      referenceMeeting ? actionItemsByMeeting.get(referenceMeeting.id) ?? [] : []
                    }
                    referenceRecordingCount={
                      referenceMeeting ? recordingCountByMeeting.get(referenceMeeting.id) ?? 0 : 0
                    }
                    onOpenInWorkspace={(id) => setSelectedMeetingId(id)}
                    onCollapse={() => drawerPanelRef.current?.collapse()}
                  />
                </ResizablePanel>
                <ResizableHandle
                  withHandle
                  aria-label="Resize past meetings drawer"
                  className={drawerCollapsed ? "hidden" : "mx-1"}
                />
                <ResizablePanel minSize={40} className="min-w-0">
                  <div className="h-full overflow-y-auto px-1 pb-2">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {drawerCollapsed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => drawerPanelRef.current?.expand()}
                          >
                            <PanelLeftOpen className="mr-2 h-4 w-4" aria-hidden="true" /> Past meetings
                          </Button>
                        ) : null}
                        <WorkingMeetingPicker
                          options={workingOptions}
                          value={effectiveMeetingId}
                          onChange={(id) => setSelectedMeetingId(id)}
                        />
                      </div>
                      <Button onClick={() => setNewMeetingOpen(true)} size="sm">
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New meeting
                      </Button>
                    </div>
                    {mainPaneNode}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </TabsContent>

          {/* ========================== ACTION ITEMS ========================== */}
          <TabsContent value="actions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" /> Build progress
                </CardTitle>
                <CardDescription>
                  {openCount} open, {summary?.doneActionItems ?? 0} done of {summary?.totalActionItems ?? actionItems.length} total.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Overall</span>
                    <span className="tabular-nums text-muted-foreground">{summary?.buildProgressPercent ?? 0}%</span>
                  </div>
                  <Progress value={summary?.buildProgressPercent ?? 0} aria-label="Overall build progress" />
                </div>
                {summary?.accessibility && summary.accessibility.total > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Accessibility</span>
                      <span className="tabular-nums text-muted-foreground">
                        {summary.accessibility.done}/{summary.accessibility.total}
                      </span>
                    </div>
                    <Progress value={summary.accessibility.percent} aria-label="Accessibility progress" />
                  </div>
                )}
                {summary?.weeks && summary.weeks.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {summary.weeks.map((w) => (
                      <Badge key={w.weekIndex} variant="outline" className="font-normal">
                        {w.label}: {w.done}/{w.total}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add an action item</CardTitle>
                <CardDescription>Track follow-ups from meetings, correspondence, or your own list.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="ai-title">What needs doing?</Label>
                    <Input
                      id="ai-title"
                      value={aiTitle}
                      maxLength={300}
                      onChange={(e) => setAiTitle(e.target.value)}
                      placeholder="Draft module 2 storyboard"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-category">Category</Label>
                    <Select value={aiCategory} onValueChange={setAiCategory}>
                      <SelectTrigger id="ai-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="content">Content</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="accessibility">Accessibility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ai-due">Due (optional)</Label>
                    <Input id="ai-due" type="date" value={aiDue} onChange={(e) => setAiDue(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="ai-owner">Owner (optional)</Label>
                    <Input
                      id="ai-owner"
                      value={aiOwner}
                      maxLength={200}
                      onChange={(e) => setAiOwner(e.target.value)}
                      placeholder="Who owns this?"
                    />
                  </div>
                  <div className="lg:col-span-2 lg:flex lg:items-end">
                    <Button onClick={addActionItem} disabled={createActionItem.isPending} className="w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add action item
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Action items</CardTitle>
                <CardDescription>Check off items as they are completed.</CardDescription>
              </CardHeader>
              <CardContent>
                {actionItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
                    <ListChecks className="mb-4 h-12 w-12 text-muted" aria-hidden="true" />
                    <p>No action items yet. Add one above or generate an agenda from meeting notes.</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {actionItems.map((item) => {
                      const done = item.status === "done";
                      const sourceCo = item.sourceCorrespondenceId
                        ? correspondenceById.get(item.sourceCorrespondenceId)
                        : undefined;
                      return (
                        <li key={item.id} className="flex items-start gap-3 py-3">
                          <Checkbox
                            checked={done}
                            onCheckedChange={(v) => toggleActionItem(item, v === true)}
                            aria-label={done ? `Mark "${item.title}" as open` : `Mark "${item.title}" as done`}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                              {item.title}
                            </div>
                            {item.description && (
                              <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <Badge
                                variant="secondary"
                                className={`shadow-none hover:bg-current/0 ${CATEGORY_STYLES[item.category]}`}
                              >
                                {CATEGORY_LABELS[item.category]}
                              </Badge>
                              {item.ownerName && <span>{item.ownerName}</span>}
                              {item.dueAt && (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" aria-hidden="true" /> Due {fmtDate(item.dueAt)}
                                </span>
                              )}
                              {item.sourceMeetingId && (
                                <span className="inline-flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" aria-hidden="true" /> From meeting
                                </span>
                              )}
                              {sourceCo && (
                                <span className="inline-flex items-center gap-1">
                                  <Link2 className="h-3 w-3" aria-hidden="true" /> From: {sourceCo.subject}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingItem(item)}
                            aria-label={`Delete action item: ${item.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========================= CORRESPONDENCE ========================= */}
          <TabsContent value="correspondence" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" aria-hidden="true" /> Log correspondence
                </CardTitle>
                <CardDescription>
                  Paste emails or notes from calls. Turn anything actionable into an action item that feeds the agenda.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="co-direction">Direction</Label>
                    <Select value={coDirection} onValueChange={setCoDirection}>
                      <SelectTrigger id="co-direction">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inbound">Inbound (received)</SelectItem>
                        <SelectItem value="outbound">Outbound (sent)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="co-subject">Subject</Label>
                    <Input
                      id="co-subject"
                      value={coSubject}
                      maxLength={300}
                      onChange={(e) => setCoSubject(e.target.value)}
                      placeholder="Re: storyboard feedback"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="co-date">Date (optional)</Label>
                    <Input id="co-date" type="date" value={coOccurredAt} onChange={(e) => setCoOccurredAt(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="co-party">From / to (optional)</Label>
                    <Input
                      id="co-party"
                      value={coParty}
                      maxLength={200}
                      onChange={(e) => setCoParty(e.target.value)}
                      placeholder="client@school.edu"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                    <Label htmlFor="co-body">Message (optional)</Label>
                    <Textarea
                      id="co-body"
                      rows={4}
                      maxLength={20000}
                      value={coBody}
                      onChange={(e) => setCoBody(e.target.value)}
                      placeholder="Paste the email or call notes here."
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Button onClick={addCorrespondence} disabled={createCorrespondence.isPending}>
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Log correspondence
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Correspondence log</CardTitle>
                <CardDescription>Newest first.</CardDescription>
              </CardHeader>
              <CardContent>
                {correspondence.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground">
                    <Mail className="mb-4 h-12 w-12 text-muted" aria-hidden="true" />
                    <p>No correspondence logged yet.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {correspondence.map((co) => (
                      <li key={co.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={
                                  co.direction === "inbound"
                                    ? "bg-sky-100 text-sky-800 shadow-none hover:bg-sky-100"
                                    : "bg-emerald-100 text-emerald-800 shadow-none hover:bg-emerald-100"
                                }
                              >
                                {co.direction === "inbound" ? (
                                  <ArrowDownLeft className="mr-1 h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ArrowUpRight className="mr-1 h-3 w-3" aria-hidden="true" />
                                )}
                                {co.direction === "inbound" ? "Inbound" : "Outbound"}
                              </Badge>
                              <span className="font-medium">{co.subject}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                              {co.party && <span>{co.party}</span>}
                              {co.occurredAt && <span>{fmtDate(co.occurredAt)}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" onClick={() => openPromote(co)}>
                              <ListChecks className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Action item
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingCo(co)}
                              aria-label={`Edit correspondence: ${co.subject}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingCo(co)}
                              aria-label={`Delete correspondence: ${co.subject}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                        {co.body && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{co.body}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================ CALENDAR ============================ */}
          <TabsContent value="calendar" className="space-y-6">
            <MeetingCalendar meetings={meetings} actionItems={actionItems} nextMeetingAt={summary?.nextMeetingAt} />
          </TabsContent>

          {/* ---- Dialogs ---- */}
          <AlertDialog open={!!deletingMeeting} onOpenChange={(o) => !o && setDeletingMeeting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the meeting, its plan, notes, and generated agenda. Action items, decisions, and open
                  questions already captured stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteMeeting} disabled={deleteMeeting.isPending}>
                  {deleteMeeting.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={!!deletingItem} onOpenChange={(o) => !o && setDeletingItem(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this action item?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteItem} disabled={deleteActionItem.isPending}>
                  {deleteActionItem.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={!!deletingCo} onOpenChange={(o) => !o && setDeletingCo(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this correspondence?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the logged message. Action items created from it stay.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDeleteCorrespondence} disabled={deleteCorrespondence.isPending}>
                  {deleteCorrespondence.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {editingCo && (
            <CorrespondenceEditDialog
              correspondence={editingCo}
              isSaving={updateCorrespondence.isPending}
              onClose={() => setEditingCo(null)}
              onSave={(data) =>
                updateCorrespondence.mutate(
                  { id: editingCo.id, data },
                  {
                    onSuccess: () => {
                      invalidateCorrespondence();
                      setEditingCo(null);
                      toast({ title: "Correspondence updated" });
                    },
                    onError: (err) => fail(err, "Could not update the correspondence"),
                  },
                )
              }
            />
          )}

          <Dialog open={!!promoteFrom} onOpenChange={(o) => !o && setPromoteFrom(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create action item</DialogTitle>
                <DialogDescription>
                  Linked to "{promoteFrom?.subject}". It will appear on the next generated agenda while open.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="promote-title">Title</Label>
                  <Input
                    id="promote-title"
                    value={promoteTitle}
                    maxLength={300}
                    onChange={(e) => setPromoteTitle(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="promote-owner">Owner (optional)</Label>
                    <Input
                      id="promote-owner"
                      value={promoteOwner}
                      maxLength={200}
                      onChange={(e) => setPromoteOwner(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promote-due">Due (optional)</Label>
                    <Input
                      id="promote-due"
                      type="date"
                      value={promoteDue}
                      onChange={(e) => setPromoteDue(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPromoteFrom(null)}>
                  Cancel
                </Button>
                <Button onClick={submitPromote} disabled={createActionItem.isPending}>
                  {createActionItem.isPending ? "Creating..." : "Create action item"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Schedule a meeting */}
          <Dialog open={newMeetingOpen} onOpenChange={setNewMeetingOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary" aria-hidden="true" /> Schedule a meeting
                </DialogTitle>
                <DialogDescription>
                  Choose a meeting type to seed its pre-work, standing agenda, and definition of done. Capture
                  notes during it, then generate the next agenda.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-title">Title</Label>
                  <Input
                    id="meeting-title"
                    value={newMeetingTitle}
                    maxLength={200}
                    onChange={(e) => setNewMeetingTitle(e.target.value)}
                    placeholder="Weekly check-in"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="meeting-type">Type</Label>
                    <Select value={newMeetingType} onValueChange={(v) => setNewMeetingType(v as MeetingType)}>
                      <SelectTrigger id="meeting-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEETING_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {MEETING_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="meeting-at">Date and time (optional)</Label>
                    <Input
                      id="meeting-at"
                      type="datetime-local"
                      value={newMeetingAt}
                      onChange={(e) => setNewMeetingAt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-focus">Focus (optional)</Label>
                  <Input
                    id="meeting-focus"
                    value={newMeetingFocus}
                    maxLength={200}
                    onChange={(e) => setNewMeetingFocus(e.target.value)}
                    placeholder="What is this meeting mainly about?"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewMeetingOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addMeeting} disabled={createMeeting.isPending}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                  {createMeeting.isPending ? "Adding..." : "Add meeting"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Tabs>
      )}
    </ProjectWorkspace>
  );
}

/* ------------------------------------------------------------------ */
/* Meeting card: a per-meeting workspace                              */
/*   type/status, pre-work, standing agenda, generate next agenda,   */
/*   proposed next agenda, mark completed / reopen                   */
/* ------------------------------------------------------------------ */

/**
 * One agenda-board column. On desktop the three columns sit side by side and are
 * always open. On mobile they stack, so each becomes a tap-to-expand disclosure
 * (with a done/total count visible while collapsed) to cut vertical scrolling.
 */
function BoardColumn({
  label,
  icon: Icon,
  count,
  defaultOpen,
  isMobile,
  className,
  children,
}: {
  label: string;
  icon: LucideIcon;
  count?: ReactNode;
  defaultOpen: boolean;
  isMobile: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  // Re-apply the default open state when the set of visible columns changes
  // (e.g. a proposed agenda is generated after mount), so the mobile board keeps
  // only the most actionable column open. Manual toggles persist because
  // defaultOpen only changes when the column composition itself changes.
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  if (!isMobile) {
    return (
      <section className={className} aria-label={label}>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" /> {label}
          </h4>
          {count != null && (
            <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
          )}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className={className} aria-label={label}>
      <div className="mb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> {label}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
            {count != null && <span>{count}</span>}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </span>
        </button>
      </div>
      <div id={contentId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function MeetingCard({
  meeting,
  isProcessing,
  isSavingNotes,
  onSaveDetails,
  onGenerate,
  onDelete,
  onSetStatus,
  onTogglePlan,
  onToggleAgenda,
}: {
  meeting: Meeting;
  isProcessing: boolean;
  /** Used for the edit-details dialog save button. */
  isSavingNotes: boolean;
  onSaveDetails: (
    data: { title: string; meetingType: MeetingType; focus: string | null; scheduledAt: string | null },
    done: () => void,
  ) => void;
  onGenerate: (nextMeetingType: MeetingType) => void;
  onDelete: () => void;
  onSetStatus: (status: "scheduled" | "completed") => void;
  onTogglePlan: (section: PlanSection, itemIndex: number, promptIndex: number | null, value: boolean) => void;
  onToggleAgenda: (itemIndex: number, promptIndex: number | null, done: boolean) => void;
}) {
  const [editingDetails, setEditingDetails] = useState(false);
  const [editTitle, setEditTitle] = useState(meeting.title);
  const [editType, setEditType] = useState<MeetingType>(
    isMeetingType(meeting.meetingType) ? meeting.meetingType : "working",
  );
  const [editFocus, setEditFocus] = useState(meeting.focus ?? "");
  const [editAt, setEditAt] = useState(toLocalInput(meeting.scheduledAt));

  // Preselect the proposed next type from the current type; the user can override.
  const currentType: MeetingType = isMeetingType(meeting.meetingType) ? meeting.meetingType : "working";
  const [nextType, setNextType] = useState<MeetingType>(suggestNextType(currentType));

  const hasNotes = Boolean(meeting.notes?.trim());
  const completed = meeting.status === "completed";
  const plan = meeting.agendaPlan;
  const agenda = meeting.generatedAgenda ?? null;

  const preworkDone = plan.prework.filter((p) => p.done).length;

  // Proposed next-agenda checklist progress: each prompt is one item; an item with
  // no prompts counts as a single checkable line via its own `done` flag.
  let agendaTotal = 0;
  let agendaDone = 0;
  for (const it of agenda?.items ?? []) {
    if (it.prompts.length > 0) {
      agendaTotal += it.prompts.length;
      agendaDone += it.prompts.filter((_, j) => it.promptsDone?.[j]).length;
    } else {
      agendaTotal += 1;
      if (it.done) agendaDone += 1;
    }
  }

  const hasPrework = plan.prework.length > 0;
  const hasStanding = plan.agenda.length > 0;

  // On mobile the board columns become tap-to-expand sections to cut scrolling.
  // The most actionable column starts open: the proposed next agenda when present,
  // otherwise the standing agenda, otherwise pre-work. Desktop shows them all.
  const isMobile = useIsMobile();
  const hasProposed = Boolean(agenda);
  const proposedDefaultOpen = true;
  const standingDefaultOpen = !hasProposed;
  const preworkDefaultOpen = !hasProposed && !hasStanding;
  const visibleCols = [hasPrework, hasStanding, Boolean(agenda)].filter(Boolean).length;
  const boardCols =
    visibleCols >= 3 ? "lg:grid-cols-3" : visibleCols === 2 ? "lg:grid-cols-2" : "";

  function openEdit() {
    setEditTitle(meeting.title);
    setEditType(isMeetingType(meeting.meetingType) ? meeting.meetingType : "working");
    setEditFocus(meeting.focus ?? "");
    setEditAt(toLocalInput(meeting.scheduledAt));
    setEditingDetails(true);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {meeting.title}
              <Badge
                variant="secondary"
                className={`shadow-none hover:bg-current/0 ${MEETING_TYPE_STYLES[currentType]}`}
              >
                {MEETING_TYPE_LABELS[currentType]}
              </Badge>
              {completed ? (
                <Badge
                  variant="secondary"
                  className="bg-emerald-100 text-emerald-800 shadow-none hover:bg-emerald-100"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" /> Completed
                </Badge>
              ) : (
                <Badge variant="outline" className="font-normal">
                  Scheduled
                </Badge>
              )}
              {meeting.aiProvider && (
                <Badge variant="secondary" className="border-primary/20 bg-primary/10 text-primary shadow-none hover:bg-primary/10">
                  {meeting.aiProvider === "openai" ? "AI agenda" : "Agenda ready"}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {meeting.scheduledAt ? fmtDateTime(meeting.scheduledAt) : "No date set"}
            </CardDescription>
            {meeting.focus && <p className="mt-1 text-sm text-muted-foreground">Focus: {meeting.focus}</p>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={openEdit} aria-label={`Edit meeting: ${meeting.title}`}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete meeting: ${meeting.title}`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action toolbar: meeting status + generate the next agenda */}
        <div className="flex flex-wrap items-end gap-2 border-b pb-4">
          {completed ? (
            <Button size="sm" variant="outline" onClick={() => onSetStatus("scheduled")}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reopen meeting
            </Button>
          ) : (
            <Button size="sm" onClick={() => onSetStatus("completed")}>
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Mark completed
            </Button>
          )}
          <div className="flex w-full flex-wrap items-end gap-2 sm:ml-auto sm:w-auto">
            <div className="space-y-1">
              <Label htmlFor={`next-type-${meeting.id}`} className="text-xs text-muted-foreground">
                Next meeting type
              </Label>
              <Select value={nextType} onValueChange={(v) => setNextType(v as MeetingType)}>
                <SelectTrigger id={`next-type-${meeting.id}`} className="h-9 w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {MEETING_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => onGenerate(nextType)} disabled={isProcessing || !hasNotes}>
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Generate next agenda
            </Button>
          </div>
          {!hasNotes && (
            <span className="w-full text-xs text-muted-foreground">
              Record and transcribe first to generate the next agenda.
            </span>
          )}
        </div>

        {/* Agenda board */}
        {!hasPrework && !hasStanding && !agenda ? (
          <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No agenda items yet. Capture notes during the meeting, then generate the next agenda.
          </div>
        ) : (
        <div className={`grid items-start gap-3 ${boardCols}`}>
        {/* Pre-work column */}
        {plan.prework.length > 0 && (
          <BoardColumn
            label="Pre-work"
            icon={ClipboardList}
            count={`${preworkDone}/${plan.prework.length}`}
            defaultOpen={preworkDefaultOpen}
            isMobile={isMobile}
            className="flex flex-col rounded-xl border bg-muted/30 p-3"
          >
            <ul className="space-y-2">
              {plan.prework.map((item, i) => {
                const id = `prework-${meeting.id}-${i}`;
                return (
                  <li key={i}>
                    <label className="flex items-start gap-2 rounded-md border bg-card p-2.5 text-sm" htmlFor={id}>
                      <Checkbox
                        id={id}
                        checked={item.done}
                        onCheckedChange={(v) => onTogglePlan("prework", i, null, v === true)}
                        className="mt-0.5"
                      />
                      <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.text}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </BoardColumn>
        )}

        {/* Standing agenda column */}
        {plan.agenda.length > 0 && (
          <BoardColumn
            label="Standing agenda"
            icon={FileText}
            defaultOpen={standingDefaultOpen}
            isMobile={isMobile}
            className="flex flex-col rounded-xl border bg-muted/30 p-3"
          >
            <ol className="space-y-2">
              {plan.agenda.map((it, i) => {
                const hasPrompts = it.prompts.length > 0;
                const promptsDone = it.promptsDone ?? [];
                const itemComplete = hasPrompts ? it.prompts.every((_, j) => promptsDone[j]) : Boolean(it.done);
                return (
                  <li key={i} className="rounded-md border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      {hasPrompts ? (
                        <span className={`font-medium ${itemComplete ? "text-muted-foreground line-through" : ""}`}>
                          {it.title}
                        </span>
                      ) : (
                        <label className="flex items-start gap-2" htmlFor={`plan-agenda-${meeting.id}-${i}`}>
                          <Checkbox
                            id={`plan-agenda-${meeting.id}-${i}`}
                            checked={itemComplete}
                            onCheckedChange={(v) => onTogglePlan("agenda", i, null, v === true)}
                            className="mt-0.5"
                          />
                          <span className={`font-medium ${itemComplete ? "text-muted-foreground line-through" : ""}`}>
                            {it.title}
                          </span>
                        </label>
                      )}
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {hasPrompts && (
                          <span>
                            {it.prompts.filter((_, j) => promptsDone[j]).length}/{it.prompts.length}
                          </span>
                        )}
                        <span>{it.minutes} min</span>
                      </span>
                    </div>
                    {hasPrompts && (
                      <ul className="mt-2 space-y-1.5 pl-1">
                        {it.prompts.map((p, j) => {
                          const checked = Boolean(promptsDone[j]);
                          const id = `plan-agenda-${meeting.id}-${i}-${j}`;
                          return (
                            <li key={j}>
                              <label className="flex items-start gap-2 text-sm" htmlFor={id}>
                                <Checkbox
                                  id={id}
                                  checked={checked}
                                  onCheckedChange={(v) => onTogglePlan("agenda", i, j, v === true)}
                                  className="mt-0.5"
                                />
                                <span className={checked ? "text-muted-foreground line-through" : ""}>{p}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </BoardColumn>
        )}

        {/* Proposed next agenda column */}
        {agenda && (
          <BoardColumn
            label="Proposed next agenda"
            icon={FileText}
            defaultOpen={proposedDefaultOpen}
            isMobile={isMobile}
            className="flex flex-col rounded-xl border bg-muted/30 p-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
                {agenda.nextMeetingType && isMeetingType(agenda.nextMeetingType) && (
                  <Badge
                    variant="secondary"
                    className={`shadow-none hover:bg-current/0 ${MEETING_TYPE_STYLES[agenda.nextMeetingType]}`}
                  >
                    {MEETING_TYPE_LABELS[agenda.nextMeetingType]}
                  </Badge>
                )}
                {agenda.proposedDate && (
                  <Badge variant="outline" className="font-normal">
                    {fmtDate(agenda.proposedDate)}
                    {agenda.proposedTime ? ` at ${agenda.proposedTime}` : ""}
                  </Badge>
                )}
                <span>
                  {agenda.openActionCount} open action item{agenda.openActionCount === 1 ? "" : "s"}
                </span>
            </div>
            {agenda.summary.length > 0 && (
              <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {agenda.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {agendaTotal > 0 && (
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Meeting checklist</span>
                  <span>
                    {agendaDone} of {agendaTotal} covered
                  </span>
                </div>
                <Progress
                  value={agendaTotal > 0 ? (agendaDone / agendaTotal) * 100 : 0}
                  aria-label={`Agenda progress: ${agendaDone} of ${agendaTotal} items covered`}
                />
              </div>
            )}
            <ol className="space-y-2">
              {agenda.items.map((it, i) => {
                const hasPrompts = it.prompts.length > 0;
                const promptsDone = it.promptsDone ?? [];
                const itemComplete = hasPrompts ? it.prompts.every((_, j) => promptsDone[j]) : Boolean(it.done);
                return (
                  <li key={i} className="rounded-md border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      {hasPrompts ? (
                        <span className={`font-medium ${itemComplete ? "text-muted-foreground line-through" : ""}`}>
                          {it.title}
                        </span>
                      ) : (
                        <label className="flex items-start gap-2" htmlFor={`agenda-${meeting.id}-${i}`}>
                          <Checkbox
                            id={`agenda-${meeting.id}-${i}`}
                            checked={itemComplete}
                            onCheckedChange={(checked) => onToggleAgenda(i, null, checked === true)}
                            className="mt-0.5"
                          />
                          <span className={`font-medium ${itemComplete ? "text-muted-foreground line-through" : ""}`}>
                            {it.title}
                          </span>
                        </label>
                      )}
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {hasPrompts && (
                          <span>
                            {it.prompts.filter((_, j) => promptsDone[j]).length}/{it.prompts.length}
                          </span>
                        )}
                        <span>{it.minutes} min</span>
                      </span>
                    </div>
                    {hasPrompts && (
                      <ul className="mt-2 space-y-1.5 pl-1">
                        {it.prompts.map((p, j) => {
                          const checked = Boolean(promptsDone[j]);
                          const id = `agenda-${meeting.id}-${i}-${j}`;
                          return (
                            <li key={j}>
                              <label className="flex items-start gap-2 text-sm" htmlFor={id}>
                                <Checkbox
                                  id={id}
                                  checked={checked}
                                  onCheckedChange={(value) => onToggleAgenda(i, j, value === true)}
                                  className="mt-0.5"
                                />
                                <span className={checked ? "text-muted-foreground line-through" : ""}>{p}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
          </BoardColumn>
        )}
        </div>
        )}
      </CardContent>

      <Dialog open={editingDetails} onOpenChange={setEditingDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit meeting</DialogTitle>
            <DialogDescription>
              Update the title, type, focus, or scheduled time. Changing the type does not reset checklist progress.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-title-${meeting.id}`}>Title</Label>
              <Input
                id={`edit-title-${meeting.id}`}
                value={editTitle}
                maxLength={200}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor={`edit-type-${meeting.id}`}>Type</Label>
                <Select value={editType} onValueChange={(v) => setEditType(v as MeetingType)}>
                  <SelectTrigger id={`edit-type-${meeting.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEETING_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {MEETING_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`edit-at-${meeting.id}`}>Date and time</Label>
                <Input
                  id={`edit-at-${meeting.id}`}
                  type="datetime-local"
                  value={editAt}
                  onChange={(e) => setEditAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-focus-${meeting.id}`}>Focus (optional)</Label>
              <Input
                id={`edit-focus-${meeting.id}`}
                value={editFocus}
                maxLength={200}
                onChange={(e) => setEditFocus(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDetails(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const title = editTitle.trim();
                if (!title) return;
                onSaveDetails(
                  {
                    title,
                    meetingType: editType,
                    focus: editFocus.trim() ? editFocus.trim() : null,
                    scheduledAt: localInputToIso(editAt) ?? null,
                  },
                  () => setEditingDetails(false),
                );
              }}
              disabled={isSavingNotes}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Correspondence edit dialog                                          */
/* ------------------------------------------------------------------ */

function CorrespondenceEditDialog({
  correspondence,
  isSaving,
  onClose,
  onSave,
}: {
  correspondence: Correspondence;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: {
    direction: Correspondence["direction"];
    subject: string;
    party: string | null;
    body: string;
    occurredAt: string | null;
  }) => void;
}) {
  const [direction, setDirection] = useState<string>(correspondence.direction);
  const [subject, setSubject] = useState(correspondence.subject);
  const [party, setParty] = useState(correspondence.party ?? "");
  const [occurredAt, setOccurredAt] = useState(toDateOnlyInput(correspondence.occurredAt));
  const [body, setBody] = useState(correspondence.body);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit correspondence</DialogTitle>
          <DialogDescription>Update the details of this logged message.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-co-direction">Direction</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger id="edit-co-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound (received)</SelectItem>
                  <SelectItem value="outbound">Outbound (sent)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-co-date">Date</Label>
              <Input
                id="edit-co-date"
                type="date"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-co-subject">Subject</Label>
            <Input
              id="edit-co-subject"
              value={subject}
              maxLength={300}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-co-party">From / to</Label>
            <Input id="edit-co-party" value={party} maxLength={200} onChange={(e) => setParty(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-co-body">Message</Label>
            <Textarea
              id="edit-co-body"
              rows={5}
              maxLength={20000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const trimmed = subject.trim();
              if (!trimmed) return;
              onSave({
                direction: direction as Correspondence["direction"],
                subject: trimmed,
                party: party.trim() ? party.trim() : null,
                body: body.trim(),
                occurredAt: dateOnlyToIso(occurredAt) ?? null,
              });
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
