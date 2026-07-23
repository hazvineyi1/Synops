import { useEffect, useState, useCallback } from "react";
import { Redirect } from "wouter";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Sparkles } from "lucide-react";

interface Candidate { id: string; label: string; detail: string; reason: string }

/**
 * Environment Cleanup (super admin). Reviewable soft-delete of QA/test data:
 * pick candidates, soft-delete them (users -> soft-deleted, courses -> archived),
 * every action audited and reversible. No hard deletes.
 */
export default function EnvironmentCleanup() {
  const { user } = useSession();
  const { toast } = useToast();
  const [users, setUsers] = useState<Candidate[]>([]);
  const [courses, setCourses] = useState<Candidate[]>([]);
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [selCourses, setSelCourses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ users: Candidate[]; courses: Candidate[] }>("/platform/cleanup/candidates");
      setUsers(data.users);
      setCourses(data.courses);
      setSelUsers(new Set());
      setSelCourses(new Set());
    } catch {
      toast({ title: "Could not load cleanup candidates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  if (user && user.role !== "super_admin") return <Redirect to="/dashboard" />;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  async function softDelete() {
    setBusy(true);
    try {
      const r = await apiFetch<{ usersDeleted: number; coursesArchived: number }>("/platform/cleanup/soft-delete", {
        method: "POST",
        body: JSON.stringify({ users: [...selUsers], courses: [...selCourses] }),
      });
      toast({ title: "Cleanup applied", description: `${r.usersDeleted} account(s) soft-deleted, ${r.coursesArchived} course(s) archived. Reversible from the audit trail.` });
      await load();
    } catch {
      toast({ title: "Cleanup failed", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const total = selUsers.size + selCourses.size;

  const Section = ({ title, items, sel, setter }: { title: string; items: Candidate[]; sel: Set<string>; setter: (s: Set<string>) => void }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title} ({items.length})</CardTitle>
        <CardDescription>Select the QA/test items to soft-delete.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing flagged.</p>
        ) : (
          items.map((c) => (
            <label key={c.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
              <Checkbox checked={sel.has(c.id)} onCheckedChange={() => toggle(sel, setter, c.id)} className="mt-0.5" />
              <span className="flex-1">
                <span className="font-medium text-foreground">{c.label}</span>{" "}
                <span className="text-muted-foreground">- {c.detail}</span>
                <span className="mt-0.5 block text-xs text-amber-700">{c.reason}</span>
              </span>
            </label>
          ))
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="font-serif text-3xl font-bold text-foreground">Environment cleanup</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Separate QA and test data from production. Everything here is a soft-delete - accounts are
        de-activated and courses archived, both reversible, and every action is written to the audit
        trail. Nothing is hard-deleted.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Scanning...</p>
      ) : (
        <>
          <Section title="QA / test accounts" items={users} sel={selUsers} setter={setSelUsers} />
          <Section title="Duplicate / test / empty courses" items={courses} sel={selCourses} setter={setSelCourses} />

          <div className="sticky bottom-4 flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
            <span className="text-sm text-muted-foreground">{total} selected</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={total === 0 || busy} variant="destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Soft-delete selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Soft-delete {total} item(s)?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Accounts will be de-activated and courses archived. This is reversible and audited.
                    No data is permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={softDelete} className="bg-red-600 hover:bg-red-700">Soft-delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}
