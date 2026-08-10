import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { FeedbackItem, AiSubmissionSummary, WorksheetContent, QuizContent } from "@/lib/types";
import { Check, X, HelpCircle, Loader2, Sparkles, GraduationCap, ClipboardCheck, RotateCcw } from "lucide-react";

interface PreviewResult {
  autoScore: number;
  maxAutoScore: number;
  needsReviewCount: number;
  feedback: FeedbackItem[];
  aiSummary: AiSubmissionSummary;
}

interface NormalisedQuestion {
  number: number;
  prompt: string;
  type: string;
  options: string[] | null;
}

function normalise(kind: "worksheet" | "quiz", content: WorksheetContent | QuizContent): {
  instructions: string;
  questions: NormalisedQuestion[];
} {
  if (kind === "worksheet") {
    const c = content as WorksheetContent;
    return {
      instructions: c.instructions,
      questions: (c.questions ?? []).map((q) => ({
        number: q.number,
        prompt: q.prompt,
        type: q.type,
        options: q.options,
      })),
    };
  }
  const c = content as QuizContent;
  return {
    instructions: c.instructions,
    questions: (c.items ?? []).map((q) => ({
      number: q.number,
      prompt: q.prompt,
      type: q.type,
      options: q.options,
    })),
  };
}

export function InteractivePreview({
  kind,
  id,
  content,
  title,
}: {
  kind: "worksheet" | "quiz";
  id: string;
  content: WorksheetContent | QuizContent;
  title: string;
}) {
  const { instructions, questions } = normalise(kind, content);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"input" | "grading" | "done">("input");
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (n: number, v: string) => setAnswers((a) => ({ ...a, [String(n)]: v }));

  const submit = async () => {
    setPhase("grading");
    setError(null);
    try {
      const path = kind === "worksheet" ? `/worksheets/${id}/preview` : `/quizzes/${id}/preview`;
      const r = await api.post<PreviewResult>(path, { answers });
      setResult(r);
      setPhase("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong while grading. Please try again.");
      setPhase("input");
    }
  };

  const reset = () => {
    setAnswers({});
    setResult(null);
    setError(null);
    setPhase("input");
  };

  if (phase === "grading") {
    return (
      <div className="bg-card border rounded-lg p-10 text-center">
        <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin mb-3" />
        <h2 className="font-serif text-2xl text-primary mb-1">Grading your answers</h2>
        <p className="text-sm text-muted-foreground">
          This runs the same auto-marking and AI feedback your students get. It can take a few seconds.
        </p>
      </div>
    );
  }

  if (phase === "done" && result) {
    return (
      <ResultsView kind={kind} title={title} result={result} onReset={reset} />
    );
  }

  return (
    <div>
      <PreviewHint />
      {instructions && (
        <div className="bg-secondary/50 border rounded-md p-4 mb-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Instructions</div>
          <p>{instructions}</p>
        </div>
      )}

      <ol className="space-y-6">
        {questions.map((q) => (
          <li key={q.number} className="border-l-2 border-primary/30 pl-4">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-serif text-lg text-primary">Q{q.number}.</span>
              <span className="font-medium">{q.prompt}</span>
            </div>
            <AnswerInput
              type={q.type}
              options={q.options}
              name={`prev-${kind}-${q.number}`}
              value={answers[String(q.number)] ?? ""}
              onChange={(v) => set(q.number, v)}
            />
          </li>
        ))}
      </ol>

      {error && <div className="text-sm text-destructive mt-4">{error}</div>}
      <div className="mt-8">
        <Button onClick={submit} size="lg" className="w-full">Submit answers</Button>
      </div>
    </div>
  );
}

