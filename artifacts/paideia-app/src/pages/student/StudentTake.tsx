import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";

interface Q { number: number; prompt: string; type: string; options: string[] | null }
interface Resp {
  assignment: { id: string; title: string; resourceKind: "worksheet" | "quiz"; closed: boolean };
  resource: { instructions?: string; questions?: Q[]; items?: Q[] };
  submission: { id: string } | null;
}
interface SubmitResp { submission: { id: string } }

export default function StudentTake() {
  const [, params] = useRoute<{ id: string }>("/student/assignments/:id");
  const { student, loading } = useStudentAuth();
  const [, setLoc] = useLocation();
  const [data, setData] = useState<Resp | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!student) { setLoc("/student/login"); return; }
    if (!params?.id) return;
    api.get<Resp>(`/student/assignments/${params.id}`)
      .then((r) => {
        setData(r);
        if (r.submission) setLoc(`/student/submissions/${r.submission.id}`);
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load"))
      .finally(() => setLoadingData(false));
  }, [student, loading, params?.id, setLoc]);

  const submit = async () => {
    if (!params?.id) return;
    setBusy(true); setError(null);
    try {
      const r = await api.post<SubmitResp>(`/student/assignments/${params.id}/submit`, { answers });
      setLoc(`/student/submissions/${r.submission.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to submit");
      setBusy(false);
    }
  };

  if (loading || loadingData) return <Shell><p className="text-muted-foreground">Loading.</p></Shell>;
  if (error && !data) return <Shell><p className="text-destructive">{error}</p></Shell>;
  if (!data) return <Shell><p>Not found.</p></Shell>;

  const items = data.resource.items ?? data.resource.questions ?? [];
  return (
    <Shell>
      <h1 className="font-serif text-3xl text-primary mb-2">{data.assignment.title}</h1>
      {data.resource.instructions && <p className="text-muted-foreground mb-6">{data.resource.instructions}</p>}
      <ol className="space-y-6">
        {items.map((q) => (
          <li key={q.number} className="bg-card border rounded-lg p-5">
            <div className="font-medium mb-3"><span className="text-primary">{q.number}.</span> {q.prompt}</div>
            {q.type === "multiple_choice" && q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-secondary/40">
                    <input type="radio" name={`q-${q.number}`} value={opt} checked={answers[String(q.number)] === opt} onChange={() => setAnswers((a) => ({ ...a, [String(q.number)]: opt }))} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : q.type === "true_false" ? (
              <div className="flex gap-3">
                {["True", "False"].map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-secondary/40 border flex-1 justify-center">
                    <input type="radio" name={`q-${q.number}`} value={v} checked={answers[String(q.number)] === v} onChange={() => setAnswers((a) => ({ ...a, [String(q.number)]: v }))} />
                    {v}
                  </label>
                ))}
              </div>
            ) : q.type === "short" || q.type === "short_answer" || q.type === "calculation" ? (
              <Input value={answers[String(q.number)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.number)]: e.target.value }))} />
            ) : (
              <Textarea value={answers[String(q.number)] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [String(q.number)]: e.target.value }))} rows={4} />
            )}
          </li>
        ))}
      </ol>
      {error && <div className="text-sm text-destructive mt-4">{error}</div>}
      <div className="mt-6">
        <Button onClick={submit} disabled={busy} size="lg" className="w-full">{busy ? "Submitting..." : "Submit answers"}</Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 font-serif text-xl text-primary">Synops</div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
