import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Student, Submission, Assignment } from "@/lib/types";
import { FileText } from "lucide-react";

interface ProfileResponse {
  student: Student;
  submissions: Array<{ submission: Submission; assignment: Assignment }>;
}

export default function StudentProfile() {
  const [, params] = useRoute<{ id: string; studentId: string }>("/classes/:id/students/:studentId");
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id || !params?.studentId) return;
    void api
      .get<ProfileResponse>(`/classes/${params.id}/students/${params.studentId}/profile`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [params?.id, params?.studentId]);

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!data) return <AppShell><p>Student not found.</p></AppShell>;

  const s = data.student;
  const subs = data.submissions;
  const scored = subs.filter((x) => x.submission.maxAutoScore > 0);
  const avg = scored.length > 0
    ? Math.round(scored.reduce((acc, x) => acc + (x.submission.autoScore / x.submission.maxAutoScore) * 100, 0) / scored.length)
    : null;

  return (
    <AppShell>
      <header className="mb-8">
        <Link href={`/classes/${params?.id}`} className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">Back to class</Link>
        <h1 className="font-serif text-4xl text-primary mt-1">{s.firstName} {s.lastInitial}</h1>
        <p className="text-muted-foreground">{s.email ? `Account: ${s.email}` : "No account"} · Join code <code className="font-mono">{s.joinCode}</code></p>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-10">
        <Stat label="Assessments captured" value={subs.length} />
        <Stat label="Auto-graded average" value={avg !== null ? `${avg}%` : "-"} />
        <Stat label="Items awaiting review" value={subs.reduce((a, x) => a + x.submission.needsReviewCount, 0)} />
      </div>

      <section className="mb-10">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-serif text-2xl text-primary">Grade history</h2>
        </div>
        {subs.length === 0 ? (
          <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground text-sm">
            No completed assignments yet.
          </div>
        ) : (
          <div className="divide-y border rounded-lg bg-card">
            {subs.map(({ submission, assignment }) => {
              const pct = submission.maxAutoScore > 0 ? Math.round((submission.autoScore / submission.maxAutoScore) * 100) : null;
              return (
                <div key={submission.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{assignment.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {assignment.resourceKind} · {new Date(submission.submittedAt).toLocaleDateString()}
                      {submission.needsReviewCount > 0 && <> · {submission.needsReviewCount} need teacher review</>}
                    </div>
                  </div>
                  <div className="text-right">
                    {pct !== null ? (
                      <div className="font-serif text-2xl text-primary">{pct}%</div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Needs review</div>
                    )}
                    <div className="text-xs text-muted-foreground">{submission.autoScore}/{submission.maxAutoScore} auto</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-secondary/40 border rounded-lg p-6">
        <h3 className="font-serif text-xl text-primary mb-1">Plan a personalised lesson</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Use this student's grade history to shape a lesson plan. The plan will target weak skills in the support tier and build on strong skills in the stretch tier.
        </p>
        <Link href={`/plans/new?studentId=${s.id}&studentName=${encodeURIComponent(`${s.firstName} ${s.lastInitial}`)}`}>
          <Button><FileText className="h-4 w-4 mr-2" />Plan a lesson for {s.firstName}</Button>
        </Link>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border rounded-lg p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-serif text-3xl text-primary mt-2">{value}</div>
    </div>
  );
}
