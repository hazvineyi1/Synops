import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Users, GraduationCap, Plus, Copy, Check, BarChart3, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Cohorts() {
  const { toast } = useToast();
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [instName, setInstName] = useState("");
  const [cohortName, setCohortName] = useState("");
  const [cohortExam, setCohortExam] = useState("");
  const [selectedInst, setSelectedInst] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        fetch("/api/cohorts/mine", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/institutions/mine", { credentials: "include" }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setCohorts(Array.isArray(c) ? c : []);
      setInstitutions(Array.isArray(i) ? i : []);
      setSelectedInst((prev) => (prev === "" && Array.isArray(i) && i.length ? i[0].id : prev));
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const post = async (url: string, body?: any) => {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || busy) return;
    setBusy(true);
    try {
      const { ok, data } = await post("/api/cohorts/join", { code: joinCode.trim() });
      if (ok && data?.joined) {
        setJoinCode("");
        toast({ title: "Joined cohort", description: data.cohort?.name });
        refresh();
      } else {
        toast({ title: "Could not join", description: data?.error ?? "Check the code.", variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInstitution = async () => {
    if (!instName.trim() || busy) return;
    setBusy(true);
    try {
      const { ok, data } = await post("/api/institutions", { name: instName.trim() });
      if (ok) {
        setInstName("");
        toast({ title: "Institution created" });
        await refresh();
        if (data?.id) setSelectedInst(data.id);
      } else {
        toast({ title: "Could not create", description: data?.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateCohort = async () => {
    if (!selectedInst || !cohortName.trim() || busy) return;
    setBusy(true);
    try {
      const { ok, data } = await post("/api/cohorts", {
        institutionId: selectedInst,
        name: cohortName.trim(),
        examName: cohortExam.trim() || undefined,
      });
      if (ok) {
        setCohortName("");
        setCohortExam("");
        toast({ title: "Cohort created", description: data?.joinCode ? `Share code: ${data.joinCode}` : undefined });
        refresh();
      } else {
        toast({ title: "Could not create", description: data?.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const openDashboard = async (cohortId: number) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/cohorts/${cohortId}/dashboard`, { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok) setDashboard(data);
      else toast({ title: "Could not load dashboard", description: data?.error, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="p-4 md:p-6 md:px-8 border-b border-border bg-background/95 sticky top-0 z-10">
        <h1 className="font-serif text-xl md:text-2xl text-primary font-medium">Cohorts</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Study with a group, or run a cohort as an instructor.
        </p>
      </div>

      <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
        {/* Join */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Join a cohort
            </CardTitle>
            <CardDescription>Enter the code your instructor shared.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Cohort code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="flex-1 font-mono"
            />
            <Button onClick={handleJoin} disabled={busy || !joinCode.trim()} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Join
            </Button>
          </CardContent>
        </Card>

        {/* My cohorts */}
        <div>
          <h2 className="font-serif text-lg font-medium text-foreground mb-3">Your cohorts</h2>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : cohorts.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-border rounded-xl bg-muted/20">
              <p className="text-muted-foreground text-sm">You are not in any cohort yet. Join one above, or create one below.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cohorts.map((c) => (
                <div key={c.id} className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{c.name}</h3>
                      {c.examName && <p className="text-xs text-muted-foreground mt-0.5">{c.examName}</p>}
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.role === "instructor" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {c.role === "instructor" ? "Instructor" : "Member"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" /> {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                  </div>
                  {c.joinCode && (
                    <div className="mt-3 flex items-center gap-2">
                      <code className="text-xs bg-background border border-border rounded px-2 py-1 font-mono">{c.joinCode}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyCode(c.joinCode)} aria-label="Copy code">
                        {copiedCode === c.joinCode ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  )}
                  {c.role === "instructor" && (
                    <Button variant="outline" size="sm" className="mt-4 gap-2 self-start" onClick={() => openDashboard(c.id)} disabled={busy}>
                      <BarChart3 className="w-4 h-4" /> View dashboard
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructor tools */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-primary" /> Run a cohort
            </CardTitle>
            <CardDescription>Create an institution, then a cohort, and share its code with learners.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {institutions.length === 0 ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <Input placeholder="Institution name" value={instName} onChange={(e) => setInstName(e.target.value)} className="flex-1" />
                <Button onClick={handleCreateInstitution} disabled={busy || !instName.trim()} className="gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create institution
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={selectedInst}
                    onChange={(e) => setSelectedInst(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                  <Input placeholder="Cohort name (e.g. Spring PMP)" value={cohortName} onChange={(e) => setCohortName(e.target.value)} />
                  <Input placeholder="Exam (e.g. PMP, optional)" value={cohortExam} onChange={(e) => setCohortExam(e.target.value)} />
                  <Button onClick={handleCreateCohort} disabled={busy || !cohortName.trim()} className="gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create cohort
                  </Button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
                  <Input placeholder="New institution name" value={instName} onChange={(e) => setInstName(e.target.value)} className="flex-1" />
                  <Button variant="outline" onClick={handleCreateInstitution} disabled={busy || !instName.trim()} className="gap-2">
                    <Plus className="w-4 h-4" /> Add institution
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructor dashboard */}
        {dashboard && (
          <Card className="shadow-sm border-l-4 border-l-primary bg-card">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-serif flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" /> {dashboard.cohort?.name} — dashboard
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDashboard(null)} aria-label="Close">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              {dashboard.aggregate && (
                <CardDescription>
                  {dashboard.aggregate.learners} learners · avg readiness {dashboard.aggregate.avgReadiness}% · avg {dashboard.aggregate.avgMastered} concepts mastered · {dashboard.aggregate.totalCheckpoints} checkpoints total
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(!dashboard.members || dashboard.members.length === 0) ? (
                <p className="text-sm text-muted-foreground">No members yet. Share the cohort code to get learners in.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="py-2 pr-4 font-medium">Learner</th>
                      <th className="py-2 pr-4 font-medium">Readiness</th>
                      <th className="py-2 pr-4 font-medium">Mastered</th>
                      <th className="py-2 pr-4 font-medium">Accuracy</th>
                      <th className="py-2 pr-4 font-medium">Checks</th>
                      <th className="py-2 font-medium">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.members.map((m: any) => (
                      <tr key={m.userId} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-foreground truncate max-w-[180px]">{m.name || m.email || "Learner"}</div>
                          {m.role === "instructor" && <span className="text-[10px] text-primary">instructor</span>}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">{m.readinessPercent}%</td>
                        <td className="py-2 pr-4 tabular-nums">{m.mastered}/{m.conceptsTotal}</td>
                        <td className="py-2 pr-4 tabular-nums">{m.accuracyPct}%</td>
                        <td className="py-2 pr-4 tabular-nums">{m.checkpointsCompleted}</td>
                        <td className="py-2 text-muted-foreground">{m.lastActive ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
