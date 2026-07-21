import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCoachProfile, useUpdateCoachProfile, useWhatsappStatus } from "@/lib/coachApi";
import { cn } from "@/lib/utils";
import {
  LifeBuoy, BookOpen, MessageSquare, TrendingUp, ArrowRight, ArrowLeft,
  Sparkles, CheckCircle2, Circle, Target, Layers, Play, GraduationCap, Clock,
  Flame, Zap, Brain, RotateCcw, Check, X, Dumbbell, Trophy,
  Upload, Link2, FileText, Plus, Loader2, Music, Video,
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
  active: boolean; learnerName: string | null; plans: Plan[]; materialCount: number; gapCount: number; gaps: string[];
  recentSessions: RecentSession[]; tutorModuleId: string | null;
}
interface UploadMaterial { setId: string; title: string; status: string; createdAt: string | null }
type PracticeTarget = { kind: "gap"; planId: string; category: string } | { kind: "set"; setId: string };
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
  const [practice, setPractice] = useState<PracticeTarget | null>(null);
  const [section, setSection] = useState<"materials" | "progress" | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const showSection = (s: "materials" | "progress") => { setSection(s); setSelected(null); setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  // First-visit onboarding: explain how the four paths interlock, shown once per browser.
  const [showIntro, setShowIntro] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem("coach-intro-seen")) setShowIntro(true); } catch { /* ignore */ } }, []);
  const dismissIntro = () => { setShowIntro(false); try { localStorage.setItem("coach-intro-seen", "1"); } catch { /* ignore */ } };

  const overview = useQuery({ queryKey: ["coach", "overview"], queryFn: () => apiFetch<Overview>("/learn/coach/overview") });
  const progress = useQuery({ queryKey: ["coach", "progress"], queryFn: () => apiFetch<Progress>("/learn/coach/progress") });
  const game = useQuery({ queryKey: ["coach", "game"], queryFn: () => apiFetch<Gamification>("/learn/coach/gamification") });
  const materials = useQuery({ queryKey: ["coach", "materials"], queryFn: () => apiFetch<{ materials: UploadMaterial[] }>("/learn/coach/materials/list") });
  const coachProfile = useCoachProfile();
  const updateProfile = useUpdateCoachProfile();
  const waStatus = useWhatsappStatus();

  const startSession = useMutation({
    mutationFn: (v: { moduleId: string; remedialFocus?: string | null }) =>
      apiFetch<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });
  const [tutorError, setTutorError] = useState<string | null>(null);
  // Tutor uses a remedial-scoped start that doesn't require a standard course enrolment (an off-track
  // learner is entitled to coach on the course they're behind on), so it always connects.
  const startCoachTutor = useMutation({
    mutationFn: (v: { moduleId?: string; remedialFocus?: string | null }) =>
      apiFetch<{ id: string }>("/learn/coach/tutor", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
    onError: (e: unknown) => setTutorError(e instanceof Error ? e.message : "Couldn't start a coaching session. Try Practice instead."),
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
    // A ref-less "review" step: start a coaching session on the module the learner is weakest on,
    // or — before any concept mastery exists — on the course's first published module (tutorModuleId).
    const moduleId = weakestModule?.moduleId ?? overview.data?.tutorModuleId ?? null;
    if (moduleId) return startSession.mutate({ moduleId, remedialFocus: it.category || it.title });
  }
  // Picking "Tutor" always starts a coaching session focused on the learner's top gap. The server
  // chooses a coachable module in the remedial course and skips the enrolment gate, so it connects.
  const startTutor = () => {
    setTutorError(null);
    startCoachTutor.mutate({ remedialFocus: overview.data?.gaps[0] ?? null });
  };

  if (overview.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-9 w-56" /><Skeleton className="h-40" /></div>;
  }

  const data = overview.data;
  if (!data?.active) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Coach" icon={LifeBuoy} subtitle="Your remedial coach — the materials, tutor and progress to bridge your gaps." />
        <div className="rounded-2xl border border-border bg-background p-10 text-center">
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
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Coach" icon={LifeBuoy} subtitle="Practice built from your class to close the gap." />
        <CoachPractice target={practice} onBack={() => { setPractice(null); game.refetch(); }} onNavigate={navigate} onGame={() => game.refetch()} />
      </div>
    );
  }

  const name = data.learnerName || "there";
  const whyReferred = primaryPlan?.rationale
    || `You've been finding ${data.gaps.join(", ") || "a few things"} tricky lately, so your coach has pulled together everything you need to catch up. Nothing here counts against you — it's just support to get you back on track.`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* First-visit onboarding — how the four paths interlock. Dismissible, shown once. */}
      {showIntro && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-foreground">New here? Here's how your Coach works</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Four ways to close your gap, and they work together: <span className="font-medium text-foreground">Practice</span> for quick flashcards and quizzes, <span className="font-medium text-foreground">Tutor</span> for a one-on-one coaching chat, <span className="font-medium text-foreground">Materials</span> to turn your own study content into practice, and <span className="font-medium text-foreground">Progress</span> to see what's left. Start with Practice for the quickest win.
                </p>
              </div>
            </div>
            <button onClick={dismissIntro} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button size="sm" className="mt-3" onClick={dismissIntro}>Got it</Button>
        </section>
      )}

      {/* Welcome + why you're here */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-transparent p-6 sm:p-8">
        <div className="flex items-center gap-2 text-primary">
          <LifeBuoy className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Your Coach</span>
        </div>
        <h1 className="mt-3 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Welcome, {name}. Let's get you back on track.
        </h1>
        <div className="mt-5 rounded-xl border border-border bg-background/70 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why you're here</p>
          <p className="mt-2 leading-relaxed text-foreground">{whyReferred}</p>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Pick one of the four ways below to get started — a session takes about 10 minutes, and your progress saves as you go.</p>
      </section>

      {/* At-a-glance stats */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Zap} tone="text-amber-600" label="Points earned" value={game.data?.xp ?? 0} />
        <StatCard icon={Flame} tone="text-orange-600" label="Day streak" value={game.data?.streak ?? 0} />
        {/* Count the REAL uploaded materials (same source as the Materials page), not the overview's
            materialCount, which was showing an unrelated figure (module count) while the actual
            materials list was empty. */}
        {(() => { const matCount = materials.data?.materials?.length ?? 0; return (
          <StatCard icon={BookOpen} tone="text-primary" label={matCount === 1 ? "Material" : "Materials"} value={matCount} />
        ); })()}
        <StatCard icon={Target} tone="text-red-600" label={data.gapCount === 1 ? "Gap to close" : "Gaps to close"} value={data.gapCount} />
      </section>

      {/* Ways to close your gap — the instructions ARE the actions */}
      <section>
        <h2 className="text-lg font-semibold text-foreground">What would you like to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Four ways to close your gap. Practice is the quickest win — but any of these helps.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ActionCard icon={Dumbbell} primary title="Practice" cta="Start practising"
            text="Flashcards and quick quizzes built from your own class content. Flip a card and rate how well you knew it, then answer questions to lock the ideas in. You earn points and build a daily streak as you go."
            onClick={() => primaryPlan && data.gaps[0] && setPractice({ kind: "gap", planId: primaryPlan.planId, category: data.gaps[0] })}
            disabled={!primaryPlan || !data.gaps[0]} />
          <ActionCard icon={MessageSquare} title="Tutor" cta={startCoachTutor.isPending ? "Starting your session…" : "Begin a coaching session"}
            text="Start a one-on-one coaching session right now. Your coach asks guiding questions and works through the tricky parts with you, step by step, focused only on what you're catching up on."
            onClick={startTutor} disabled={startCoachTutor.isPending} />
          <ActionCard icon={Upload} title="Materials" cta="Add & practise your content"
            text="Bring in your own study material — a PDF, Word or PowerPoint file, notes, or a link — and the coach turns it into flashcards and a quiz you can practise straight away."
            onClick={() => showSection("materials")} />
          <ActionCard icon={TrendingUp} title="Progress" cta="See my progress"
            text="Watch your understanding grow - see how well you know each concept and which gaps are still open, so you always know what to do next."
            onClick={() => showSection("progress")} />
        </div>
        {tutorError && <p className="mt-3 text-sm text-red-600">{tutorError}</p>}
        {data.gaps.length > 1 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Or jump straight to a gap:</span>
            {data.gaps.map((g) => {
              const pl = data.plans.find((p) => p.gaps.includes(g)) ?? primaryPlan;
              return (
                <button key={g} onClick={() => pl && setPractice({ kind: "gap", planId: pl.planId, category: g })}
                  className="rounded-full border border-amber-300/60 bg-background px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-300">
                  Practice: {g}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Coach on WhatsApp — opt in/out right here, no separate settings page. */}
      {coachProfile.data && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/60 bg-emerald-50/60 p-4 dark:bg-emerald-950/15">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600"><MessageSquare className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Coach on WhatsApp</p>
            <p className="text-sm text-muted-foreground">
              {coachProfile.data.whatsappOptIn
                ? (waStatus.data?.configured
                    ? "You're opted in. Your coach can reach you on WhatsApp with questions and nudges."
                    : "You're opted in. WhatsApp activates once it's connected for your organisation.")
                : "Answer your coach's questions and get nudges right in WhatsApp."}
            </p>
          </div>
          <Switch
            checked={coachProfile.data.whatsappOptIn}
            disabled={updateProfile.isPending}
            onCheckedChange={(v) => updateProfile.mutate({ whatsappOptIn: v })}
          />
        </div>
      )}

      {/* The chosen section renders here — no separate tab bar, the cards above are the nav */}
      {section && (
        <div ref={sectionRef} className="scroll-mt-4">
          {section === "materials" && (
            <MaterialsPanel
              data={materials.data?.materials ?? []}
              loading={materials.isLoading}
              onRefetch={() => { materials.refetch(); overview.refetch(); }}
              onPractise={(setId) => setPractice({ kind: "set", setId })}
            />
          )}

          {section === "progress" && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Your progress</h2>
              </div>
              {progress.isLoading ? (
                <Skeleton className="h-40" />
              ) : !progress.data?.hasData ? (
                <div className="rounded-xl border border-border bg-background p-10 text-center">
                  <TrendingUp className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                  <h3 className="text-base font-semibold text-foreground">Your progress will build here</h3>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">As you work through the practice and coaching sessions, which gaps are closed — and how much of each is done — shows up here.</p>
                </div>
              ) : (
                <ProgressPanel
                  gaps={progress.data.gaps}
                  concepts={progress.data.concepts}
                  onPractise={(category) => {
                    const pl = data.plans.find((p) => p.gaps.includes(category)) ?? primaryPlan;
                    if (pl) setPractice({ kind: "gap", planId: pl.planId, category });
                  }}
                />
              )}
            </section>
          )}
        </div>
      )}
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

function CoachPractice({ target, onBack, onNavigate, onGame }: { target: PracticeTarget; onBack: () => void; onNavigate: (path: string) => void; onGame: () => void }) {
  const url = target.kind === "set"
    ? `/learn/coach/practice?setId=${encodeURIComponent(target.setId)}`
    : `/learn/coach/practice?planId=${encodeURIComponent(target.planId)}&category=${encodeURIComponent(target.category)}`;
  const q = useQuery({
    queryKey: ["coach", "practice", target.kind === "set" ? target.setId : `${target.planId}:${target.category}`],
    queryFn: () => apiFetch<PracticeData>(url),
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

  // Resume where the learner left off: persist the flashcard + quiz position per set so re-entering
  // Practice does not restart at card 1 (matches the "your progress saves as you go" promise).
  const setId = q.data?.setId;
  useEffect(() => {
    if (!setId) return;
    try {
      const f = parseInt(localStorage.getItem(`coachp:${setId}:f`) ?? "0", 10);
      const qi = parseInt(localStorage.getItem(`coachp:${setId}:q`) ?? "0", 10);
      if (Number.isFinite(f) && f > 0) setFIdx(f);
      if (Number.isFinite(qi) && qi > 0) setQIdx(qi);
    } catch { /* localStorage unavailable */ }
  }, [setId]);
  useEffect(() => { if (setId) { try { localStorage.setItem(`coachp:${setId}:f`, String(fIdx)); } catch { /* ignore */ } } }, [setId, fIdx]);
  useEffect(() => { if (setId) { try { localStorage.setItem(`coachp:${setId}:q`, String(qIdx)); } catch { /* ignore */ } } }, [setId, qIdx]);

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
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
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

      {/* Mode switch — a clear segmented control so it reads as tappable tabs */}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Choose an activity</p>
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <ModeBtn active={mode === "flashcards"} onClick={() => setMode("flashcards")} icon={Brain} label={`Flashcards (${cards.length})`} />
          <ModeBtn active={mode === "quiz"} onClick={() => setMode("quiz")} icon={CheckCircle2} label={`Quiz (${questions.length})`} />
          {d.methods.length > 0 && (
            <ModeBtn active={mode === "methods"} onClick={() => setMode("methods")} icon={Layers} label={`Course activities (${d.methods.length})`} />
          )}
        </div>
      </div>

      {/* How this mode works — numbered so it's obvious how to navigate */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-semibold text-foreground">How this works</p>
        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
          {mode === "flashcards" ? (
            <>
              <li><span className="font-medium text-foreground">1.</span> Read the question on the card.</li>
              <li><span className="font-medium text-foreground">2.</span> Tap the card (or the <span className="font-medium text-foreground">Show answer</span> button) to reveal the answer.</li>
              <li><span className="font-medium text-foreground">3.</span> Rate how well you knew it — that schedules when the card comes back, and earns you points.</li>
            </>
          ) : mode === "quiz" ? (
            <>
              <li><span className="font-medium text-foreground">1.</span> Tap an answer to select it.</li>
              <li><span className="font-medium text-foreground">2.</span> Press <span className="font-medium text-foreground">Check answer</span> to see if you're right, with a short explanation.</li>
              <li><span className="font-medium text-foreground">3.</span> Press <span className="font-medium text-foreground">Next</span> to move on. Correct answers earn more points.</li>
            </>
          ) : (
            <li>These are other activities from your course that target this gap. Tap any card to open and try it.</li>
          )}
        </ol>
      </div>

      {/* Flashcards */}
      {mode === "flashcards" && (
        cards.length === 0 ? (
          <Empty text="No flashcards for this gap yet — try the Quiz or work through it with your coach." />
        ) : fIdx >= cards.length ? (
          <Done text={`Nice work, ${d.learnerName}! You've been through all ${cards.length} cards.`} onRestart={() => { setFIdx(0); setFlipped(false); }} />
        ) : (
          <div className="space-y-4">
            {/* Progress bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Card {fIdx + 1} of {cards.length}</span>
                <span className="text-muted-foreground">{Math.round((fIdx / cards.length) * 100)}% through</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(fIdx / cards.length) * 100}%` }} />
              </div>
            </div>

            {/* The card — clearly interactive: dashed accent border, hover lift, a 'tap to flip' pill */}
            <button
              onClick={() => setFlipped((f) => !f)}
              className="group relative flex min-h-[240px] w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-primary/25 bg-background p-8 text-center shadow-sm transition hover:border-primary/50 hover:shadow-md"
            >
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                <RotateCcw className="h-3 w-3" /> {flipped ? "Answer — tap for question" : "Tap to flip"}
              </span>
              {!flipped ? (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Question</span>
                  <p className="mt-3 text-xl font-medium leading-snug text-foreground">{cards[fIdx].front}</p>
                  {cards[fIdx].hint && <p className="mt-4 text-sm text-muted-foreground">Hint: {cards[fIdx].hint}</p>}
                </>
              ) : (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">Answer</span>
                  <p className="mt-3 text-lg leading-snug text-foreground">{cards[fIdx].back}</p>
                </>
              )}
            </button>

            {/* Explicit next action */}
            {!flipped ? (
              <Button className="w-full" size="lg" onClick={() => setFlipped(true)}>
                <RotateCcw className="mr-2 h-4 w-4" /> Show answer
              </Button>
            ) : (
              <div className="rounded-xl border border-border bg-background p-4">
                <p className="mb-3 text-center text-sm font-medium text-foreground">How well did you know it? Tap one to go to the next card.</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GRADES.map((gr) => (
                    <button key={gr.grade} onClick={() => rate(gr.grade)} disabled={review.isPending}
                      className={cn("rounded-lg border-2 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-60", gr.cls)}>
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
            <p className="mb-1 text-lg font-medium leading-snug text-foreground">{questions[qIdx].prompt}</p>
            <p className="mb-3 text-xs text-muted-foreground">{revealed ? "" : "Tap an answer below, then press Check answer."}</p>
            <div className="space-y-2.5">
              {questions[qIdx].options.map((opt, i) => {
                const isChosen = choice === i;
                const isCorrect = revealed && i === revealed.correctIndex;
                const isWrongChosen = revealed && isChosen && i !== revealed.correctIndex;
                return (
                  <button key={i} disabled={!!revealed} onClick={() => setChoice(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border-2 p-3.5 text-left text-sm transition disabled:cursor-default",
                      isCorrect ? "border-green-400 bg-green-50 dark:bg-green-950/20" :
                      isWrongChosen ? "border-red-400 bg-red-50 dark:bg-red-950/20" :
                      isChosen ? "border-primary bg-primary/5" : "cursor-pointer border-border hover:border-primary/50 hover:bg-muted/40",
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
              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
                <p className={cn("text-sm font-semibold", revealed.correct ? "text-green-600" : "text-red-600")}>
                  {revealed.correct ? "Correct!" : "Not quite — here's why."}
                </p>
                {revealed.explanation && <p className="mt-1 text-sm text-muted-foreground">{revealed.explanation}</p>}
                <Button className="mt-3 w-full sm:w-auto" size="lg" onClick={nextQuestion}>
                  {qIdx + 1 < questions.length ? "Next question" : "Finish"} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button className="mt-5 w-full sm:w-auto" size="lg" onClick={submitAnswer} disabled={choice == null || answer.isPending}>Check answer</Button>
            )}
          </div>
        )
      )}

      {/* Methods */}
      {mode === "methods" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Case studies and activities from your course that target this gap — tap any one to open it:</p>
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
      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-background text-primary shadow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
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

function StatCard({ icon: Icon, tone, label, value }: { icon: any; tone: string; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <Icon className={cn("h-5 w-5", tone)} />
      <div className="mt-2 text-2xl font-bold leading-none text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ActionCard({ icon: Icon, title, text, cta, primary, onClick, disabled }: { icon: any; title: string; text: string; cta: string; primary?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex h-full flex-col rounded-xl border p-5 text-left transition disabled:pointer-events-none disabled:opacity-60",
        primary ? "border-primary bg-primary/5 hover:bg-primary/10" : "border-border bg-background hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", primary ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary")}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {primary && <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Start here</span>}
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">{cta} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
    </button>
  );
}

const ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.txt,.md,.csv,.html,.htm";
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result); resolve(s.slice(s.indexOf(",") + 1)); };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

// Learner brings their OWN study material (a document, a link, or pasted notes); the coach turns
// it into a fresh flashcards + quiz set they can practise immediately.
function MaterialsPanel({ data, loading, onRefetch, onPractise }: { data: UploadMaterial[]; loading: boolean; onRefetch: () => void; onPractise: (setId: string) => void }) {
  const [tab, setTab] = useState<"file" | "link" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ setId: string; title: string; flashcards: number; questions: number } | null>(null);

  async function submit() {
    setBusy(true); setError(null); setAdded(null);
    try {
      let body: Record<string, unknown>;
      if (tab === "file") {
        if (!file) { setError("Choose a file to add first."); setBusy(false); return; }
        if (file.size > 20 * 1024 * 1024) { setError("That file is too large (max 20MB)."); setBusy(false); return; }
        body = { filename: file.name, dataBase64: await fileToBase64(file) };
      } else if (tab === "link") {
        if (!url.trim()) { setError("Paste a link first."); setBusy(false); return; }
        body = { url: url.trim() };
      } else {
        if (text.trim().length < 40) { setError("Paste a bit more text — at least a paragraph."); setBusy(false); return; }
        body = { text: text.trim() };
      }
      const r = await apiFetch<{ setId: string; title: string; flashcards: number; questions: number }>(
        "/learn/coach/materials/add", { method: "POST", body: JSON.stringify(body) });
      setAdded(r);
      setFile(null); setUrl(""); setText("");
      onRefetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that content. Try a different file or link.");
    } finally { setBusy(false); }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Upload className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Add your own study material</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Bring in anything you're studying — a document, a link, or your own notes — and your coach turns it
        into flashcards and a quiz you can practise straight away. Nothing is shared; it's just for you.
      </p>

      <div className="rounded-2xl border border-border bg-background p-4 sm:p-5">
        {/* Source picker */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <SourceBtn active={tab === "file"} onClick={() => { setTab("file"); setError(null); setAdded(null); }} icon={FileText} label="Document" />
          <SourceBtn active={tab === "link"} onClick={() => { setTab("link"); setError(null); setAdded(null); }} icon={Link2} label="Link" />
          <SourceBtn active={tab === "text"} onClick={() => { setTab("text"); setError(null); setAdded(null); }} icon={Plus} label="Paste notes" />
        </div>

        <div className="mt-4">
          {tab === "file" && (
            <div>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 px-4 py-8 text-center transition hover:border-primary/50">
                <Upload className="mb-2 h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-foreground">{file ? file.name : "Choose a file to upload"}</span>
                <span className="mt-1 text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, ODT, or text — up to 20MB</span>
                <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setAdded(null); }} />
              </label>
            </div>
          )}
          {tab === "link" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Paste a link to an article, a Google Doc/Slides, or any web page</label>
              <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); setAdded(null); }}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" />
            </div>
          )}
          {tab === "text" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Paste your notes or any text you want to study</label>
              <textarea value={text} onChange={(e) => { setText(e.target.value); setError(null); setAdded(null); }} rows={6}
                placeholder="Paste a paragraph or more…"
                className="mt-1 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50" />
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {added && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border border-green-300/60 bg-green-50/60 p-3 dark:bg-green-950/15 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground">
              <span className="font-medium">“{added.title}”</span> is ready — {added.flashcards} flashcards and {added.questions} questions.
            </p>
            <Button size="sm" className="self-start sm:self-auto" onClick={() => onPractise(added.setId)}>
              <Dumbbell className="mr-1.5 h-4 w-4" /> Practise it now
            </Button>
          </div>
        )}

        <Button className="mt-4" onClick={submit} disabled={busy}>
          {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Building your practice…</> : <><Sparkles className="mr-1.5 h-4 w-4" /> Turn it into practice</>}
        </Button>
      </div>

      {/* Audio & video — flagged as coming next so expectations are clear */}
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <div className="flex gap-1.5 text-muted-foreground"><Music className="h-5 w-5" /><Video className="h-5 w-5" /></div>
        <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Audio & video</span> — lecture recordings and clips are coming soon. For now, documents, links and notes are supported.</p>
      </div>

      {/* Previously added materials */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Materials you've added</h3>
        {loading ? (
          <Skeleton className="h-20" />
        ) : data.length === 0 ? (
          <p className="rounded-xl border border-border bg-background p-6 text-center text-sm text-muted-foreground">Nothing yet — add a document, link or notes above to build your first practice set.</p>
        ) : (
          <div className="space-y-2">
            {data.map((m) => (
              <div key={m.setId} className="flex items-center gap-3 rounded-xl border border-border bg-background p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.status === "ready" ? "Practice ready" : "No practice could be built from this"}</p>
                </div>
                <Button size="sm" variant="outline" disabled={m.status !== "ready"} onClick={() => onPractise(m.setId)}>
                  <Dumbbell className="mr-1.5 h-4 w-4" /> Practise
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SourceBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-background text-primary shadow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-background/60 hover:text-foreground")}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// Progress made simple and visual: what's still open (cards you can close), then a ring per concept.
function ProgressPanel({ gaps, concepts, onPractise }: {
  gaps: Array<{ category: string; courseId: string | null; courseTitle: string }>;
  concepts: Array<{ moduleId: string; moduleTitle: string; courseId: string | null; mastery: number; reps: number; due: boolean }>;
  onPractise: (category: string) => void;
}) {
  const mastered = concepts.filter((c) => c.mastery >= 0.8).length;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat tone="text-red-600" label={gaps.length === 1 ? "Area still open" : "Areas still open"} value={gaps.length} />
        <MiniStat tone="text-green-600" label="Concepts mastered" value={mastered} />
        <MiniStat tone="text-primary" label="Concepts practised" value={concepts.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Areas that still need closing</h3>
          {gaps.length === 0 ? (
            <div className="rounded-xl border border-green-300/60 bg-green-50/50 p-6 text-center dark:bg-green-950/10">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="font-medium text-foreground">Every area is closed, superb work.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {gaps.map((g, i) => (
                <div key={i} className="flex flex-col rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 dark:bg-amber-950/15">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><Target className="h-4 w-4" /></span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Open</span>
                  </div>
                  <p className="mt-2 font-medium text-foreground">{g.category}</p>
                  <p className="text-xs text-muted-foreground">{g.courseTitle}</p>
                  <Button size="sm" className="mt-3 self-start" onClick={() => onPractise(g.category)}>
                    <Dumbbell className="mr-1.5 h-4 w-4" /> Practise to close this
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {concepts.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">How well you know each concept</h3>
            <div className="grid grid-cols-2 gap-3">
              {concepts.map((c) => {
                const pct = Math.round(c.mastery * 100);
                return (
                  <div key={c.moduleId} className="flex flex-col items-center rounded-xl border border-border bg-background p-4 text-center">
                    <MasteryRing pct={pct} />
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{c.moduleTitle}</p>
                    {c.due
                      ? <span className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Review due</span>
                      : <span className="mt-1 text-[11px] text-muted-foreground">{pct >= 80 ? "Strong" : pct >= 50 ? "Building" : "Needs work"}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ tone, label, value }: { tone: string; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 text-center">
      <div className={cn("text-2xl font-bold leading-none", tone)}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function MasteryRing({ pct }: { pct: number }) {
  const r = 26; const circ = 2 * Math.PI * r; const off = circ - (pct / 100) * circ;
  const color = pct >= 80 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626";
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" stroke={color} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{pct}%</span>
    </div>
  );
}
