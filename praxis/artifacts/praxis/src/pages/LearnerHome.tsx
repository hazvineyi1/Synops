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
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  kind: string;
  reason: string;
  done: boolean;
}
interface CoachPlan {
  items: PlanItem[];
  rationale: string;
}

/* ── helpers ── */

// Stable per-course accent so a course looks the same everywhere. No color field
// exists on courses, so we hash the id into a small, deliberately calm palette.
const COURSE_ACCENTS = [
  { bar: "bg-indigo-500", soft: "bg-indigo-500/10", text: "text-indigo-600", ring: "ring-indigo-500/20" },
  { bar: "bg-emerald-500", soft: "bg-emerald-500/10", text: "text-emerald-600", ring: "ring-emerald-500/20" },
  { bar: "bg-amber-500", soft: "bg-amber-500/10", text: "text-amber-600", ring: "ring-amber-500/20" },
  { bar: "bg-sky-500", soft: "bg-sky-500/10", text: "text-sky-600", ring: "ring-sky-500/20" },
  { bar: "bg-rose-500", soft: "bg-rose-500/10", text: "text-rose-600", ring: "ring-rose-500/20" },
];
function courseAccent(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COURSE_ACCENTS[h % COURSE_ACCENTS.length]!;
}

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

/* ── small pieces ── */

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tint: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3.5">
      <div className={cn("h-11 w-11 shrink-0 rounded-xl flex items-center justify-center", tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tracking-tight leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </Card>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-serif font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
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

  const startSession = useMutation({
    mutationFn: (moduleId: string) =>
      apiFetch<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify({ moduleId }) }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });

  const courses = prog?.courses ?? [];
  const inProgress = courses.filter((c) => c.status !== "completed").sort((a, b) => b.percent - a.percent);
  const upcoming = (dueSoon ?? [])
    .filter((e) => new Date(e.startDate).getTime() >= Date.now() - 86400000)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 5);
  const news = (announcements ?? []).slice(0, 3);
  const recentCreds = (credentials ?? []).slice(0, 3);
  const nextUp = plan?.items?.find((i) => !i.done) ?? plan?.items?.[0];

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
          {/* Coach next session */}
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
                <Button
                  className="w-full"
                  onClick={() => startSession.mutate(nextUp.moduleId)}
                  disabled={startSession.isPending}
                >
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
