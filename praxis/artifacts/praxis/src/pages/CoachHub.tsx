import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  LifeBuoy, BookOpen, MessageSquare, TrendingUp, ArrowRight, ArrowLeft,
  Sparkles, CheckCircle2, Circle, Target, Layers, Play, GraduationCap, Clock,
} from "lucide-react";

interface Item {
  index: number;
  refType: "case" | "activity" | "module" | null;
  refId: string | null;
  title: string; why: string; category: string | null; done: boolean;
}
interface Plan {
  planId: string; courseId: string | null; courseTitle: string;
  rationale: string; coachUrl: string | null; gaps: string[]; items: Item[];
}
interface RecentSession {
  id: string; moduleId: string | null; moduleTitle: string;
  remedialFocus: string | null; status: string; masteryScore: number | null; createdAt: string | null;
}
interface Overview {
  active: boolean; plans: Plan[]; materialCount: number; gapCount: number; gaps: string[];
  recentSessions: RecentSession[];
}
interface MaterialDetail {
  refType: string; refId: string; title: string; why: string; category: string | null;
  sections: Array<{ heading: string; body: string }>; concepts: string[];
  launch: { type: string; path: string } | null; tutor: { moduleId: string | null; focus: string };
}
interface Progress {
  hasData: boolean;
  concepts: Array<{ moduleId: string; moduleTitle: string; courseId: string | null; mastery: number; reps: number; due: boolean }>;
  gaps: Array<{ category: string; courseId: string | null; courseTitle: string }>;
}

const typeMeta: Record<string, { label: string; icon: any }> = {
  case: { label: "Case study", icon: Layers },
  activity: { label: "Activity", icon: Sparkles },
  module: { label: "Lesson", icon: BookOpen },
  review: { label: "Review", icon: Target },
};

