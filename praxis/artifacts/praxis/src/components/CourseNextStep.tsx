import React from "react";
import {
  Play,
  RefreshCw,
  FileText,
  MessagesSquare,
  Clock,
  BarChart3,
  ChevronDown,
  ArrowRight,
  Sliders,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cognitively-optimized "what to do next" view for a learner in a course.
 *
 * Built to the load-management brief: ONE primary action, a low-weight retrieval nudge,
 * everything else behind explicit progressive disclosure, a functional (not decorative)
 * colour system, and progress with a qualitative label. A Focus/Full-view density toggle
 * lets the learner choose how much interface they see.
 *
 * NOT built here (deliberately): the behavioural learner-model + multi-armed-bandit
 * threshold tuning (brief Section 7). Those are backend/data-science. This component is
 * structured to *receive* a density signal (the `defaultDensity` prop) once that model
 * exists; today it defaults to Focus and is user-overridable, which the brief allows.
 *
 * FUNCTIONAL COLOUR MAP (brief Section 4) — every hue has exactly one job:
 *   teal   = current step / progress
 *   coral  = action needed now (quiz / assessment)
 *   purple = reading / static content
 *   blue   = social / discussion
 *   amber  = time-sensitive but not urgent (pending feedback, upcoming due date)
 *   gray   = structural / neutral (locked, preview, checkpoints)
 *   red    = genuine problem only (already past due)
 */

interface ModuleProgress {
  moduleId: string;
  title: string;
  order: number;
  viewedBeats: number;
  totalBeats: number;
  percent: number;
  complete: boolean;
}
interface CourseProgress {
  percent: number;
  totalBeats: number;
  modules: ModuleProgress[];
}
interface ModuleMeta {
  id: string;
  title: string;
  order: number;
  estimatedMinutes: number;
  beatCount: number;
}
interface AssignmentLite {
  id: string;
  title: string;
  dueDate?: string | null;
  submissionType?: string;
}
interface DiscussionLite {
  id: string;
  title: string;
  replyCount?: number;
}

type Density = "focus" | "full";

const DENSITY_KEY = "praxis_density";

function readDensity(fallback: Density): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "focus" || v === "full") return v;
  } catch { /* ignore */ }
  return fallback;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return "overdue";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days <= 6) return `due ${d.toLocaleDateString(undefined, { weekday: "short" })}`;
  return `due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// One row in the progressive-disclosure list. Flat, low weight (brief 3.3).
interface ExtraItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string; // text+bg utility classes for the functional colour
  title: string;
  meta: string;
  metaTone?: string;
  onClick: () => void;
}

export function CourseNextStep({
  courseTitle,
  progress,
  modules,
  assignments,
  discussions,
  defaultDensity = "focus",
  onOpenModule,
  onStartRecall,
  onOpenAssignment,
  onOpenDiscussions,
}: {
  courseTitle: string;
  progress?: CourseProgress;
  modules?: ModuleMeta[];
  assignments?: AssignmentLite[];
  discussions?: DiscussionLite[];
  defaultDensity?: Density;
  onOpenModule: (moduleId: string) => void;
  onStartRecall: (moduleId: string) => void;
  onOpenAssignment: (assignmentId: string) => void;
  onOpenDiscussions: () => void;
}) {
  const [density, setDensity] = React.useState<Density>(() => readDensity(defaultDensity));
  const [expanded, setExpanded] = React.useState(false);

  const setDensityPersist = (d: Density) => {
    setDensity(d);
    try { localStorage.setItem(DENSITY_KEY, d); } catch { /* ignore */ }
  };

  // Follow the behavioural model's recommendation when it arrives (it loads async), but
  // ONLY if the learner has not explicitly chosen a density. An explicit choice is
  // persisted and always wins — the layout never flips under someone who set it.
  React.useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY)) return;
    } catch { /* ignore */ }
    setDensity(defaultDensity);
  }, [defaultDensity]);

  // Ordered modules from progress; fall back to the catalog module list.
  const ordered = (progress?.modules ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);
  const metaById = new Map((modules ?? []).map((m) => [m.id, m]));

  const totalSteps = ordered.length || modules?.length || 0;
  const currentIndex = ordered.findIndex((m) => !m.complete);
  const current = currentIndex >= 0 ? ordered[currentIndex] : undefined;
  const completed = ordered.filter((m) => m.complete);
  const recallModule = completed[completed.length - 1]; // most recently finished

  const pct = progress?.percent ?? 0;
  const paceLabel = pct >= 100 ? "complete" : pct >= 60 ? "on pace" : pct > 0 ? "keep going" : "just getting started";

  // Build the progressive-disclosure list from REAL course items, colour-coded by function.
  const extras: ExtraItem[] = [];
  (assignments ?? [])
    .filter((a) => a.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 3)
    .forEach((a) => {
      const overdue = new Date(a.dueDate!).getTime() < Date.now();
      const isQuiz = a.submissionType === "quiz";
      extras.push({
        id: a.id,
        icon: isQuiz ? BarChart3 : FileText,
        // coral = action needed (quiz); purple = reading/static; amber for a plain due date.
        tone: isQuiz ? "text-orange-500 bg-orange-500/10" : "text-violet-600 bg-violet-500/10",
        title: a.title,
        meta: shortDate(a.dueDate!),
        metaTone: overdue ? "text-red-600" : "text-amber-600",
        onClick: () => onOpenAssignment(a.id),
      });
    });
  (discussions ?? []).slice(0, 1).forEach((d) => {
    extras.push({
      id: d.id,
      icon: MessagesSquare,
      tone: "text-blue-600 bg-blue-500/10", // blue = social
      title: d.title,
      meta: `${d.replyCount ?? 0} repl${(d.replyCount ?? 0) === 1 ? "y" : "ies"}`,
      onClick: onOpenDiscussions,
    });
  });
  // A gentle "what's next after this" preview — structural, so gray.
  const previewNext = ordered[currentIndex + 1];
  if (previewNext) {
    extras.push({
      id: previewNext.moduleId,
      icon: Clock,
      tone: "text-slate-500 bg-slate-500/10", // gray = structural
      title: previewNext.title,
      meta: "up next",
      onClick: () => onOpenModule(previewNext.moduleId),
    });
  }

  return (
    <div className="max-w-2xl">
      {/* Density control — user-overridable (brief 3.4). Low emphasis. */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-muted-foreground truncate flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5" /> {courseTitle}
        </h2>
        <div className="flex items-center rounded-lg border border-border p-0.5 text-xs">
          {(["focus", "full"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensityPersist(d)}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium capitalize transition-colors",
                density === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d === "full" ? "Full view" : "Focus"}
            </button>
          ))}
        </div>
      </div>

      {/* PRIMARY ACTION CARD — exactly one action, teal, step counter (brief 3.1). */}
      {current ? (
        <Card className="p-6 border-teal-500/30 bg-teal-500/[0.06]">
          <div className="text-xs font-semibold uppercase tracking-wider text-teal-700 mb-1.5">
            Step {currentIndex + 1} of {totalSteps} · recommended next
          </div>
          <h1 className="text-2xl font-serif font-bold tracking-tight text-foreground">{current.title}</h1>
          <p className="text-teal-700/80 mt-1 mb-5">
            {metaById.get(current.moduleId)?.estimatedMinutes
              ? `About ${metaById.get(current.moduleId)!.estimatedMinutes} minutes.`
              : "Pick up where you left off."}
            {density === "focus" && " Other items are hidden until this is done."}
          </p>
          <Button
            className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white text-base"
            onClick={() => onOpenModule(current.moduleId)}
          >
            <Play className="h-4 w-4 mr-2" /> Start this step
          </Button>
        </Card>
      ) : (
        <Card className="p-6 border-teal-500/30 bg-teal-500/[0.06] text-center">
          <div className="text-2xl mb-1">🎉</div>
          <h1 className="text-xl font-serif font-bold">You've finished every step</h1>
          <p className="text-muted-foreground mt-1">Revisit a module any time to keep it sharp.</p>
        </Card>
      )}

      {/* RETRIEVAL NUDGE — low weight, one prior concept, quick (brief 3.2). Only shown
          when there's a real completed module to recall; never fabricated. */}
      {recallModule && (
        <button
          onClick={() => onStartRecall(recallModule.moduleId)}
          className="w-full mt-3 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <div className="h-9 w-9 shrink-0 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
            <RefreshCw className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Quick recall: {recallModule.title}</div>
            <div className="text-xs text-muted-foreground">Under a minute</div>
          </div>
          <span className="text-xs font-medium text-muted-foreground border border-border rounded-md px-2.5 py-1">Try it</span>
        </button>
      )}

      {/* PROGRESSIVE DISCLOSURE — hidden entirely in Focus; a "Show N" toggle in Full
          (brief 3.3). Flat rows, lower weight than the primary card. */}
      {density === "full" && extras.length > 0 && (
        <div className="mt-4">
          <div className="flex justify-center">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-1.5 flex items-center gap-1.5"
            >
              {expanded ? "Hide extra items" : `Show ${extras.length} more item${extras.length === 1 ? "" : "s"}`}
              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
          {expanded && (
            <div className="mt-3 space-y-2">
              {extras.map((it) => (
                <button
                  key={it.id}
                  onClick={it.onClick}
                  className="w-full flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className={cn("h-8 w-8 shrink-0 rounded-lg flex items-center justify-center", it.tone)}>
                    <it.icon className="h-4 w-4" />
                  </div>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium">{it.title}</span>
                  <span className={cn("text-xs shrink-0", it.metaTone ?? "text-muted-foreground")}>{it.meta}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PROGRESS — persistent, single bar + qualitative label, never a bare % (brief 3.5). */}
      <div className="mt-6 flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-teal-600" : "bg-teal-500")}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Course progress"
          />
        </div>
        <span className="text-sm text-muted-foreground shrink-0 tabular-nums">
          {pct}% · {paceLabel}
        </span>
      </div>
    </div>
  );
}
