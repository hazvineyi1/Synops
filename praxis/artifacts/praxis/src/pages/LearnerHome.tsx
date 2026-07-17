import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Flame,
  BookOpen,
  Award,
  Clock,
  CalendarClock,
  Megaphone,
  ArrowRight,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { courseAccent } from "@/lib/courseColor";
import { StatCard, SectionTitle } from "@/components/StatCard";

/**
 * Learner hub.
 *
 * Redesigned around what students actually value (ease of use, clear navigation,
 * progress at a glance, what's due, what's new, and light gamification) rather than a
 * wall of menus. Everything here is real data:
 *   /progress/me   -> streak, hours, courses + completion %
 *   /calendar      -> upcoming deadlines across enrolled courses
 *   /learn/plan    -> the coach's next session
 *   /announcements -> what's new
 *   /credentials   -> badges earned
 * The Socratic coach stays central but as a clear entry point, not the whole page.
 */

/* ── shapes (subset of the API responses we use) ── */
interface CourseProgress {
  courseId: string;
  title: string;
  percent: number;
  status: string;
  viewedBeats: number;
  totalBeats: number;
  completedAt: string | null;
}
interface ProgressMe {
  courses: CourseProgress[];
  coursesCompleted: number;
  coursesInProgress: number;
  totalMinutes: number;
  activeDays: number;
  streak: number;
}
interface CalendarEvent {
  id: string;
  courseId: string;
  title: string;
  startDate: string;
  linkedAssignmentId: string | null;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
}
interface Credential {
  id: string;
  moduleTitle: string;
  issuedAt: string;
  masteryScore: number;
}
interface PlanItem {
  moduleId: string | null;
  moduleTitle: string;
  courseId: string;
  kind: string;
  reason: string;
  done: boolean;
  remedial?: boolean;
  refType?: "case" | "activity" | "module" | null;
  refId?: string | null;
  category?: string | null;
}
interface CoachPlan {
  items: PlanItem[];
  rationale: string;
  catchUp?: { active: boolean; rationale?: string; courseTitle?: string | null; coachUrl?: string | null };
}
interface MasteryConcept {
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  mastery: number;
  reps: number;
  due: boolean;
}
interface MyIntervention {
  alertId: string;
  courseId: string;
  courseTitle: string;
  status: "off_track" | "at_risk";
}

/* ── helpers ── */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatHours(minutes: number): string {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function timeUntil(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days < 0) return "overdue";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days < 7) return `in ${days} days`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── page ── */

