import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gradebookApi, type GradebookColumn, type MeGradebook } from "@/lib/gradebookApi";
import { apiFetch } from "@/lib/api";
import { CoachThread } from "@/components/CoachThread";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Sparkles, TrendingDown, TrendingUp, Minus, MessageSquare } from "lucide-react";

interface MyIntervention { alertId: string; courseId: string; courseTitle: string; status: string }

const pillBand = (band: string) =>
  band === "good"
    ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
    : band === "warn"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      : band === "low"
        ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        : "bg-muted text-muted-foreground";

export function MyGrades() {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState<string>("");

  const mine = useQuery({ queryKey: ["gb-mine"], queryFn: () => gradebookApi.mine() });
  useEffect(() => {
    if (!courseId && mine.data?.courses.length) setCourseId(mine.data.courses[0].courseId);
  }, [mine.data, courseId]);

  const me = useQuery({
    queryKey: ["gb-me", courseId],
    queryFn: () => gradebookApi.me(courseId),
    enabled: !!courseId,
  });

  const interventions = useQuery<MyIntervention[]>({ queryKey: ["my-interventions"], queryFn: () => apiFetch<MyIntervention[]>("/my/interventions") });
  const myAlert = interventions.data?.find((i) => i.courseId === courseId);

  const markItem = useMutation({
    mutationFn: (v: { planId: string; index: number; done: boolean }) => gradebookApi.markPlanItem(v.planId, v.index, v.done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gb-me", courseId] }),
  });

  const grouped = useMemo(() => {
    const cols = me.data?.columns ?? [];
    const out: { category: string; cols: GradebookColumn[] }[] = [];
    for (const c of cols) {
      const last = out[out.length - 1];
      if (last && last.category === c.category) last.cols.push(c);
      else out.push({ category: c.category, cols: [c] });
    }
    return out;
  }, [me.data]);

  if (mine.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>;

  const courses = mine.data?.courses ?? [];
  if (courses.length === 0) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">My grades</h1>
        <p className="text-muted-foreground">You're not enrolled in any courses yet. Your grades and progress will appear here once you are.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My grades &amp; progress</h1>
        <p className="text-sm text-muted-foreground">Your mastery across every assignment, case and activity — and a plan when you need one.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {courses.map((c) => (
          <button
            key={c.courseId}
            onClick={() => setCourseId(c.courseId)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
              courseId === c.courseId ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
            )}
          >
            <span className="font-medium text-foreground">{c.courseTitle}</span>
            <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", pillBand(c.band))}>
              {c.overallPercent == null ? "—" : `${Math.round(c.overallPercent)}%`}
            </span>
            {c.alertStatus === "off_track" && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
          </button>
        ))}
      </div>

      {me.isLoading && <Skeleton className="h-56" />}

      {me.data && (
        <div className="space-y-5">
          <OverviewBar me={me.data} />

          {me.data.plan && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">Your personalised study plan</h2>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{me.data.plan.rationale}</p>
              <ol className="space-y-2">
                {me.data.plan.items.map((it, idx) => {
                  const href = it.kind === "case" && it.refId ? `/cases/${it.refId}/begin` : it.kind === "activity" && it.refId ? `/activities/${it.refId}/play` : null;
                  return (
                    <li key={idx} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                      <button
                        onClick={() => me.data!.plan && markItem.mutate({ planId: me.data!.plan.id, index: idx, done: !it.done })}
                        className="mt-0.5 shrink-0"
                        title={it.done ? "Mark not done" : "Mark done"}
                      >
                        {it.done ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={cn("font-medium text-foreground", it.done && "line-through opacity-60")}>{it.title}</div>
                        <div className="text-xs text-muted-foreground">{it.why}</div>
                      </div>
                      {href && (
                        <a href={href}>
                          <Button size="sm" variant="outline" className="gap-1">Start <ArrowRight className="h-3.5 w-3.5" /></Button>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {myAlert && (
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">Message your coach</h2>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">Your coach is here to help. Ask a question or let them know how you're getting on — they'll get a notification.</p>
              <CoachThread alertId={myAlert.alertId} />
            </div>
          )}

          {/* Grade breakdown */}
          <div className="rounded-xl border border-border bg-background">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">Grade breakdown</div>
            <div className="divide-y divide-border">
              {grouped.map((g, gi) => (
                <div key={gi} className="px-4 py-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.category}</div>
                  <div className="space-y-1.5">
                    {g.cols.map((c) => {
                      const cell = me.data!.cells[c.key];
                      const f = cell?.fraction ?? null;
                      return (
                        <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 text-foreground">
                            {c.title}
                            <span className={cn("rounded px-1 py-px text-[10px] uppercase", c.itemType === "formative" ? "bg-muted text-muted-foreground" : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300")}>
                              {c.itemType === "formative" ? "Practice" : "Graded"}
                            </span>
                          </span>
                          <span className="flex items-center gap-3">
                            {cell?.note && <span className="max-w-[220px] truncate text-xs italic text-muted-foreground" title={cell.note}>“{cell.note}”</span>}
                            <span className={cn("rounded px-2 py-0.5 font-mono text-xs", f == null ? "bg-muted text-muted-foreground" : f >= 0.9 ? "bg-green-50 text-green-700" : f >= 0.7 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700")}>
                              {f == null ? "—" : `${Math.round(f * c.pointsPossible)}/${c.pointsPossible}`}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {grouped.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">No graded work yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewBar({ me }: { me: MeGradebook }) {
  const off = me.alert.status === "off_track";
  const risk = me.alert.status === "at_risk";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-background p-4">
        <div>
          <div className={cn("text-3xl font-bold", me.overallPercent == null ? "text-muted-foreground" : me.overallPercent >= 70 ? "text-green-600" : "text-red-600")}>
            {me.overallPercent == null ? "—" : `${Math.round(me.overallPercent)}%`}
          </div>
          <div className="text-xs text-muted-foreground">Overall mastery</div>
        </div>
        {me.letterGrade && (
          <div>
            <div className="text-3xl font-bold text-foreground">{me.letterGrade}</div>
            <div className="text-xs text-muted-foreground">Grade</div>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm">
          {me.trend.dir === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
          {me.trend.dir === "down" && <TrendingDown className="h-4 w-4 text-amber-600" />}
          {me.trend.dir === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
          <span className="text-muted-foreground">{me.trend.label}</span>
        </div>
      </div>

      {(off || risk) && (
        <div className={cn("flex items-start gap-3 rounded-xl border p-4", off ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20")}>
          <AlertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", off ? "text-red-600" : "text-amber-600")} />
          <div className="text-sm">
            <div className="font-semibold text-foreground">{off ? "You've fallen a little behind — let's fix that." : "You're close to the line — a little push will help."}</div>
            {me.alert.reasonLabels && me.alert.reasonLabels.length > 0 && (
              <div className="text-muted-foreground">{me.alert.reasonLabels.join(" · ")}</div>
            )}
            {me.plan && <div className="mt-1 text-muted-foreground">Your study plan below is built to get you back on track.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
