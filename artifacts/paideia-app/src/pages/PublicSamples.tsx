import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useCatalog } from "@/hooks/use-catalog";
import type { Sample, LessonPlanContent, WorksheetContent, ParentDraftContent, QuizContent } from "@/lib/types";
import { LessonPlanView, WorksheetView, ParentDraftView, QuizView } from "@/components/Renderers";
import { BookOpen, ArrowLeft, ArrowUpRight } from "lucide-react";

const KIND_LABEL: Record<string, string> = {
  lesson_plan: "Lesson plan",
  worksheet: "Worksheet",
  quiz: "Quiz",
  parent_draft: "Parent update",
};

export function PublicSamplesList() {
  const { regions } = useCatalog();
  const [region, setRegion] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    if (region !== "all") q.set("region", region);
    if (kind !== "all") q.set("kind", kind);
    const qs = q.toString() ? `?${q.toString()}` : "";
    void api.get<{ samples: Sample[] }>(`/samples/public${qs}`)
      .then((r) => setSamples(r.samples))
      .finally(() => setLoading(false));
  }, [region, kind]);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8">
          <h1 className="font-serif text-4xl text-primary mb-2">Free samples library</h1>
          <p className="text-muted-foreground max-w-2xl">
            Real examples written for African classrooms. Browse by region, subject, and year group. Create a free account to copy, edit, and assign any of these to your students.
          </p>
        </header>
        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {regions.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="lesson_plan">Lesson plans</SelectItem>
              <SelectItem value="worksheet">Worksheets</SelectItem>
              <SelectItem value="quiz">Quizzes</SelectItem>
              <SelectItem value="parent_draft">Parent updates</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loading ? (
          <p className="text-muted-foreground">Loading.</p>
        ) : samples.length === 0 ? (
          <p className="text-muted-foreground">No samples match these filters.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {samples.map((s) => (
              <Link
                key={s.id}
                href={`/samples/public/${s.id}`}
                className="block bg-card border rounded-lg p-5 hover:border-primary transition"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  <BookOpen className="h-3 w-3" />
                  {KIND_LABEL[s.kind] ?? s.kind} · {s.subject} · {s.yearGroup}
                </div>
                <div className="font-serif text-xl text-primary mb-1">{s.title}</div>
                <div className="text-sm text-muted-foreground">{s.description}</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function PublicSampleViewer() {
  const [, params] = useRoute<{ id: string }>("/samples/public/:id");
  const [, setLoc] = useLocation();
  const id = params?.id;
  const [s, setS] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void api.get<{ sample: Sample }>(`/samples/public/${id}`)
      .then((r) => setS(r.sample))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-6 py-10"><p className="text-muted-foreground">Loading.</p></main>
    </div>
  );
  if (!s) return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-6 py-10"><p>Sample not found.</p></main>
    </div>
  );

  const canCopy = s.kind === "worksheet" || s.kind === "quiz";

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/samples/public" className="inline-flex items-center text-sm text-primary mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />All samples
        </Link>
        <header className="mb-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Sample · {KIND_LABEL[s.kind] ?? s.kind} · {s.subject} · {s.yearGroup}
          </div>
          <h1 className="font-serif text-4xl text-primary">{s.title}</h1>
          <p className="text-muted-foreground mt-2">{s.description}</p>
        </header>
        <div className="bg-card border rounded-lg p-8">
          {s.kind === "lesson_plan" && <LessonPlanView c={s.content as LessonPlanContent} />}
          {s.kind === "worksheet" && <WorksheetView c={s.content as WorksheetContent} />}
          {s.kind === "parent_draft" && <ParentDraftView c={s.content as ParentDraftContent} />}
          {s.kind === "quiz" && <QuizView c={s.content as QuizContent} />}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {canCopy && (
            <Button onClick={() => setLoc("/signup")}>
              <ArrowUpRight className="h-4 w-4 mr-2" />Sign up free to copy and edit
            </Button>
          )}
          <Button variant="outline" onClick={() => setLoc("/signup")}>
            Make my own from scratch
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-3 max-w-lg mx-auto">
          {canCopy
            ? "Creating a free account takes under a minute. No credit card needed. Copying creates an editable version you can adapt and assign digitally to your class."
            : "Create a free account to generate your own lesson plans, worksheets, and quizzes tailored to your curriculum."}
        </p>
      </main>
    </div>
  );
}

function PublicHeader() {
  const [, setLoc] = useLocation();
  return (
    <header className="border-b bg-card">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="block">
          <div className="font-serif text-2xl text-primary leading-tight">Synops</div>
          <div className="text-xs tracking-wider uppercase text-muted-foreground">Teacher</div>
        </Link>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLoc("/login")}>Sign in</Button>
          <Button size="sm" onClick={() => setLoc("/signup")}>Create free account</Button>
        </div>
      </div>
    </header>
  );
}
