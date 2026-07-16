import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { gradebookApi, type GradebookColumn } from "@/lib/gradebookApi";
import { cn } from "@/lib/utils";
import { AlertTriangle, Sparkles, TrendingDown, TrendingUp, Minus, CheckCircle2, Circle, ArrowRight } from "lucide-react";

const pillBand = (band: string) =>
  band === "good" ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
    : band === "warn" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      : band === "low" ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300"
        : "bg-muted text-muted-foreground";

/** Staff drill-in: one learner's full gradebook detail for a course. Read-only. */
export function GradebookLearnerDialog({ courseId, userId, onClose }: { courseId: string; userId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["gb-learner", courseId, userId],
    queryFn: () => gradebookApi.learner(courseId, userId!),
    enabled: !!userId,
  });

  const grouped = useMemo(() => {
    const cols = q.data?.columns ?? [];
    const out: { category: string; cols: GradebookColumn[] }[] = [];
    for (const c of cols) {
      const last = out[out.length - 1];
      if (last && last.category === c.category) last.cols.push(c);
      else out.push({ category: c.category, cols: [c] });
    }
    return out;
  }, [q.data]);

  const d = q.data;
  const name = d?.user ? [d.user.firstName, d.user.lastName].filter(Boolean).join(" ") || d.user.email : "Learner";
  const off = d?.alert.status === "off_track";
  const risk = d?.alert.status === "at_risk";

  return (
    <Dialog open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          {d?.user?.email && <p className="text-sm text-muted-foreground">{d.user.email}</p>}
        </DialogHeader>

        {q.isLoading && <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}

        {d && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-background p-4">
              <div>
                <div className={cn("text-3xl font-bold", d.overallPercent == null ? "text-muted-foreground" : d.overallPercent >= 70 ? "text-green-600" : "text-red-600")}>
                  {d.overallPercent == null ? "—" : `${Math.round(d.overallPercent)}%`}
                </div>
                <div className="text-xs text-muted-foreground">Overall mastery</div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 font-mono text-xs", pillBand(d.band))}>{d.band === "none" ? "no grades" : d.band}</span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {d.trend.dir === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
                {d.trend.dir === "down" && <TrendingDown className="h-4 w-4 text-amber-600" />}
                {d.trend.dir === "flat" && <Minus className="h-4 w-4" />}
                {d.trend.label}
              </div>
            </div>

            {(off || risk) && (
              <div className={cn("flex items-start gap-3 rounded-xl border p-3", off ? "border-red-300 bg-red-50 dark:bg-red-950/20" : "border-amber-300 bg-amber-50 dark:bg-amber-950/20")}>
                <AlertTriangle className={cn("mt-0.5 h-5 w-5 shrink-0", off ? "text-red-600" : "text-amber-600")} />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">{off ? "Off track" : "At risk"}</div>
                  {d.alert.reasonLabels && d.alert.reasonLabels.length > 0 && <div className="text-muted-foreground">{d.alert.reasonLabels.join(" · ")}</div>}
                </div>
              </div>
            )}

            {d.plan && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground"><Sparkles className="h-4 w-4 text-primary" /> Auto study plan</div>
                <p className="mb-2 text-xs text-muted-foreground">{d.plan.rationale}</p>
                <ol className="space-y-1.5">
                  {d.plan.items.map((it, i) => {
                    const href = it.kind === "case" && it.refId ? `/cases/${it.refId}/begin` : it.kind === "activity" && it.refId ? `/activities/${it.refId}/play` : null;
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        {it.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" /> : <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                        <div className="min-w-0 flex-1">
                          <span className={cn("text-foreground", it.done && "line-through opacity-60")}>{it.title}</span>
                          <span className="text-xs text-muted-foreground"> — {it.why}</span>
                        </div>
                        {href && <a href={href} target="_blank" rel="noreferrer" className="shrink-0 text-primary"><ArrowRight className="h-3.5 w-3.5" /></a>}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div className="rounded-xl border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">Grade breakdown</div>
              <div className="divide-y divide-border">
                {grouped.map((g, gi) => (
                  <div key={gi} className="px-3 py-2.5">
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.category}</div>
                    <div className="space-y-1">
                      {g.cols.map((c) => {
                        const cell = d.cells[c.key];
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
                {grouped.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">No graded work yet.</div>}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