export function LearnerHome({ firstName }: { firstName?: string | null }) {
  const [, navigate] = useLocation();

  const { data: prog, isLoading: progLoading } = useQuery({
    queryKey: ["progress", "me"],
    queryFn: () => apiFetch<ProgressMe>("/progress/me"),
  });
  const { data: dueSoon } = useQuery({
    queryKey: ["calendar", "me"],
    queryFn: () => apiFetch<CalendarEvent[]>("/calendar"),
  });
  const { data: announcements } = useQuery({
    queryKey: ["announcements", "me"],
    queryFn: () => apiFetch<Announcement[]>("/announcements"),
  });
  const { data: credentials } = useQuery({
    queryKey: ["credentials", "me"],
    queryFn: () => apiFetch<Credential[]>("/credentials"),
  });
  const { data: plan } = useQuery({
    queryKey: ["learn", "plan"],
    queryFn: () => apiFetch<CoachPlan>("/learn/plan"),
  });
  // Spaced retrieval practice (cognitive-load brief §3.2): a low-stakes recall of ONE
  // prior concept, keyed to the spaced-repetition schedule and to below-mastery concepts,
  // placed in the primary flow but at deliberately low visual weight.
  const { data: mastery } = useQuery({
    queryKey: ["learn", "mastery"],
    queryFn: () => apiFetch<MasteryConcept[]>("/learn/mastery"),
  });
  const { data: interventions } = useQuery({
    queryKey: ["my-interventions"],
    queryFn: () => apiFetch<MyIntervention[]>("/my/interventions"),
  });

  const startSession = useMutation({
    mutationFn: (v: { moduleId: string; remedialFocus?: string | null }) =>
      apiFetch<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });

  // Launch a plan item the right way: a catch-up case/activity opens its player; a module (daily or
  // remedial 'review') starts a Socratic session, carrying the weak area as the session's focus.
  const launchItem = (it: PlanItem) => {
    if (it.remedial && it.refType === "case" && it.refId) return navigate(`/cases/${it.refId}/begin`);
    if (it.remedial && it.refType === "activity" && it.refId) return navigate(`/activities/${it.refId}/play`);
    if (it.moduleId) return startSession.mutate({ moduleId: it.moduleId, remedialFocus: it.remedial ? it.category || it.moduleTitle : null });
    return navigate("/grades");
  };

  // The off-track learner's remedial plan is pushed to the AI study coach (The Coach app), which
  // returns a signed magic link. When present, catch-up entry points open the AI coach straight onto
  // the plan; otherwise we fall back to the in-app Socratic session so nothing breaks pre-integration.
  const aiCoachUrl = plan?.catchUp?.coachUrl ?? null;
  const openAiCoach = () => {
    if (aiCoachUrl) window.open(aiCoachUrl, "_blank", "noopener,noreferrer");
  };
  const startCatchUp = (it: PlanItem) => (aiCoachUrl ? openAiCoach() : launchItem(it));

  const courses = prog?.courses ?? [];
  const inProgress = courses.filter((c) => c.status !== "completed").sort((a, b) => b.percent - a.percent);
  const upcoming = (dueSoon ?? [])
    .filter((e) => new Date(e.startDate).getTime() >= Date.now() - 86400000)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);
  const news = (announcements ?? []).slice(0, 3);
  const recentCreds = (credentials ?? []).slice(0, 3);
  const nextUp = plan?.items?.find((i) => !i.done) ?? plan?.items?.[0];
  // Prefer a concept that is due AND not yet mastered (needs the reinforcement most),
  // and only surface something the learner has actually studied before (reps > 0).
  const retrieval =
    (mastery ?? []).filter((m) => m.due && m.reps > 0 && m.mastery < 0.8).sort((a, b) => a.mastery - b.mastery)[0] ??
    (mastery ?? []).filter((m) => m.due && m.reps > 0)[0];

  const flagged = interventions ?? [];
  const offTrack = flagged.some((i) => i.status === "off_track");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-serif font-bold tracking-tight">
          {greeting()}{firstName ? `, ${firstName}` : ""} <span className="inline-block">👋</span>
        </h1>
        <p className="text-muted-foreground mt-1">
          {inProgress.length > 0
            ? "Pick up where you left off, or check what's due."
            : "Ready when you are. Explore your courses to get started."}
        </p>
      </div>

      {/* Needs your attention — a flagged learner sees their off-track status + a route to the
          plan and their coach, front and centre, before anything else. */}
      {flagged.length > 0 && (
        <Card className={cn("p-4 sm:p-5", offTrack ? "border-red-200 bg-red-50/70 dark:bg-red-950/20" : "border-amber-200 bg-amber-50/70 dark:bg-amber-950/20")}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className={cn("h-11 w-11 shrink-0 rounded-xl flex items-center justify-center", offTrack ? "bg-red-500/15 text-red-600" : "bg-amber-500/15 text-amber-600")}>
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {offTrack ? "Let's get you back on track" : "A little push will keep you on track"}
                {" in "}
                {flagged[0].courseTitle}
                {flagged.length > 1 ? ` +${flagged.length - 1} more` : ""}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Your coach has built a plan to help; work through it, and message your coach any time.
              </p>
            </div>
            <div className="shrink-0">
              <Button onClick={() => navigate("/coach-hub")}>
                Open my coach <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Gamification / at-a-glance strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {progLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)
        ) : (
          <>
            <StatCard icon={Flame} label={prog?.streak ? "Day streak" : "Start a streak today"} value={prog?.streak ?? 0} tint="bg-amber-500/10 text-amber-600" />
            <StatCard icon={BookOpen} label="Courses in progress" value={prog?.coursesInProgress ?? 0} tint="bg-indigo-500/10 text-indigo-600" />
            <StatCard icon={Award} label="Credentials earned" value={credentials?.length ?? 0} tint="bg-emerald-500/10 text-emerald-600" />
            <StatCard icon={Clock} label="Learning time" value={formatHours(prog?.totalMinutes ?? 0)} tint="bg-sky-500/10 text-sky-600" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-8">
          {/* Continue learning */}
          <section>
            <SectionTitle
              action={
                <button onClick={() => navigate("/courses")} className="text-sm font-medium text-primary hover:underline">
                  All courses
                </button>
              }
            >
              Continue learning
            </SectionTitle>

            {progLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
              </div>
            ) : inProgress.length === 0 ? (
              <Card className="p-8 text-center">
                <GraduationCap className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="font-medium">No courses in progress</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">Browse your catalog and start learning.</p>
                <Button onClick={() => navigate("/courses")}>Browse courses</Button>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {inProgress.slice(0, 4).map((c) => {
                  const a = courseAccent(c.courseId);
                  return (
                    <Card
                      key={c.courseId}
                      className="p-5 flex flex-col cursor-pointer hover:shadow-md transition-shadow group"
                      onClick={() => navigate(`/courses/${c.courseId}`)}
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <div className={cn("h-10 w-10 shrink-0 rounded-lg flex items-center justify-center", a.soft, a.text)}>
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                            {c.title}
                          </h3>
                        </div>
                      </div>

                      <div className="mt-auto">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span>{c.viewedBeats} of {c.totalBeats} steps</span>
                          <span className="tabular-nums font-medium">{c.percent}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", a.bar)} style={{ width: `${c.percent}%` }} />
                        </div>
                        <div className={cn("mt-4 inline-flex items-center gap-1 text-sm font-medium", a.text)}>
                          Continue <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Retrieval practice nudge — deliberately low visual weight (§3.2): quick,
              optional, low-stakes, so it doesn't compete with the primary actions above,
              but present in the flow so it isn't skipped by inattention. */}
          {retrieval && (
            <button
              onClick={() => startSession.mutate({ moduleId: retrieval.moduleId })}
              disabled={startSession.isPending}
              className="w-full text-left rounded-xl border border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors px-4 py-3 flex items-center gap-3"
            >
              <div className="h-8 w-8 shrink-0 rounded-lg bg-teal-500/10 text-teal-600 flex items-center justify-center">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Quick recall: {retrieval.moduleTitle}</p>
                <p className="text-xs text-muted-foreground">A 30-second check to keep it fresh.</p>
              </div>
              <span className="text-xs font-semibold text-teal-600 shrink-0">Try it →</span>
            </button>
          )}

          {/* Due soon */}
          <section>
            <SectionTitle>Due soon</SectionTitle>
            <Card className="divide-y divide-border">
              {upcoming.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Nothing due right now. Nice and clear.
                </div>
              ) : (
                upcoming.map((e) => {
                  const overdue = new Date(e.startDate).getTime() < Date.now();
                  return (
                    <button
                      key={e.id}
                      onClick={() =>
                        e.linkedAssignmentId
                          ? navigate(`/courses/${e.courseId}/assignments/${e.linkedAssignmentId}`)
                          : navigate(`/courses/${e.courseId}`)
                      }
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className={cn("h-9 w-9 shrink-0 rounded-lg flex items-center justify-center", overdue ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600")}>
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{e.title.replace(/^Due:\s*/i, "")}</div>
                      </div>
                      <span className={cn("text-xs font-medium shrink-0", overdue ? "text-red-600" : "text-muted-foreground")}>
                        {timeUntil(e.startDate)}
                      </span>
                    </button>
                  );
                })
              )}
            </Card>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Coach next session for on-track learners. Off-track learners already get the attention
              banner above (which opens the Coach hub), so we do not duplicate a catch-up card here. */}
          {!plan?.catchUp?.active && (
            <Card className="p-5 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-serif font-semibold">Your coach</h2>
              </div>
              {nextUp ? (
                <>
                  <p className="text-sm text-muted-foreground mb-1">Next in your path</p>
                  <p className="font-medium leading-snug mb-1">{nextUp.moduleTitle}</p>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{nextUp.reason}</p>
                  <Button className="w-full" onClick={() => launchItem(nextUp)} disabled={startSession.isPending}>
                    {startSession.isPending ? "Starting…" : "Start session"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    Your coach builds a personalised path as you learn. Start a course to get going.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => navigate("/courses")}>
                    Browse courses
                  </Button>
                </>
              )}
            </Card>
          )}

          {/* What's new */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-serif font-semibold">What's new</h2>
            </div>
            {news.length === 0 ? (
              <p className="text-sm text-muted-foreground">No announcements yet.</p>
            ) : (
              <div className="space-y-3.5">
                {news.map((n) => (
                  <div key={n.id} className="text-sm">
                    <div className="font-medium leading-snug">{n.title}</div>
                    <p className="text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    <div className="text-xs text-muted-foreground/70 mt-1">{timeAgo(n.publishedAt ?? n.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Recent credentials */}
          {recentCreds.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <h2 className="font-serif font-semibold">Recent credentials</h2>
                </div>
                <button onClick={() => navigate("/credentials")} className="text-xs font-medium text-primary hover:underline">
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {recentCreds.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{c.moduleTitle}</div>
                      <div className="text-xs text-muted-foreground">{timeAgo(c.issuedAt)}</div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 tabular-nums">
                      {Math.round((c.masteryScore ?? 0) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
