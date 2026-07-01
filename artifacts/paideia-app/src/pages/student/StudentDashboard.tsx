import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStudentAuth } from "@/hooks/use-student-auth";
import { ArrowUpRight, Check, LogOut, MessageSquare } from "lucide-react";

interface StudentAssignment {
  id: string;
  title: string;
  resourceKind: "worksheet" | "quiz";
  className: string;
  closed: boolean;
  submitted: boolean;
  submissionId: string | null;
  createdAt: string;
}

export default function StudentDashboard() {
  const { student, signOut, loading } = useStudentAuth();
  const [, setLoc] = useLocation();
  const [items, setItems] = useState<StudentAssignment[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!student) { setLoc("/student/login"); return; }
    void api.get<{ assignments: StudentAssignment[] }>("/student/assignments")
      .then((r) => setItems(r.assignments))
      .finally(() => setLoadingItems(false));
  }, [student, loading, setLoc]);

  if (loading || !student) return null;

  const out = async () => { await signOut(); setLoc("/student/login"); };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="font-serif text-xl text-primary">Synops</div>
            <div className="text-xs text-muted-foreground">Signed in as {student.firstName} {student.lastInitial}</div>
          </div>
          <Link href="/student/tutor">
            <Button variant="ghost" size="sm" className="gap-1.5 mr-2">
              <MessageSquare className="h-4 w-4" /> Synops Coach
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={out}><LogOut className="h-4 w-4 mr-1" />Sign out</Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl text-primary mb-6">Your assignments</h1>
        {loadingItems ? (
          <p className="text-muted-foreground">Loading.</p>
        ) : items.length === 0 ? (
          <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
            No assignments yet. Your teacher will share work with you here.
          </div>
        ) : (
          <div className="divide-y border rounded-lg bg-card">
            {items.map((a) => (
              <Link
                key={a.id}
                href={a.submitted && a.submissionId ? `/student/submissions/${a.submissionId}` : a.closed ? "/student" : `/student/assignments/${a.id}`}
                className={`flex items-center justify-between px-5 py-4 ${!a.submitted && !a.closed ? "hover:bg-secondary/40" : "opacity-60"}`}
              >
                <div>
                  <div className="font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{a.resourceKind} · {a.className}{a.closed ? " · closed" : ""}</div>
                </div>
                {a.submitted ? <Check className="h-4 w-4 text-green-700" /> : <ArrowUpRight className="h-4 w-4 text-muted-foreground" />}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
