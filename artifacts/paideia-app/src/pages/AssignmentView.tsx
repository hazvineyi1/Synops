import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Assignment, Submission, Student, ClassRow, FeedbackItem, ClassGapReport } from "@/lib/types";
import { Copy, Check, X, HelpCircle, Link as LinkIcon, ChevronDown, ChevronUp, Loader2, BarChart3 } from "lucide-react";

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
  const [report, setReport] = useState<ClassGapReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState<string | null>(null);

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

  const gradedCount = data.submissions.filter((s) => s.submission.gradingStatus === "graded").length;

  const genReport = async () => {
    setReportErr(null);
    setReportBusy(true);
    try {
      const r = await api.post<{ report: ClassGapReport }>(`/assignments/${a.id}/class-report`, {});
      setReport(r.report);
    } catch (err) {
      setReportErr(err instanceof Error ? err.message : "Could not generate the class report.");
    } finally {
      setReportBusy(false);
    }
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

      <div className="mb-8 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={toggleClosed}>{a.closed ? "Re-open assignment" : "Close assignment"}</Button>
        <Button size="sm" onClick={genReport} disabled={reportBusy || gradedCount === 0}>
          {reportBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <BarChart3 className="h-3 w-3 mr-1" />}
          {report ? "Refresh class report" : "Generate class report"}
        </Button>
      </div>
      {gradedCount === 0 && (
        <p className="mb-6 text-xs text-muted-foreground">The class report unlocks once at least one submission has been graded.</p>
      )}
      {reportErr && <p className="mb-6 text-sm text-destructive">{reportErr}</p>}
      {report && <ClassReportView report={report} count={gradedCount} />}

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
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              Student analysis
            </div>
            {submission.aiSummary.masteryLevel && (
              <Badge variant="secondary" className="capitalize">{submission.aiSummary.masteryLevel}</Badge>
            )}
          </div>
          <p className="text-sm">{submission.aiSummary.overall}</p>
          <SummaryList label="Strengths" items={submission.aiSummary.strengths} />
          <SummaryList label="Gaps" items={submission.aiSummary.gaps} />
          {submission.aiSummary.misconceptions && submission.aiSummary.misconceptions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Misconceptions to address</div>
              <ul className="text-sm space-y-2">
                {submission.aiSummary.misconceptions.map((m, i) => (
                  <li key={i} className="border-l-2 border-amber-400 pl-3">
                    <div className="font-medium">{m.skill} <span className="text-xs text-muted-foreground">({m.bloomLevel})</span></div>
                    <div className="text-muted-foreground">Thinks: {m.whatWentWrong}</div>
                    <div>Correct idea: {m.correctIdea}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {submission.aiSummary.studyPlan && submission.aiSummary.studyPlan.length > 0 && (
            <div className="mt-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">How to close the gap</div>
              <ul className="text-sm space-y-2">
                {submission.aiSummary.studyPlan.map((s, i) => (
                  <li key={i} className="bg-secondary/30 border rounded px-3 py-2">
                    <div className="font-medium">{s.focus} <span className="text-xs text-primary">· {s.strategy}</span></div>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">{s.steps.map((st, j) => <li key={j}>{st}</li>)}</ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <SummaryList label="Recommended next steps" items={submission.aiSummary.recommendations} />
          {submission.aiSummary.nextChallenge && (
            <div className="mt-3 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Next challenge (just right): </span>
              {submission.aiSummary.nextChallenge}
            </div>
          )}
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

function ClassReportView({ report, count }: { report: ClassGapReport; count: number }) {
  return (
    <section className="mb-10 bg-card border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-3 text-primary">
        <BarChart3 className="h-5 w-5" />
        <h2 className="font-serif text-2xl">Class report</h2>
        <span className="text-xs text-muted-foreground ml-1">across {count} graded {count === 1 ? "submission" : "submissions"}</span>
      </div>
      <p className="text-sm mb-2">{report.overview}</p>
      {report.classMastery && <p className="text-sm text-muted-foreground mb-4">{report.classMastery}</p>}

      {report.topMisconceptions?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Shared misconceptions</div>
          <ul className="space-y-3">
            {report.topMisconceptions.map((m, i) => (
              <li key={i} className="border-l-2 border-amber-400 pl-3 text-sm">
                <div className="font-medium">{m.skill} <span className="text-xs text-muted-foreground">· {m.shareOfClass}{m.bloom ? ` · ${m.bloom}` : ""}</span></div>
                <div className="text-muted-foreground">Misconception: {m.misconception}</div>
                <div>Correct idea: {m.correctIdea}</div>
                <div className="mt-0.5"><span className="text-xs uppercase tracking-wider text-primary">Re-teach: </span>{m.reteach}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.questionsToRevisit?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Questions to revisit</div>
          <ul className="space-y-1.5 text-sm">
            {report.questionsToRevisit.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium shrink-0">Q{q.number}</span>
                <span className="text-muted-foreground shrink-0">{q.accuracy}</span>
                <span>{q.skill ? `${q.skill}: ` : ""}{q.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.grouping?.length > 0 && (
        <div className="mb-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Suggested grouping</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {report.grouping.map((g, i) => (
              <div key={i} className="bg-secondary/30 border rounded px-3 py-2 text-sm">
                <div className="font-medium capitalize">{g.band}</div>
                <div className="text-muted-foreground">{g.whoAndWhy}</div>
                <div className="mt-0.5">{g.action}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.wholeClassNextStep && (
        <div className="text-sm bg-secondary/40 border rounded px-3 py-2">
          <span className="text-xs uppercase tracking-wider text-primary">Whole-class next step: </span>
          {report.wholeClassNextStep}
        </div>
      )}
    </section>
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
        {f.misconception && (
          <div className="text-xs mt-1 text-amber-800">
            Misconception{f.bloom ? ` (${f.bloom})` : ""}: {f.misconception}
          </div>
        )}
      </div>
    </div>
  );
}
