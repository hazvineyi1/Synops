import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useCatalog } from "@/hooks/use-catalog";
import { api, ApiError } from "@/lib/api";
import type { Teacher, ClassProfile } from "@/lib/types";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import MfaSettings from "@/components/MfaSettings";

export default function Settings() {
  const { teacher, setTeacher } = useAuth();
  const { regions } = useCatalog();

  const [name, setName] = useState(teacher?.name ?? "");
  const [region, setRegion] = useState(teacher?.region ?? "");
  const [country, setCountry] = useState(teacher?.country ?? "");
  const [schoolName, setSchoolName] = useState(teacher?.schoolName ?? "");
  const [subjects, setSubjects] = useState<string[]>(teacher?.subjects ?? []);
  const [yearGroups, setYearGroups] = useState<string[]>(teacher?.yearGroups ?? []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (teacher) {
      setName(teacher.name);
      setRegion(teacher.region);
      setCountry(teacher.country ?? "");
      setSchoolName(teacher.schoolName ?? "");
      setSubjects(teacher.subjects);
      setYearGroups(teacher.yearGroups);
    }
  }, [teacher]);

  const r = regions.find((x) => x.id === region);

  const toggle = (list: string[], val: string, set: (v: string[]) => void) => {
    set(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setStatus(null);
    try {
      const res = await api.patch<{ teacher: Teacher }>("/auth/me", {
        name, region, country: country || null, schoolName: schoolName || null, subjects, yearGroups,
      });
      setTeacher(res.teacher);
      setStatus("Saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <header className="mb-8">
        <h1 className="font-serif text-4xl text-primary mb-2">Settings</h1>
        <p className="text-muted-foreground">Update your teaching context. This shapes every prompt.</p>
      </header>
      <form onSubmit={save} className="space-y-6 bg-card border rounded-lg p-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{regions.map((rg) => <SelectItem key={rg.id} value={rg.id}>{rg.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="school">School</Label><Input id="school" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} /></div>
        </div>
        {r && (
          <>
            <div className="space-y-2">
              <Label>Subjects</Label>
              <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-3 bg-secondary/50 rounded-md border">
                {r.subjects.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={subjects.includes(s)} onCheckedChange={() => toggle(subjects, s, setSubjects)} />{s}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Year groups</Label>
              <div className="grid grid-cols-4 gap-2 max-h-44 overflow-y-auto p-3 bg-secondary/50 rounded-md border">
                {r.yearGroups.map((y) => (
                  <label key={y.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={yearGroups.includes(y.value)} onCheckedChange={() => toggle(yearGroups, y.value, setYearGroups)} />{y.label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {error && <div className="text-sm text-destructive">{error}</div>}
        {status && <div className="text-sm text-primary">{status}</div>}
        <Button type="submit" disabled={busy}>Save changes</Button>
      </form>
      <ClassProfilesSection />
      <MfaSettings />
    </AppShell>
  );
}

function ClassProfilesSection() {
  const [profiles, setProfiles] = useState<ClassProfile[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [yearGroup, setYearGroup] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [languageLevel, setLanguageLevel] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api.get<{ profiles: ClassProfile[] }>("/profiles");
      setProfiles(r.profiles);
    } catch { /* ignore */ }
  }
  useEffect(() => { void load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post("/profiles", {
        name, subject, yearGroup,
        syllabus: syllabus || null,
        languageLevel: languageLevel || null,
        notes: notes || null,
      });
      setName(""); setSubject(""); setYearGroup(""); setSyllabus(""); setLanguageLevel(""); setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this class profile?")) return;
    await api.del(`/profiles/${id}`);
    await load();
  }

  return (
    <section className="mt-10">
      <header className="mb-4">
        <h2 className="font-serif text-2xl text-primary">Class profiles</h2>
        <p className="text-sm text-muted-foreground">Save the classes you teach. Pick one in any planner form and we'll pre-fill subject, year group, and notes for you.</p>
      </header>
      <div className="bg-card border rounded-lg p-6 mb-6">
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No class profiles yet. Add one below.</p>
        ) : (
          <div className="divide-y -my-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-start gap-3 py-3">
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.subject} · {p.yearGroup}{p.syllabus ? ` · ${p.syllabus}` : ""}{p.languageLevel ? ` · ${p.languageLevel}` : ""}</div>
                  {p.notes ? <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.notes}</div> : null}
                </div>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={add} className="space-y-4 bg-card border rounded-lg p-6">
        <h3 className="font-serif text-lg text-primary">Add a class profile</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="cp-name">Name</Label><Input id="cp-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Form 2 Maths" /></div>
          <div className="space-y-2"><Label htmlFor="cp-sub">Subject</Label><Input id="cp-sub" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" /></div>
          <div className="space-y-2"><Label htmlFor="cp-yr">Year group</Label><Input id="cp-yr" required value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} placeholder="e.g. Form 2" /></div>
          <div className="space-y-2"><Label htmlFor="cp-sy">Syllabus</Label><Input id="cp-sy" value={syllabus} onChange={(e) => setSyllabus(e.target.value)} placeholder="e.g. ZIMSEC O Level" /></div>
          <div className="space-y-2"><Label htmlFor="cp-lang">Language level</Label><Input id="cp-lang" value={languageLevel} onChange={(e) => setLanguageLevel(e.target.value)} placeholder="e.g. English B1" /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="cp-notes">Notes</Label><Textarea id="cp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything to remember for this class: pace, behaviour, specific learners." /></div>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Add profile"}</Button>
      </form>
    </section>
  );
}
