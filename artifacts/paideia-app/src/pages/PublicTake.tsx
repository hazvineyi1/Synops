import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { Check, X, HelpCircle, Loader2 } from "lucide-react";
import type { FeedbackItem, GradingStatus } from "@/lib/types";

interface WorksheetQ { number: number; prompt: string; type: string; options: string[] | null }
interface QuizI { number: number; prompt: string; type: string; options: string[] | null }
interface ResourceContent { title?: string; instructions?: string; questions?: WorksheetQ[]; items?: QuizI[] }
interface ShareResp {
  assignment: { id: string; title: string; resourceKind: "worksheet" | "quiz"; shareCode: string };
  class: { name: string };
  resource: ResourceContent;
  students: Array<{ id: string; firstName: string; lastInitial: string }>;
}
interface SubmitResp { submission: { id: string } }
interface PollResp {
  submission: {
    id: string;
    autoScore: number;
    maxAutoScore: number;
    needsReviewCount: number;
    feedback: FeedbackItem[] | null;
    gradingStatus: GradingStatus;
  };
}

export default function PublicTake() {
  const [, params] = useRoute<{ code: string }>("/take/:code");
  const [data, setData] = useState<ShareResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [polled, setPolled] = useState<PollResp["submission"] | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!params?.code) return;
    api.get<ShareResp>(`/share/${params.code}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [params?.code]);

  useEffect(() => {
    if (!submissionId || !params?.code) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.get<PollResp>(`/share/${params.code}/submissions/${submissionId}`);
        if (cancelled) return;
        setPolled(r.submission);
        if (r.submission.gradingStatus !== "graded" && r.submission.gradingStatus !== "failed") {
          timer.current = window.setTimeout(tick, 3000);
        }
      } catch {
        // swallow; will retry on next interval if still mounted
        if (!cancelled) timer.current = window.setTimeout(tick, 5000);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [submissionId, params?.code]);

  const submit = async () => {
    if (!studentId) { setError("Please pick your name from the list."); return; }
    setBusy(true); setError(null);
    try {
      const r = await api.post<SubmitResp>(`/share/${params?.code}/submit`, { studentId, answers });
      setSubmissionId(r.submission.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to submit");
      setBusy(false);
    }
  };

  if (loading) return <Shell><p className="text-muted-foreground">Loading.</p></Shell>;
  if (error && !data) return <Shell><p className="text-destructive">{error}</p></Shell>;
  if (!data) return <Shell><p>Assignment not found.</p></Shell>;

  if (submissionId) {
    const grading = !polled || polled.gradingStatus === "pending" || polled.gradingStatus === "grading";
    if (grading) {
      return (
        <Shell>
          <div className="bg-card border rounded-lg p-8 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-3" />
            <h1 className="font-serif text-3xl text-primary mb-1">Your work is being graded</h1>
            <p className="text-sm text-muted-foreground">This usually takes less than a minute. You can keep this page open.</p>
          </div>
        </Shell>
      );
    }
    if (polled.gradingStatus === "failed") {
      return (
        <Shell>
          <div className="bg-card border rounded-lg p-8 text-center">
            <h1 className="font-serif text-3xl text-primary mb-2">Submitted</h1>
            <p className="text-muted-foreground">Your answers are saved. Your teacher will mark them by hand.</p>
          </div>
        </Shell>
      );
    }
    const pct = polled.maxAutoScore > 0 ? Math.round((polled.autoScore / polled.maxAutoScore) * 100) : null;
    return (
      <Shell>
        <div className="bg-card border rounded-lg p-8 text-center">
          <h1 className="font-serif text-3xl text-primary mb-2">Graded</h1>
          {pct !== null && (
            <div className="mb-2">
              <div className="font-serif text-6xl text-primary">{pct}%</div>
              <div className="text-sm text-muted-foreground mt-1">{polled.autoScore} out of {polled.maxAutoScore}</div>
            </div>
          )}
        </div>
        <div className="mt-8">
          <h2 className="font-serif text-xl text-primary mb-3">Question by question</h2>
          <div className="space-y-3">
            {(polled.feedback ?? []).map((f) => <FeedbackRow key={f.number} f={f} />)}
          </div>
        </div>
      </Shell>
    );
  }

  const items = data.resource.items ?? data.resource.questions ?? [];

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{data.class.name}</p>
        <h1 className="font-serif text-3xl text-primary">{data.assignment.title}</h1>
        {data.resource.instructions && <p className="text-muted-foreground mt-2">{data.resource.instructions}</p>}
      </header>

      <div className="bg-card border rounded-lg p-6 mb-6">
        <Label>Who are you?</Label>
        <Select value={studentId} onValueChange={setStudentId}>
          <SelectTrigger className="mt-2"><SelectValue placeholder="Pick your name" /></SelectTrigger>
          <SelectContent>
            {data.students.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastInitial}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-2">If your name is not here, tell your teacher.</p>
      </div>

      <ol className="space-y-6">
        {items.map((q) => (
          <li key={q.number} className="bg-card border rounded-lg p-5">
            <div className="font-medium mb-3"><span className="text-primary">{q.number}.</span> {q.prompt}</div>
            {q.type === "multiple_choice" && q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, i) => (
                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-secondary/40">
                    <input
                      type="radio"
                      name={`q-${q.number}`}
                      value={opt}
                      checked={answers[String(q.number)] === opt}
                      onChange={() => setAnswers((a) => ({ ...a, [String(q.number)]: opt }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            ) : q.type === "true_false" ? (
              <div className="flex gap-3">
                {["True", "False"].map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-secondary/40 border flex-1 justify-center">
                    <input
                      type="radio"
                      name={`q-${q.number}`}
                      value={v}
                      checked={answers[String(q.number)] === v}
                      onChange={() => setAnswers((a) => ({ ...a, [String(q.number)]: v }))}
                    />
                    {v}
                  </label>
                ))}
              </div>
            ) : q.type === "short" || q.type === "short_answer" || q.type === "calculation" ? (
              <Input
                value={answers[String(q.number)] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [String(q.number)]: e.target.value }))}
                placeholder="Your answer"
              />
            ) : (
              <Textarea
                value={answers[String(q.number)] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [String(q.number)]: e.target.value }))}
                rows={4}
                placeholder="Your answer"
              />
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
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="font-serif text-xl text-primary">Synops</div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}

function FeedbackRow({ f }: { f: FeedbackItem }) {
  const Icon = f.state === "correct" ? Check : f.state === "incorrect" ? X : HelpCircle;
  const color =
    f.state === "correct" ? "text-green-700"
    : f.state === "incorrect" ? "text-destructive"
    : f.state === "partial" ? "text-amber-700"
    : "text-muted-foreground";
  return (
    <div className="bg-card border rounded-md p-4 flex items-start gap-3 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>Q{f.number}</span>
          {f.aiScore != null && f.aiMax != null && (
            <span className="font-medium text-foreground">{f.aiScore}/{f.aiMax}</span>
          )}
        </div>
        <div>You answered: <span className="font-medium">{f.given || "(blank)"}</span></div>
        {f.correct && (f.state === "incorrect" || f.state === "partial") && (
          <div className="text-xs text-muted-foreground mt-1">Expected: {f.correct}</div>
        )}
        {f.aiComment && (
          <div className="text-sm mt-2 bg-secondary/30 border rounded px-3 py-2">{f.aiComment}</div>
        )}
      </div>
    </div>
  );
}