export function CoachHub() {
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState<Item | null>(null);

  const overview = useQuery({ queryKey: ["coach", "overview"], queryFn: () => apiFetch<Overview>("/learn/coach/overview") });
  const progress = useQuery({ queryKey: ["coach", "progress"], queryFn: () => apiFetch<Progress>("/learn/coach/progress") });

  const startSession = useMutation({
    mutationFn: (v: { moduleId: string; remedialFocus?: string | null }) =>
      apiFetch<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });

  const allItems = useMemo(() => (overview.data?.plans ?? []).flatMap((p) => p.items.map((it) => ({ ...it, plan: p }))), [overview.data]);
  const weakestModule = useMemo(() => {
    const c = (progress.data?.concepts ?? []).filter((x) => x.reps > 0).sort((a, b) => a.mastery - b.mastery)[0]
      ?? (progress.data?.concepts ?? [])[0];
    return c ?? null;
  }, [progress.data]);

  // Launch a material the right way: a case/activity opens its own runtime; a module or a
  // ref-less "review" step starts a Socratic session carrying the gap as the remedial focus.
  function launchItem(it: Item) {
    if (it.refType === "case" && it.refId) return navigate(`/cases/${it.refId}/begin`);
    if (it.refType === "activity" && it.refId) return navigate(`/activities/${it.refId}/play`);
    if (it.refType === "module" && it.refId) return startSession.mutate({ moduleId: it.refId, remedialFocus: it.category || it.title });
    if (weakestModule) return startSession.mutate({ moduleId: weakestModule.moduleId, remedialFocus: it.category || it.title });
  }

  if (overview.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-9 w-56" /><Skeleton className="h-40" /></div>;
  }

  const data = overview.data;
  if (!data?.active) {
    return (
      <div className="space-y-5">
        <PageHeader title="Coach" icon={LifeBuoy} subtitle="Your remedial coach — the materials, tutor and progress to bridge your gaps." />
        <div className="rounded-xl border border-border bg-background p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">You're on track — nothing to catch up on</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            When you fall behind in a course, your coach builds a personalised catch-up plan here: the exact materials to review, a tutor to work through them, and your progress as you close the gap.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/grades")}>View my grades</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Coach" icon={LifeBuoy} subtitle="Your remedial coach — the materials, tutor and progress to bridge your gaps." />

      {/* Gap summary */}
      <div className="rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><Target className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Let's bridge {data.gapCount === 1 ? "this gap" : `these ${data.gapCount} gaps`}</p>
            <p className="text-sm text-muted-foreground">
              {data.gaps.length ? <>Focusing on <span className="font-medium text-foreground">{data.gaps.join(", ")}</span>. </> : null}
              {data.materialCount} {data.materialCount === 1 ? "material" : "materials"} in your plan.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="materials">
        <TabsList>
          <TabsTrigger value="materials"><BookOpen className="mr-1.5 h-4 w-4" /> Materials</TabsTrigger>
          <TabsTrigger value="tutor"><MessageSquare className="mr-1.5 h-4 w-4" /> Tutor</TabsTrigger>
          <TabsTrigger value="progress"><TrendingUp className="mr-1.5 h-4 w-4" /> Progress</TabsTrigger>
        </TabsList>

        {/* ── Materials ─────────────────────────────── */}
        <TabsContent value="materials" className="mt-4">
          {selected ? (
            <MaterialReader item={selected} onBack={() => setSelected(null)} onLaunch={launchItem} launching={startSession.isPending} />
          ) : (
            <div className="space-y-3">
              {allItems.map((it) => {
                const meta = typeMeta[it.refType ?? "review"] ?? typeMeta.review;
                const Icon = meta.icon;
                return (
                  <button
                    key={`${it.plan.planId}-${it.index}`}
                    onClick={() => setSelected(it)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40"
                  >
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", it.done ? "bg-green-500/15 text-green-600" : "bg-primary/10 text-primary")}>
                      {it.done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("font-medium text-foreground", it.done && "line-through opacity-60")}>{it.title}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-muted text-muted-foreground">{meta.label}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{it.why}</p>
                      {it.category && <p className="mt-1 text-xs text-amber-600">Targets: {it.category}</p>}
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tutor ─────────────────────────────────── */}
        <TabsContent value="tutor" className="mt-4 space-y-4">
          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-5">
            <div className="mb-1 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground">Work through your gaps with the coach</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              A guided, Socratic session grounded in exactly what you're catching up on. The coach asks, you reason it out, and it checks your understanding as you go.
            </p>
            <Button
              onClick={() => { const first = allItems.find((i) => !i.done) ?? allItems[0]; if (first) launchItem(first); }}
              disabled={startSession.isPending || allItems.length === 0}
            >
              {startSession.isPending ? "Starting…" : "Begin a coaching session"} <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Tutor on a specific material</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {allItems.map((it) => (
                <button
                  key={`t-${it.plan.planId}-${it.index}`}
                  onClick={() => launchItem(it)}
                  disabled={startSession.isPending}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background p-3 text-left text-sm transition hover:border-primary/40 disabled:opacity-60"
                >
                  <Play className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{it.title}</span>
                </button>
              ))}
            </div>
          </div>

          {data.recentSessions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Pick up where you left off</h3>
              <div className="space-y-2">
                {data.recentSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/learn/${s.id}`)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary/40"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{s.moduleTitle}</div>
                      {s.remedialFocus && <div className="truncate text-xs text-muted-foreground">Focus: {s.remedialFocus}</div>}
                    </div>
                    <span className={cn("rounded px-2 py-0.5 text-[10px] uppercase", s.status === "mastered" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>{s.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Progress ──────────────────────────────── */}
        <TabsContent value="progress" className="mt-4 space-y-4">
          {progress.isLoading ? (
            <Skeleton className="h-40" />
          ) : !progress.data?.hasData ? (
            <div className="rounded-xl border border-border bg-background p-10 text-center">
              <TrendingUp className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Your progress will build here</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">As you work through the materials and tutor sessions, your mastery of each concept — and how much of the gap is closed — shows up here.</p>
            </div>
          ) : (
            <>
              {progress.data.gaps.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Areas to close</h3>
                  <div className="flex flex-wrap gap-2">
                    {progress.data.gaps.map((g, i) => (
                      <span key={i} className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                        {g.category} <span className="text-xs opacity-70">· {g.courseTitle}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {progress.data.concepts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">Concept mastery</h3>
                  <div className="space-y-2">
                    {progress.data.concepts.map((c) => {
                      const pct = Math.round(c.mastery * 100);
                      return (
                        <div key={c.moduleId} className="rounded-lg border border-border bg-background p-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm font-medium text-foreground">{c.moduleTitle}</span>
                            <span className="flex items-center gap-2">
                              {c.due && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Due</span>}
                              <span className={cn("font-mono text-xs", pct >= 80 ? "text-green-600" : pct >= 50 ? "text-amber-600" : "text-red-600")}>{pct}%</span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MaterialReader({ item, onBack, onLaunch, launching }: { item: Item; onBack: () => void; onLaunch: (it: Item) => void; launching: boolean }) {
  const detail = useQuery({
    queryKey: ["coach", "material", item.refType, item.refId, item.index],
    queryFn: () => apiFetch<MaterialDetail>(`/learn/coach/material?refType=${item.refType ?? "review"}&refId=${item.refId ?? ""}`),
    enabled: !!item.refId,
  });
  const d = detail.data;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to materials
      </button>
      <div className="rounded-xl border border-border bg-background p-5">
        <h2 className="text-lg font-semibold text-foreground">{d?.title ?? item.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
        {item.category && <p className="mt-1 text-xs text-amber-600">Targets: {item.category}</p>}

        {!item.refId ? (
          <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">This is a coach-led review topic — start a coaching session and work through it together.</p>
        ) : detail.isLoading ? (
          <div className="mt-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>
        ) : (
          <>
            {d?.concepts && d.concepts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {d.concepts.map((c, i) => <span key={i} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">{c}</span>)}
              </div>
            )}
            {(d?.sections ?? []).map((s, i) => (
              <div key={i} className="mt-4">
                <h3 className="text-sm font-semibold text-foreground">{s.heading}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => onLaunch(item)} disabled={launching}>
            {launching ? "Starting…" : d?.launch ? (d.launch.type === "activity" ? "Open activity" : "Start case") : "Start a coaching session"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