function AnswerInput({
  type,
  options,
  value,
  name,
  onChange,
}: {
  type: string;
  options?: string[] | null;
  value: string;
  name: string;
  onChange: (v: string) => void;
}) {
  if (type === "multiple_choice" && options && options.length > 0) {
    return (
      <div className="space-y-2 mt-1">
        {options.map((opt, i) => (
          <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-secondary/40">
            <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    );
  }
  if (type === "true_false") {
    return (
      <div className="flex gap-3 mt-1">
        {["True", "False"].map((v) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer p-2 rounded border flex-1 justify-center hover:bg-secondary/40">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            {v}
          </label>
        ))}
      </div>
    );
  }
  if (type === "short" || type === "short_answer" || type === "calculation") {
    return <Input className="mt-1" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />;
  }
  return <Textarea className="mt-1" rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Your answer" />;
}

function PreviewHint() {
  return (
    <p className="mb-6 text-xs text-muted-foreground bg-secondary/40 border rounded px-3 py-2">
      Interactive preview. Fill this in and submit to see exactly what a student sees after they hand it in,
      and what lands in your gradebook the moment they do. Nothing here is saved.
    </p>
  );
}

function ResultsView({
  kind,
  title,
  result,
  onReset,
}: {
  kind: "worksheet" | "quiz";
  title: string;
  result: PreviewResult;
  onReset: () => void;
}) {
  const pct = result.maxAutoScore > 0 ? Math.round((result.autoScore / result.maxAutoScore) * 100) : null;
  const summary = result.aiSummary;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <p className="text-xs text-muted-foreground bg-secondary/40 border rounded px-3 py-2 flex-1">
          Preview only — nothing is saved. This is the real auto-marking and AI feedback for this {kind}.
        </p>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" />Reset and try again
        </Button>
      </div>

      {/* SECTION A — the student's experience */}
      <section>
        <div className="flex items-center gap-2 text-primary mb-1">
          <GraduationCap className="h-5 w-5" />
          <h2 className="font-serif text-2xl">What your student sees</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          The results screen your student lands on the moment their work is graded.
        </p>

        <div className="bg-card border rounded-lg p-8 text-center">
          <h3 className="font-serif text-2xl text-primary mb-2">Graded</h3>
          {pct !== null && (
            <div className="my-4">
              <div className="font-serif text-6xl text-primary">{pct}%</div>
              <div className="text-sm text-muted-foreground mt-1">{result.autoScore} out of {result.maxAutoScore}</div>
            </div>
          )}
          {result.needsReviewCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {result.needsReviewCount} {result.needsReviewCount === 1 ? "answer needs" : "answers need"} a teacher's eye.
            </p>
          )}
        </div>

        <div className="mt-8 space-y-3">
          <h3 className="font-serif text-xl text-primary mb-1">Question by question</h3>
          {result.feedback.map((f) => <StudentFeedbackRow key={f.number} f={f} />)}
        </div>

        {summary && (
          <div className="mt-8 bg-card border rounded-lg p-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4" />Your feedback
              </div>
              {summary.masteryLevel && (
                <Badge variant="secondary" className="capitalize">{summary.masteryLevel}</Badge>
              )}
            </div>
            <p className="text-sm">{summary.overall}</p>
            <SummaryList label="What you did well" items={summary.strengths} />
            <SummaryList label="Where to focus next" items={summary.gaps} />
            {summary.studyPlan && summary.studyPlan.length > 0 && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">How to close the gap</div>
                <ul className="text-sm space-y-2">
                  {summary.studyPlan.map((s, i) => (
                    <li key={i} className="bg-secondary/30 border rounded px-3 py-2">
                      <div className="font-medium">{s.focus} <span className="text-xs text-primary">· {s.strategy}</span></div>
                      <ul className="list-disc pl-5 mt-1 space-y-0.5">{s.steps.map((st, j) => <li key={j}>{st}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <SummaryList label="Your next steps" items={summary.recommendations} />
            {summary.nextChallenge && (
              <div className="mt-3 text-sm">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Ready for more: </span>
                {summary.nextChallenge}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Divider between the two views */}
      <div className="my-10 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Teacher</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* SECTION B — what the teacher receives */}
      <section>
        <div className="flex items-center gap-2 text-primary mb-1">
          <ClipboardCheck className="h-5 w-5" />
          <h2 className="font-serif text-2xl">What lands in your gradebook</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          This is what you receive the moment a student submits.
        </p>

        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between gap-4 border-b">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium">Sample Student</div>
                <Badge variant="secondary" className="bg-green-100 text-green-800">Graded</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{title} · just now</div>
            </div>
            <div className="text-right shrink-0">
              {pct !== null ? (
                <div className="font-serif text-2xl text-primary">{pct}%</div>
              ) : (
                <div className="text-sm text-muted-foreground">No score</div>
              )}
              <div className="text-xs text-muted-foreground">{result.autoScore}/{result.maxAutoScore}</div>
            </div>
          </div>

          <div className="bg-secondary/20 px-5 py-5 space-y-5">
            {result.needsReviewCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {result.needsReviewCount} {result.needsReviewCount === 1 ? "answer needs" : "answers need"} hand-marking.
              </p>
            )}
            {summary && (
              <div className="bg-card border rounded-md p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="h-4 w-4" />Student analysis
                  </div>
                  {summary.masteryLevel && (
                    <Badge variant="secondary" className="capitalize">{summary.masteryLevel}</Badge>
                  )}
                </div>
                <p className="text-sm">{summary.overall}</p>
                <SummaryList label="Strengths" items={summary.strengths} />
                <SummaryList label="Gaps" items={summary.gaps} />
                {summary.misconceptions && summary.misconceptions.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Misconceptions to address</div>
                    <ul className="text-sm space-y-2">
                      {summary.misconceptions.map((m, i) => (
                        <li key={i} className="border-l-2 border-amber-400 pl-3">
                          <div className="font-medium">{m.skill} <span className="text-xs text-muted-foreground">({m.bloomLevel})</span></div>
                          <div className="text-muted-foreground">Thinks: {m.whatWentWrong}</div>
                          <div>Correct idea: {m.correctIdea}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summary.studyPlan && summary.studyPlan.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">How to close the gap</div>
                    <ul className="text-sm space-y-2">
                      {summary.studyPlan.map((s, i) => (
                        <li key={i} className="bg-secondary/30 border rounded px-3 py-2">
                          <div className="font-medium">{s.focus} <span className="text-xs text-primary">· {s.strategy}</span></div>
                          <ul className="list-disc pl-5 mt-1 space-y-0.5">{s.steps.map((st, j) => <li key={j}>{st}</li>)}</ul>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <SummaryList label="Recommended next steps" items={summary.recommendations} />
                {summary.nextChallenge && (
                  <div className="mt-3 text-sm">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Next challenge (just right): </span>
                    {summary.nextChallenge}
                  </div>
                )}
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium mb-2">Question by question</h3>
              <div className="space-y-2">
                {result.feedback.map((f) => <TeacherFeedbackRow key={f.number} f={f} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryList({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <ul className="text-sm list-disc pl-5 space-y-0.5">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function StudentFeedbackRow({ f }: { f: FeedbackItem }) {
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

function TeacherFeedbackRow({ f }: { f: FeedbackItem }) {
  const Icon = f.state === "correct" ? Check : f.state === "incorrect" ? X : HelpCircle;
  const color =
    f.state === "correct" ? "text-green-700"
    : f.state === "incorrect" ? "text-destructive"
    : f.state === "partial" ? "text-amber-700"
    : "text-muted-foreground";
  return (
    <div className="bg-card border rounded-md p-3 flex items-start gap-3 text-sm">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>Q{f.number}</span>
          {f.skill && <span>· {f.skill}</span>}
          {f.aiScore != null && f.aiMax != null && (
            <span className="font-medium text-foreground">{f.aiScore}/{f.aiMax}</span>
          )}
        </div>
        <div>Student answered: <span className="font-medium">{f.given || "(blank)"}</span></div>
        {f.correct && <div className="text-xs text-muted-foreground mt-0.5">Marking key: {f.correct}</div>}
        {f.aiComment && (
          <div className="text-sm mt-2 bg-secondary/30 border rounded px-3 py-2">{f.aiComment}</div>
        )}
        {f.misconception && (
          <div className="text-xs mt-1 text-amber-800">
            Misconception{f.bloom ? ` (${f.bloom})` : ""}: {f.misconception}
          </div>
        )}
      </div>
    </div>
  );
}
