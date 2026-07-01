import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { api, ApiError } from "@/lib/api";
import { useCatalog } from "@/hooks/use-catalog";
import type { Sample, LessonPlanContent, WorksheetContent, ParentDraftContent, QuizContent } from "@/lib/types";
import { LessonPlanView, WorksheetView, ParentDraftView, QuizView } from "@/components/Renderers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const KIND_LABEL: Record<string, string> = {
  lesson_plan: "Lesson plan",
  worksheet: "Worksheet",
  parent_draft: "Parent update",
  quiz: "Quiz",
};

export function SamplesList() {
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
    void api.get<{ samples: Sample[] }>(`/samples${qs}`)
      .then((r) => setSamples(r.samples))
      .finally(() => setLoading(false));
  }, [region, kind]);

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="font-serif text-4xl text-primary mb-2">Samples library</h1>
        <p className="text-muted-foreground">Real examples written for real classrooms, free to read and adapt.</p>
      </header>
      <div className="flex gap-3 mb-6">
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
              href={`/samples/${s.id}`}
              className="block bg-card border rounded-lg p-5 hover:border-primary transition"
            >
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                {KIND_LABEL[s.kind] ?? s.kind} · {s.subject} · {s.yearGroup}
              </div>
              <div className="font-serif text-xl text-primary mb-1">{s.title}</div>
              <div className="text-sm text-muted-foreground">{s.description}</div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

export function SampleViewer() {
  const [, params] = useRoute<{ id: string }>("/samples/:id");
  const [, setLoc] = useLocation();
  const id = params?.id;
  const [s, setS] = useState<Sample | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (!id) return;
    void api.get<{ sample: Sample }>(`/samples/${id}`)
      .then((r) => setS(r.sample))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!s) return <AppShell><p>Sample not found.</p></AppShell>;

  const canCopy = s.kind === "worksheet" || s.kind === "quiz";

  const onCopy = async () => {
    if (!canCopy) return;
    setCopying(true);
    try {
      const r = await api.post<{ kind: "worksheet" | "quiz"; id: string }>(`/samples/${s.id}/copy`);
      const path = r.kind === "worksheet" ? `/worksheets/${r.id}?edit=1` : `/quizzes/${r.id}?edit=1`;
      setLoc(path);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 402)) {
        alert(err instanceof ApiError ? err.message : "Could not copy this sample.");
      }
    } finally {
      setCopying(false);
    }
  };

  return (
    <AppShell>
      <Link href="/samples" className="inline-flex items-center text-sm text-primary mb-6"><ArrowLeft className="h-4 w-4 mr-1" />All samples</Link>
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
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {canCopy && (
          <Button onClick={onCopy} disabled={copying}>
            {copying ? "Copying…" : "Copy to my library and edit"}
          </Button>
        )}
        <Link href={s.kind === "worksheet" ? "/worksheets/new" : s.kind === "quiz" ? "/quizzes/new" : s.kind === "parent_draft" ? "/parent-drafts/new" : "/plans/new"}>
          <Button variant={canCopy ? "outline" : "default"}>Make my own from scratch</Button>
        </Link>
      </div>
      {canCopy && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Copying this sample creates an editable copy in your library that you can adapt and assign digitally.
        </p>
      )}
    </AppShell>
  );
}
