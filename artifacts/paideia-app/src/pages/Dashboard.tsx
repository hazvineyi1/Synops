import { Link } from "wouter";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { FileText, ClipboardList, HelpCircle, BookOpen, ArrowUpRight, Send, Users, Loader2 } from "lucide-react";
import type { LessonPlan, Worksheet, Quiz, Sample, Assignment } from "@/lib/types";
import { AssignDialog } from "@/components/AssignDialog";

const CARDS = [
  { path: "/plans/new", label: "New lesson plan", icon: FileText, blurb: "Differentiated, with starters and exit tickets." },
  { path: "/worksheets/new", label: "New worksheet", icon: ClipboardList, blurb: "Practice questions with full answer keys." },
  { path: "/quizzes/new", label: "New quiz or exit ticket", icon: HelpCircle, blurb: "Multiple choice, short answer, true or false." },
];

interface RecentItem {
  id: string;
  title: string;
  href: string;
  meta: string;
  createdAt: string;
  kind: "plan" | "worksheet" | "quiz";
}

interface AssignmentWithClass extends Assignment {
  className: string;
}

export default function Dashboard() {
  const { teacher } = useAuth();
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithClass[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ kind: "worksheet" | "quiz"; id: string; title: string } | null>(null);

  useEffect(() => {
    if (!teacher) return;
    void (async () => {
      try {
        const [plans, worksheets, quizzes, assignmentsRes, samp] = await Promise.all([
          api.get<{ plans: LessonPlan[] }>("/plans"),
          api.get<{ worksheets: Worksheet[] }>("/worksheets"),
          api.get<{ quizzes: Quiz[] }>("/quizzes"),
          api.get<{ assignments: AssignmentWithClass[] }>("/assignments"),
          api.get<{ samples: Sample[] }>(`/samples?region=${teacher.region}`),
        ]);
        const items: RecentItem[] = [
          ...plans.plans.map((p) => ({ id: p.id, title: p.title, href: `/plans/${p.id}`, meta: `Lesson plan · ${p.subject} · ${p.yearGroup}`, createdAt: p.createdAt, kind: "plan" as const })),
          ...worksheets.worksheets.map((w) => ({ id: w.id, title: w.title, href: `/worksheets/${w.id}`, meta: `Worksheet · ${w.subject} · ${w.yearGroup}`, createdAt: w.createdAt, kind: "worksheet" as const })),
          ...quizzes.quizzes.map((q) => ({ id: q.id, title: q.title, href: `/quizzes/${q.id}`, meta: `Quiz · ${q.subject} · ${q.yearGroup}`, createdAt: q.createdAt, kind: "quiz" as const })),
        ];
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setRecent(items.slice(0, 6));
        setAssignments(assignmentsRes.assignments.slice(0, 5));
        setSamples(samp.samples.slice(0, 4));
      } finally {
        setLoading(false);
      }
    })();
  }, [teacher]);

  const openAssign = (kind: "worksheet" | "quiz", id: string, title: string) => {
    setAssignTarget({ kind, id, title });
    setAssignOpen(true);
  };

  return (
    <AppShell>
      <header className="mb-10">
        <p className="text-sm tracking-wider uppercase text-muted-foreground mb-1">Welcome back</p>
        <h1 className="font-serif text-4xl text-primary">Good to see you, {teacher?.name?.split(" ")[0]}.</h1>
        <p className="text-muted-foreground mt-2">What would you like to make today?</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.path}
              href={c.path}
              className="group block bg-card border rounded-lg p-6 hover:border-primary transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-serif text-xl text-primary">{c.label}</h3>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
              </div>
              <p className="text-sm text-muted-foreground mt-3">{c.blurb}</p>
            </Link>
          );
        })}
      </div>

      {assignments.length > 0 && (
        <section className="mb-12">
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-serif text-2xl text-primary">Active assignments</h2>
              <p className="text-sm text-muted-foreground">Work you have published to classes.</p>
            </div>
            <Link href="/classes" className="text-sm text-primary underline">All classes</Link>
          </div>
          <div className="divide-y border rounded-lg bg-card">
            {assignments.map((a) => (
              <Link
                key={a.id}
                href={`/assignments/${a.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition"
              >
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <span className="capitalize">{a.resourceKind}</span>
                    <span>·</span>
                    {a.deliveryMode === "share_link" ? (
                      <><Send className="h-3 w-3" />Share link</>
                    ) : (
                      <><Users className="h-3 w-3" />Student accounts</>
                    )}
                    <span>·</span>
                    <span>{a.className}</span>
                    {a.closed && <span className="text-destructive">· closed</span>}
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-serif text-2xl text-primary">Your recent work</h2>
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading.</div>
        ) : recent.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
            <p>You have not generated anything yet. Pick a tool above to get started, or browse the samples library.</p>
          </div>
        ) : (
          <div className="divide-y border rounded-lg bg-card">
            {recent.map((r) => (
              <div key={r.id + r.href} className="flex items-center px-5 py-4 hover:bg-secondary/50 transition gap-3">
                <Link href={r.href} className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.meta}</div>
                </Link>
                {r.kind !== "plan" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); openAssign(r.kind as "worksheet" | "quiz", r.id, r.title); }}
                    title="Assign to a class"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
                <Link href={r.href}>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {samples.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="font-serif text-2xl text-primary">Samples for your region</h2>
              <p className="text-sm text-muted-foreground">Real examples to spark your own.</p>
            </div>
            <Link href="/samples" className="text-sm text-primary underline">See all</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {samples.map((s) => (
              <Link
                key={s.id}
                href={`/samples/${s.id}`}
                className="block bg-card border rounded-lg p-5 hover:border-primary transition"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  <BookOpen className="h-3 w-3" />
                  {s.kind.replace("_", " ")} · {s.subject} · {s.yearGroup}
                </div>
                <div className="font-serif text-lg text-primary mb-1">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.description}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {assignTarget && (
        <AssignDialog
          open={assignOpen}
          onClose={() => { setAssignOpen(false); setAssignTarget(null); }}
          resourceKind={assignTarget.kind}
          resourceId={assignTarget.id}
          resourceTitle={assignTarget.title}
        />
      )}
    </AppShell>
  );
}
