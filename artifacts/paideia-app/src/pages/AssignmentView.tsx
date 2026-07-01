import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Assignment, Submission, Student, ClassRow, FeedbackItem } from "@/lib/types";
import { Copy, Check, X, HelpCircle, Link as LinkIcon, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";

interface Resp {
  assignment: Assignment;
  class: ClassRow;
  submissions: Array<{ submission: Submission; student: Student | null }>;
}

export default function AssignmentView() {
  const [, params] = useRoute<{ id: string }>("/assignments/:id");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!params?.id) return;
    const r = await api.get<Resp>(`/assignments/${params.id}`);
    setData(r);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [params?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh while any submission is still being graded.
  useEffect(() => {
    if (!data) return;
    const grading = data.submissions.some(
      (s) => s.submission.gradingStatus === "pending" || s.submission.gradingStatus === "grading",
    );
    if (!grading) return;
    const t = window.setTimeout(() => { void load(); }, 4000);
    return () => window.clearTimeout(t);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!data) return <AppShell><p>Assignment not found.</p></AppShell>;

  const a = data.assignment;
  const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/take/${a.shareCode}`;

  const toggleClosed = async () => {
    await api.patch(`/assignments/${a.id}`, { closed: !a.closed });
    await load();
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <AppShell>
      <header className="mb-8">
        <Link href={`/classes/${a.classId}`} className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">Back to {data.class.name}</Link>
        <h1 className="font-serif text-4xl text-primary mt-1">{a.title}</h1>
        <p className="text-muted-foreground">{a.resourceKind} · {a.deliveryMode === "share_link" ? "Share link" : "Student accounts"}{a.closed ? " · closed" : ""}</p>
      </header>

      {a.deliveryMode === "share_link" && (
        <div className="mb-8 bg-secondary/40 border rounded-md p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium"><LinkIcon className="h-4 w-4" />Share link</div>
          <div className="flex items-center gap-2">
            <code className="text-xs flex-1 truncate bg-background border rounded px-2 py-1.5">{url}</code>
            <Button size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-8 flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleClosed}>{a.closed ? "Re-open assignment" : "Close assignment"}</Button>
      </div>

      <section>
        <h2 className="font-serif text-2xl text-primary mb-4">Submissions ({data.submissions.length})</h2>
        {data.submissions.length === 0 ? (
          <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground text-sm">
            No submissions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {data.submissions.map(({ submission, student }) => {
              const pct = submission.maxAutoScore > 0 ? Math.round((submission.autoScore / submission.maxAutoScore) * 100) : null;
              const isOpen = expanded.has(submission.id);
              const grading = submission.gradingStatus === "pending" || submission.gradingStatus === "grading";
              return (
                <div key={submission.id} className="border rounded-lg bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleRow(submission.id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-secondary/30 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {student ? (
                          <Link
                            href={`/classes/${a.classId}/students/${student.id}`}
                            className="font-medium hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {submission.displayName}
                          </Link>
                        ) : (
                          <div className="font-medium">{submission.displayName}</div>
                        )}
                        <StatusBadge status={submission.gradingStatus} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(submission.submittedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {grading ? (
                        <div className="text-sm text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Grading</div>
                      ) : pct !== null ? (
                        <div className="font-serif text-2xl text-primary">{pct}%</div>
                      ) : (
                        <div className="text-sm text-muted-foreground">No score</div>
                      )}
                      <div className="text-xs text-muted-foreground">{submission.autoScore}/{submission.maxAutoScore}</div>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  {isOpen && (
                    <SubmissionDetail submission={submission} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: Submission["gradingStatus"] }) {
  if (status === "graded") return <Badge variant="secondary" className="bg-green-100 text-green-800">Graded</Badge>;
  if (status === "failed") return <Badge variant="secondary" className="bg-amber-100 text-amber-800">Needs hand-marking</Badge>;
  return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Grading…</Badge>;
}

function SubmissionDetail({ submission }: { submission: Submission }) {
  return (
    <div className="border-t bg-secondary/20 px-5 py-5 space-y-5">
      {submission.aiSummary && (
        <div className="bg-card border rounded-md p-4">
          <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />Student analysis
          </div>
          <p className="text-sm">{submission.aiSummary.overall}</p>
          <SummaryList label="Strengths" items={submission.aiSummary.strengths} />
          <SummaryList label="Gaps" items={submission.aiSummary.gaps} />
          <SummaryList label="Recommended next steps" items={submission.aiSummary.recommendations} />
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium mb-2">Question by question</h3>
        <div className="space-y-2">
          {(submission.feedback ?? []).map((f) => <TeacherFeedbackRow key={f.number} f={f} />)}
        </div>
      </div>
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
      </div>
    </div>
  );
}
