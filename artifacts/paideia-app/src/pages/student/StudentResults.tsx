import { useEffect, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { api, ApiError } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import { Check, X, HelpCircle, Loader2 } from "lucide-react";
import type { FeedbackItem, GradingStatus } from "@/lib/types";

interface Resp {
  submission: {
    id: string;
    autoScore: number;
    maxAutoScore: number;
    needsReviewCount: number;
    feedback: FeedbackItem[] | null;
    gradingStatus: GradingStatus;
    gradedAt: string | null;
    submittedAt: string;
  };
  assignment: { id: string; title: string; resourceKind: "worksheet" | "quiz" } | null;
}

export default function StudentResults() {
  const [, params] = useRoute<{ id: string }>("/student/submissions/:id");
  const { student, loading } = useStudentAuth();
  const [, setLoc] = useLocation();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!student) { setLoc("/student/login"); return; }
    if (!params?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await api.get<Resp>(`/student/submissions/${params.id}`);
        if (cancelled) return;
        setData(r);
        if (r.submission.gradingStatus !== "graded" && r.submission.gradingStatus !== "failed") {
          timer.current = window.setTimeout(tick, 3000);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Could not load");
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [student, loading, params?.id, setLoc]);

  if (loading || !data) {
    return <Shell><p className="text-muted-foreground">{error ?? "Loading."}</p></Shell>;
  }

  const sub = data.submission;
  const grading = sub.gradingStatus === "pending" || sub.gradingStatus === "grading";

  return (
    <Shell>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Your submission</p>
        <h1 className="font-serif text-3xl text-primary">{data.assignment?.title ?? "Assignment"}</h1>
      </header>

      {grading ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-3" />
          <h2 className="font-serif text-2xl text-primary mb-1">Your work is being graded</h2>
          <p className="text-sm text-muted-foreground">This usually takes less than a minute. You can leave this page and come back later.</p>
        </div>
      ) : sub.gradingStatus === "failed" ? (
        <div className="bg-card border rounded-lg p-8 text-center">
          <h2 className="font-serif text-2xl text-primary mb-1">Submitted</h2>
          <p className="text-sm text-muted-foreground">Your answers are saved. Your teacher will mark them by hand.</p>
        </div>
      ) : (
        <ResultsPanel sub={sub} />
      )}
    </Shell>
  );
}

function ResultsPanel({ sub }: { sub: Resp["submission"] }) {
  const pct = sub.maxAutoScore > 0 ? Math.round((sub.autoScore / sub.maxAutoScore) * 100) : null;
  return (
    <>
      <div className="bg-card border rounded-lg p-8 text-center">
        <h2 className="font-serif text-2xl text-primary mb-2">Graded</h2>
        {pct !== null && (
          <div className="my-4">
            <div className="font-serif text-6xl text-primary">{pct}%</div>
            <div className="text-sm text-muted-foreground mt-1">{sub.autoScore} out of {sub.maxAutoScore}</div>
          </div>
        )}
      </div>
      <div className="mt-8 space-y-3">
        <h3 className="font-serif text-xl text-primary mb-1">Question by question</h3>
        {(sub.feedback ?? []).map((f) => <FeedbackRow key={f.number} f={f} />)}
      </div>
    </>
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
