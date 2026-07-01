import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import type { ClassRow, Student, Assignment } from "@/lib/types";

interface AssignmentWithCounts extends Assignment {
  submissionCount: number;
  gradedCount: number;
  pendingCount: number;
}
import { Plus, Trash2, ArrowUpRight, Link as LinkIcon, Users, Copy, Check } from "lucide-react";

export default function ClassView() {
  const [, params] = useRoute<{ id: string }>("/classes/:id");
  const [, setLoc] = useLocation();
  const id = params?.id;
  const [cls, setCls] = useState<ClassRow | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastInitial, setLastInitial] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const r = await api.get<{ class: ClassRow; students: Student[]; assignments: AssignmentWithCounts[] }>(`/classes/${id}`);
    setCls(r.class); setStudents(r.students); setAssignments(r.assignments);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addStudent = async () => {
    if (!firstName || !lastInitial) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/classes/${id}/students`, {
        firstName,
        lastInitial,
        email: email || undefined,
        password: password || undefined,
      });
      setFirstName(""); setLastInitial(""); setEmail(""); setPassword("");
      setOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add student");
    } finally { setBusy(false); }
  };

  const removeStudent = async (sid: string) => {
    if (!confirm("Remove this student?")) return;
    await api.del(`/classes/${id}/students/${sid}`);
    await load();
  };

  const deleteClass = async () => {
    if (!confirm("Delete this class and all its assignments and submissions?")) return;
    await api.del(`/classes/${id}`);
    setLoc("/classes");
  };

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;
  if (!cls) return <AppShell><p>Class not found.</p></AppShell>;

  return (
    <AppShell>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/classes" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">All classes</Link>
          <h1 className="font-serif text-4xl text-primary mt-1">{cls.name}</h1>
          <p className="text-muted-foreground">{cls.yearGroup}{cls.subject ? ` · ${cls.subject}` : ""}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={deleteClass}><Trash2 className="h-4 w-4 mr-1" />Delete class</Button>
      </header>

      <section className="mb-12">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-serif text-2xl text-primary">Students ({students.length})</h2>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Add student</Button>
        </div>
        {students.length === 0 ? (
          <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground text-sm">
            No students yet. Add students so you can publish assignments to this class.
          </div>
        ) : (
          <div className="divide-y border rounded-lg bg-card">
            {students.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <Link href={`/classes/${id}/students/${s.id}`} className="flex-1 hover:text-primary">
                  <div className="font-medium">{s.firstName} {s.lastInitial}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.email ? <>Account: {s.email}</> : <>No account</>} · Code <code className="font-mono">{s.joinCode}</code>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Link href={`/classes/${id}/students/${s.id}`}>
                    <Button variant="ghost" size="sm"><ArrowUpRight className="h-4 w-4" /></Button>
                  </Link>
                  <Button variant="ghost" size="sm" onClick={() => removeStudent(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl text-primary mb-4">Assignments ({assignments.length})</h2>
        {assignments.length === 0 ? (
          <div className="bg-card border rounded-lg p-6 text-center text-muted-foreground text-sm">
            No assignments yet. Open any worksheet or quiz and choose "Assign to a class".
          </div>
        ) : (
          <div className="divide-y border rounded-lg bg-card">
            {assignments.map((a) => {
              const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/take/${a.shareCode}`;
              return (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/assignments/${a.id}`} className="flex-1 hover:text-primary">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        {a.resourceKind} · {a.deliveryMode === "share_link" ? <><LinkIcon className="h-3 w-3" />Share link</> : <><Users className="h-3 w-3" />Accounts</>}
                        {a.closed && <span className="text-destructive">· closed</span>}
                        {a.submissionCount > 0 && (
                          <span>
                            · {a.submissionCount} submission{a.submissionCount === 1 ? "" : "s"}
                            {a.pendingCount > 0 && (
                              <span className="text-amber-700"> ({a.pendingCount} pending)</span>
                            )}
                          </span>
                        )}
                      </div>
                    </Link>
                    <Link href={`/assignments/${a.id}`}>
                      <Button variant="ghost" size="sm">View submissions</Button>
                    </Link>
                  </div>
                  {a.deliveryMode === "share_link" && (
                    <div className="mt-2 flex items-center gap-2 bg-secondary/40 border rounded-md p-2">
                      <code className="text-xs flex-1 truncate">{url}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => { await navigator.clipboard.writeText(url); setCopiedCode(a.id); setTimeout(() => setCopiedCode(null), 1500); }}
                      >
                        {copiedCode === a.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">Add student</DialogTitle>
            <DialogDescription>Only the first name and last initial are required. Add an email and password if this student needs their own login.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last initial</Label>
                <Input value={lastInitial} onChange={(e) => setLastInitial(e.target.value)} maxLength={4} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@school.example" />
            </div>
            <div className="space-y-2">
              <Label>Password (required if email is set)</Label>
              <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
              <p className="text-xs text-muted-foreground">You can share this with the student. They can also log in with their join code instead of email.</p>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={addStudent} disabled={busy || !firstName || !lastInitial}>{busy ? "Adding..." : "Add student"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
