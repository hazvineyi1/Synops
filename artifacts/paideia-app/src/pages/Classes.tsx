import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog } from "@/hooks/use-catalog";
import type { ClassRow } from "@/lib/types";
import { Users, Plus } from "lucide-react";

export default function Classes() {
  const { teacher } = useAuth();
  const { regions } = useCatalog();
  const region = regions.find((r) => r.id === teacher?.region);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [subject, setSubject] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const r = await api.get<{ classes: ClassRow[] }>("/classes");
    setClasses(r.classes);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!teacher || !name || !yearGroup) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/classes", {
        name,
        yearGroup,
        subject: subject || undefined,
        region: teacher.region,
      });
      setOpen(false);
      setName(""); setYearGroup(""); setSubject("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create class");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <header className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-sm tracking-wider uppercase text-muted-foreground mb-1">Your classes</p>
          <h1 className="font-serif text-4xl text-primary">Class lists</h1>
          <p className="text-muted-foreground mt-2">Group your students, push out work, and track results.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New class</Button>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading.</div>
      ) : classes.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground">
          <p>No classes yet. Create one to start adding students.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((c) => (
            <Link key={c.id} href={`/classes/${c.id}`} className="block bg-card border rounded-lg p-5 hover:border-primary transition">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                <Users className="h-3 w-3" />
                {c.yearGroup}{c.subject ? ` · ${c.subject}` : ""}
              </div>
              <div className="font-serif text-xl text-primary mb-1">{c.name}</div>
              <div className="text-sm text-muted-foreground">{c.studentCount ?? 0} students</div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-primary">New class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Class name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 8B Science" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Year group</Label>
                <Select value={yearGroup} onValueChange={setYearGroup}>
                  <SelectTrigger><SelectValue placeholder="Pick" /></SelectTrigger>
                  <SelectContent>
                    {region?.yearGroups.map((y) => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject (optional)</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {region?.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !name || !yearGroup}>{busy ? "Creating..." : "Create class"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
