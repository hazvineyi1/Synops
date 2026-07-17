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
  Flame, Zap, Brain, RotateCcw, Check, X, Dumbbell, Trophy,
} from "lucide-react";

interface Gamification { xp: number; streak: number; longestStreak: number }
interface PracticeFlash { id: string; front: string; back: string; hint: string | null; mastery: number; due: boolean }
interface PracticeQuestion {
  id: string; prompt: string; options: string[]; difficulty: string;
  answered: { choice: number; correct: boolean; correctIndex: number; explanation: string | null } | null;
}
interface PracticeMethod { title: string; type: string; path: string }
interface PracticeData {
  setId: string; status: string; category: string; courseTitle: string; learnerName: string; intro: string;
  flashcards: PracticeFlash[]; questions: PracticeQuestion[]; methods: PracticeMethod[]; gamification: Gamification;
}

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
  const [practice, setPractice] = useState<{ planId: string; category: string } | null>(null);

  const overview = useQuery({ queryKey: ["coach", "overview"], queryFn: () => apiFetch<Overview>("/learn/coach/overview") });
  const progress = useQuery({ queryKey: ["coach", "progress"], queryFn: () => apiFetch<Progress>("/learn/coach/progress") });
  const game = useQuery({ queryKey: ["coach", "game"], queryFn: () => apiFetch<Gamification>("/learn/coach/gamification") });

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

  const primaryPlan = data.plans[0];
  if (practice) {
    return (
      <div className="space-y-5">
        <PageHeader title="Coach" icon={LifeBuoy} subtitle="Your remedial coach — practice built from your class to close the gap." />
        <CoachPractice planId={practice.planId} category={practice.category} onBack={() => { setPractice(null); game.refetch(); }} onNavigate={navigate} onGame={() => game.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Coach" icon={LifeBuoy} subtitle="Your remedial coach — the materials, tutor and progress to bridge your gaps." />

      {/* Gap summary + gamification + practice CTA */}
      <div className="rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><Target className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Let's bridge {data.gapCount === 1 ? "this gap" : `these ${data.gapCount} gaps`}</p>
              <p className="text-sm text-muted-foreground">
                {data.gaps.length ? <>Focusing on <span className="font-medium text-foreground">{data.gaps.join(", ")}</span>. </> : null}
                {data.materialCount} {data.materialCount === 1 ? "material" : "materials"} in your plan.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg bg-background/70 px-3 py-1.5 text-sm">
              <span className="flex items-center gap-1 font-medium text-amber-600" title="Points earned"><Zap className="h-4 w-4" /> {game.data?.xp ?? 0}</span>
              <span className="flex items-center gap-1 font-medium text-orange-600" title="Day streak"><Flame className="h-4 w-4" /> {game.data?.streak ?? 0}</span>
            </div>
            {primaryPlan && data.gaps[0] && (
              <Button onClick={() => setPractice({ planId: primaryPlan.planId, category: data.gaps[0] })}>
                <Dumbbell className="mr-1.5 h-4 w-4" /> Practice
              </Button>
            )}
          </div>
        </div>
        {data.gaps.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2 pl-12">
            {data.gaps.map((g) => {
              const pl = data.plans.find((p) => p.gaps.includes(g)) ?? primaryPlan;
              return (
                <button key={g} onClick={() => pl && setPractice({ planId: pl.planId, category: g })}
                  className="rounded-full border border-amber-300/60 bg-background px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300">
                  Practice: {g}
                </button>
              );
            })}
          </div>
        )}
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
            <MaterialReader
              item={selected}
              onBack={() => setSelected(null)}
              onLaunch={launchItem}
              launching={startSession.isPending}
              onPractice={selected.category ? () => setPractice({ planId: (selected as any).plan?.planId ?? primaryPlan?.planId, category: selected.category! }) : undefined}
            />
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

function MaterialReader({ item, onBack, onLaunch, launching, onPractice }: { item: Item; onBack: () => void; onLaunch: (it: Item) => void; launching: boolean; onPractice?: () => void }) {
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
          {onPractice && (
            <Button onClick={onPractice}>
              <Dumbbell className="mr-1.5 h-4 w-4" /> Practice this gap
            </Button>
          )}
          <Button variant={onPractice ? "outline" : "default"} onClick={() => onLaunch(item)} disabled={launching}>
            {launching ? "Starting…" : d?.launch ? (d.launch.type === "activity" ? "Open activity" : "Start case") : "Start a coaching session"}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const GRADES = [
  { grade: 0, label: "Again", cls: "border-red-300 text-red-700 hover:bg-red-50" },
  { grade: 1, label: "Hard", cls: "border-amber-300 text-amber-700 hover:bg-amber-50" },
  { grade: 2, label: "Good", cls: "border-emerald-300 text-emerald-700 hover:bg-emerald-50" },
  { grade: 3, label: "Easy", cls: "border-green-400 text-green-700 hover:bg-green-50" },
];

function CoachPractice({ planId, category, onBack, onNavigate, onGame }: { planId: string; category: string; onBack: () => void; onNavigate: (path: string) => void; onGame: () => void }) {
  const q = useQuery({
    queryKey: ["coach", "practice", planId, category],
    queryFn: () => apiFetch<PracticeData>(`/learn/coach/practice?planId=${encodeURIComponent(planId)}&category=${encodeURIComponent(category)}`),
  });
  const [mode, setMode] = useState<"flashcards" | "quiz" | "methods">("flashcards");
  const [game, setGame] = useState<Gamification | null>(null);
  const [fIdx, setFIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<{ correct: boolean; correctIndex: number; explanation: string | null } | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const review = useMutation({
    mutationFn: (v: { id: string; grade: number }) =>
      apiFetch<{ gamification: Gamification }>(`/learn/coach/flashcard/${v.id}/review`, { method: "POST", body: JSON.stringify({ grade: v.grade }) }),
    onSuccess: (r) => { setGame(r.gamification); onGame(); },
  });
  const answer = useMutation({
    mutationFn: (v: { id: string; choice: number }) =>
      apiFetch<{ correct: boolean; correctIndex: number; explanation: string | null; gamification: Gamification }>(`/learn/coach/question/${v.id}/answer`, { method: "POST", body: JSON.stringify({ choice: v.choice }) }),
    onSuccess: (r) => { setRevealed({ correct: r.correct, correctIndex: r.correctIndex, explanation: r.explanation }); setGame(r.gamification); onGame(); if (r.correct) setCorrectCount((c) => c + 1); },
  });

  if (q.isLoading) return <Skeleton className="h-64" />;
  const d = q.data;
  if (!d) return null;
  const g = game ?? d.gamification;
  const cards = d.flashcards;
  const questions = d.questions;

  function rate(grade: number) {
    const card = cards[fIdx];
    if (card) review.mutate({ id: card.id, grade });
    setFlipped(false);
    setFIdx((i) => i + 1);
  }
  function submitAnswer() {
    if (choice == null) return;
    const question = questions[qIdx];
    if (question) answer.mutate({ id: question.id, choice });
  }
  function nextQuestion() {
    setChoice(null);
    setRevealed(null);
    setQIdx((i) => i + 1);
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to coach
      </button>

      {/* Personalised header + gamification */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Dumbbell className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold text-foreground">Practice: {d.category}</h2>
              <p className="text-sm text-muted-foreground">{d.intro}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-lg bg-background/70 px-3 py-1.5 text-sm">
            <span className="flex items-center gap-1 font-medium text-amber-600"><Zap className="h-4 w-4" /> {g.xp} XP</span>
            <span className="flex items-center gap-1 font-medium text-orange-600"><Flame className="h-4 w-4" /> {g.streak}</span>
          </div>
        </div>
      </div>

      {/* Mode switch */}
      <div className="flex flex-wrap gap-2">
        <ModeBtn active={mode === "flashcards"} onClick={() => setMode("flashcards")} icon={Brain} label={`Flashcards (${cards.length})`} />
        <ModeBtn active={mode === "quiz"} onClick={() => setMode("quiz")} icon={CheckCircle2} label={`Knowledge check (${questions.length})`} />
        <ModeBtn active={mode === "methods"} onClick={() => setMode("methods")} icon={Layers} label="More ways" />
      </div>

      {/* Flashcards */}
      {mode === "flashcards" && (
        cards.length === 0 ? (
          <Empty text="No flashcards for this gap yet — try the Knowledge check or work through it with your coach." />
        ) : fIdx >= cards.length ? (
          <Done text={`Nice work, ${d.learnerName}! You've been through all ${cards.length} cards.`} onRestart={() => { setFIdx(0); setFlipped(false); }} />
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Card {fIdx + 1} of {cards.length}</span>
              <span>Tap the card to flip</span>
            </div>
            <button
              onClick={() => setFlipped((f) => !f)}
              className="flex min-h-[180px] w-full flex-col items-center justify-center rounded-2xl border-2 border-border bg-background p-6 text-center transition hover:border-primary/40"
            >
              {!flipped ? (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Question</span>
                  <p className="mt-2 text-lg font-medium text-foreground">{cards[fIdx].front}</p>
                  {cards[fIdx].hint && <p className="mt-3 text-xs text-muted-foreground">Hint: {cards[fIdx].hint}</p>}
                </>
              ) : (
                <>
                  <span className="text-[11px] uppercase tracking-wide text-primary">Answer</span>
                  <p className="mt-2 text-base text-foreground">{cards[fIdx].back}</p>
                </>
              )}
            </button>
            {flipped && (
              <div className="mt-3">
                <p className="mb-2 text-center text-xs text-muted-foreground">How well did you know it?</p>
                <div className="grid grid-cols-4 gap-2">
                  {GRADES.map((gr) => (
                    <button key={gr.grade} onClick={() => rate(gr.grade)} disabled={review.isPending}
                      className={cn("rounded-lg border py-2 text-sm font-medium transition disabled:opacity-60", gr.cls)}>
                      {gr.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Quiz */}
      {mode === "quiz" && (
        questions.length === 0 ? (
          <Empty text="No knowledge questions for this gap yet — try the Flashcards or your coach." />
        ) : qIdx >= questions.length ? (
          <Done text={`Done, ${d.learnerName}! You got ${correctCount} of ${questions.length} right. Every attempt builds mastery.`} onRestart={() => { setQIdx(0); setChoice(null); setRevealed(null); setCorrectCount(0); }} />
        ) : (
          <div className="rounded-xl border border-border bg-background p-5">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Question {qIdx + 1} of {questions.length}</span>
              <span className="uppercase">{questions[qIdx].difficulty}</span>
            </div>
            <p className="mb-4 font-medium text-foreground">{questions[qIdx].prompt}</p>
            <div className="space-y-2">
              {questions[qIdx].options.map((opt, i) => {
                const isChosen = choice === i;
                const isCorrect = revealed && i === revealed.correctIndex;
                const isWrongChosen = revealed && isChosen && i !== revealed.correctIndex;
                return (
                  <button key={i} disabled={!!revealed} onClick={() => setChoice(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border p-3 text-left text-sm transition",
                      isCorrect ? "border-green-400 bg-green-50 dark:bg-green-950/20" :
                      isWrongChosen ? "border-red-400 bg-red-50 dark:bg-red-950/20" :
                      isChosen ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}>
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]", isCorrect ? "border-green-500 text-green-600" : isWrongChosen ? "border-red-500 text-red-600" : "border-muted-foreground text-muted-foreground")}>
                      {isCorrect ? <Check className="h-3 w-3" /> : isWrongChosen ? <X className="h-3 w-3" /> : String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-foreground">{opt}</span>
                  </button>
                );
              })}
            </div>
            {revealed ? (
              <div className="mt-4">
                <p className={cn("text-sm font-medium", revealed.correct ? "text-green-600" : "text-red-600")}>
                  {revealed.correct ? "Correct!" : "Not quite."}
                </p>
                {revealed.explanation && <p className="mt-1 text-sm text-muted-foreground">{revealed.explanation}</p>}
                <Button className="mt-3" onClick={nextQuestion}>Next <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              </div>
            ) : (
              <Button className="mt-4" onClick={submitAnswer} disabled={choice == null || answer.isPending}>Check answer</Button>
            )}
          </div>
        )
      )}

      {/* Methods */}
      {mode === "methods" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Other ways to close this gap:</p>
          {d.methods.map((m, i) => (
            <button key={i} onClick={() => onNavigate(m.path)}
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-4 text-left transition hover:border-primary/40">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {m.type === "case" ? <Layers className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{m.title}</div>
                <div className="text-xs text-muted-foreground">{m.type === "case" ? "Case study" : "Interactive activity"}</div>
              </div>
              <Play className="h-4 w-4 text-primary" />
            </button>
          ))}
          {d.methods.length === 0 && <Empty text="No extra activities matched this gap — your flashcards, quiz and coach have you covered." />}
        </div>
      )}
    </div>
  );
}

function ModeBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-border bg-background p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function Done({ text, onRestart }: { text: string; onRestart: () => void }) {
  return (
    <div className="rounded-xl border border-green-300/60 bg-green-50/50 p-8 text-center dark:bg-green-950/10">
      <Trophy className="mx-auto mb-3 h-9 w-9 text-green-600" />
      <p className="font-medium text-foreground">{text}</p>
      <Button className="mt-4" variant="outline" onClick={onRestart}><RotateCcw className="mr-1.5 h-4 w-4" /> Go again</Button>
    </div>
  );
}
