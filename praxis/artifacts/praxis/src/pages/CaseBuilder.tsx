import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import {
  casesApi,
  LANGUAGES,
  type CaseInput,
  type RubricCriterion,
  type EmbedLink,
} from "@/lib/casesApi";
import { API } from "@/lib/api";
import { AvatarPicker, TutorAvatar } from "@/components/TutorAvatar";
import { ArrowLeft, Sparkles, Plus, Trash2, Copy, Link2, Play } from "lucide-react";

type Tab = "case" | "rubric" | "share";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

// Convenience starting points for the AI persona — content-agnostic across entrepreneurship
// skills. Authors can use one as-is, tweak it, or write their own from scratch.
const PERSONA_PRESETS: { label: string; value: string }[] = [
  { label: "Finance & cash flow", value: "a pragmatic small-business finance mentor who thinks in cash flow, margins and runway" },
  { label: "Sales & customers", value: "a seasoned sales and customer-discovery coach who has closed and lost many deals" },
  { label: "Marketing & growth", value: "a scrappy growth-marketing strategist focused on cheap, testable ways to reach customers" },
  { label: "Operations & suppliers", value: "an operations mentor focused on process, suppliers and reliable on-time delivery" },
  { label: "Business law & contracts", value: "a plain-language business-law advisor who helps founders reason about risk and agreements" },
  { label: "Product & validation", value: "a product mentor focused on validating an idea and iterating before building" },
  { label: "People & leadership", value: "a people-and-leadership coach who helps founders hire, delegate and lead a small team" },
];

export function CaseBuilder({ params }: { params?: { caseId?: string } }) {
  const caseId = params?.caseId ?? "";
  const { user } = useSession();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("case");

  const { data, isLoading, isError } = useQuery({ queryKey: ["case", caseId], queryFn: () => casesApi.get(caseId), enabled: !!caseId, retry: false });

  const [form, setForm] = useState<CaseInput>({});
  const [criteria, setCriteria] = useState<RubricCriterion[]>([]);
  useEffect(() => {
    if (!data) return;
    setForm({
      title: data.title,
      learningObjective: data.learningObjective ?? "",
      contextBlock: data.contextBlock ?? "",
      openingQuestion: data.openingQuestion ?? "",
      focusAreas: data.focusAreas ?? [],
      guidingInstructions: data.guidingInstructions ?? "",
      aiConstraints: data.aiConstraints ?? "",
      aiPersona: data.aiPersona ?? "",
      tutorName: data.tutorName ?? "",
      tutorAvatar: data.tutorAvatar ?? "",
      language: data.language ?? "en",
      difficulty: data.difficulty,
      promptLimit: data.promptLimit,
      status: data.status,
      isLibrary: data.isLibrary,
    });
    setCriteria(data.rubric?.criteria ?? []);
  }, [data]);

  const { data: standards } = useQuery({ queryKey: ["unit-standards"], queryFn: () => casesApi.unitStandards() });
  const { data: figures } = useQuery({ queryKey: ["tutor-figures"], queryFn: () => casesApi.tutorFigures() });
  const saveFigure = useMutation({
    mutationFn: (b: { name: string; image: string }) => casesApi.createTutorFigure(b),
    onSuccess: (fig) => { qc.invalidateQueries({ queryKey: ["tutor-figures"] }); set("tutorAvatar", fig.image); toast({ title: "Face saved to your library" }); },
    onError: (e: Error) => toast({ title: "Could not save face", description: e.message, variant: "destructive" }),
  });
  const deleteFigure = useMutation({
    mutationFn: (id: string) => casesApi.deleteTutorFigure(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tutor-figures"] }),
  });

  const set = <K extends keyof CaseInput>(k: K, v: CaseInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => casesApi.update(caseId, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case", caseId] }); qc.invalidateQueries({ queryKey: ["cases"] }); toast({ title: "Saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const saveRubric = useMutation({
    mutationFn: () => casesApi.saveRubric(caseId, { criteria, totalPoints: criteria.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["case", caseId] }); toast({ title: "Rubric saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const genRubric = useMutation({
    mutationFn: () => casesApi.generateRubric(caseId),
    onSuccess: (r) => { setCriteria(r.criteria); toast({ title: "Draft rubric generated", description: "Review and save it." }); },
    onError: (e: Error) => toast({ title: "Generate failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => casesApi.remove(caseId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cases"] }); navigate("/cases"); },
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96 rounded-xl" /></div>;
  }
  // Show an error instead of an endless skeleton when the case can't be loaded (the body below
  // dereferences `data`, so it must exist past this guard — same contract as before, minus the hang).
  if (isError || !data) {
    return <div className="text-center text-muted-foreground py-16">This case could not be loaded. Please refresh or go back.</div>;
  }
  if (!data.canManage) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">You don't have permission to edit this case.</CardContent></Card>;
  }

  const totalPoints = criteria.reduce((s, c) => s + (Number(c.maxPoints) || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/cases"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-tight">{form.title || "Untitled case"}</h1>
            <Badge variant={data.status === "published" ? "default" : "outline"}>{data.status}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => set("status", form.status === "published" ? "draft" : "published")}>
            {form.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(["case", "rubric", "share"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "case" ? "Case" : t === "rubric" ? "Rubric" : "Share & embed"}
          </button>
        ))}
      </div>

      {tab === "case" && (
        <div className="space-y-5">
          <Field label="Title"><Input value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Learning objective" hint="What should the learner be able to reason about after this case?">
            <textarea className={inputCls} rows={2} value={form.learningObjective ?? ""} onChange={(e) => set("learningObjective", e.target.value)} />
          </Field>
          <Field label="AI persona" hint="Who the tutor is for this case — the expert lens its questions come from. Pick a starting point or write your own. Leave blank for a neutral entrepreneurship mentor.">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PERSONA_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set("aiPersona", p.value)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors hover:bg-muted"
                  style={{ borderColor: "hsl(43 15% 85%)", color: "hsl(43 10% 40%)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea className={inputCls} rows={2} value={form.aiPersona ?? ""} onChange={(e) => set("aiPersona", e.target.value)} placeholder="e.g. a pragmatic small-business finance mentor who thinks in cash flow, margins and runway" />
          </Field>
          <Field label="Tutor name & face" hint="Name the tutor and give it a face — learners see and hear it during the session. Pick a preset or upload your own.">
            <div className="flex items-center gap-4">
              <TutorAvatar avatar={form.tutorAvatar || "f1"} size={56} />
              <Input className="max-w-xs" value={form.tutorName ?? ""} onChange={(e) => set("tutorName", e.target.value)} placeholder="e.g. Coach Naledi" />
            </div>
            <div className="mt-3">
              <AvatarPicker
                value={form.tutorAvatar || null}
                onChange={(v) => set("tutorAvatar", v ?? "")}
                figures={figures ?? []}
                onSaveFigure={(name, image) => saveFigure.mutate({ name, image })}
                onDeleteFigure={(id) => deleteFigure.mutate(id)}
              />
            </div>
          </Field>
          <Field label="Language" hint="The language the tutor runs the dialogue in. Learners can also switch language during a session.">
            <select className={`${inputCls} max-w-xs`} value={form.language ?? "en"} onChange={(e) => set("language", e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Context / fact pattern" hint="The scenario the learner works through. The AI grounds every question strictly in this.">
            <textarea className={inputCls} rows={6} value={form.contextBlock ?? ""} onChange={(e) => set("contextBlock", e.target.value)} />
          </Field>
          <Field label="Calibrated opening question" hint="Optional. If set, the tutor opens with exactly this. Leave blank to auto-generate from context.">
            <textarea className={inputCls} rows={2} value={form.openingQuestion ?? ""} onChange={(e) => set("openingQuestion", e.target.value)} placeholder="e.g. Before we begin — what do you notice about who carries the risk here?" />
          </Field>
          <Field label="Focus areas" hint="Concepts to probe, one per line.">
            <textarea className={inputCls} rows={3} value={(form.focusAreas ?? []).join("\n")} onChange={(e) => set("focusAreas", e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
          </Field>
          <Field label="Guiding instructions" hint="What should the tutor probe or push on?">
            <textarea className={inputCls} rows={2} value={form.guidingInstructions ?? ""} onChange={(e) => set("guidingInstructions", e.target.value)} />
          </Field>
          <Field label="AI constraints" hint="Things the tutor must NEVER reveal — only lead the learner toward.">
            <textarea className={inputCls} rows={2} value={form.aiConstraints ?? ""} onChange={(e) => set("aiConstraints", e.target.value)} placeholder="e.g. Never state the outcome of the case; never name the correct legal test." />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Difficulty">
              <select className={inputCls} value={form.difficulty ?? "intermediate"} onChange={(e) => set("difficulty", e.target.value as CaseInput["difficulty"])}>
                <option value="foundational">Foundational</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </Field>
            <Field label="Prompt budget" hint="Soft target number of exchanges (3–20).">
              <Input type="number" min={3} max={20} value={form.promptLimit ?? 8} onChange={(e) => set("promptLimit", Number(e.target.value))} />
            </Field>
          </div>
          {user && ["super_admin", "instructional_designer"].includes(user.role) && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.isLibrary} onChange={(e) => set("isLibrary", e.target.checked)} />
              Publish to the shared platform library (visible to all organisations)
            </label>
          )}
          <div className="pt-4 border-t">
            <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (confirm("Delete this case? This cannot be undone.")) remove.mutate(); }}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete case
            </Button>
          </div>
        </div>
      )}

      {tab === "rubric" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Criteria for scoring reasoning. Link a criterion to a QCTO/SETA unit standard so it flows into the compliance report.</p>
              <p className="text-xs mt-1">Total: <span className={totalPoints === 100 ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>{totalPoints} pts</span></p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => genRubric.mutate()} disabled={genRubric.isPending}><Sparkles className="h-4 w-4 mr-2" />{genRubric.isPending ? "Generating…" : "AI draft"}</Button>
              <Button onClick={() => saveRubric.mutate()} disabled={saveRubric.isPending}>Save rubric</Button>
            </div>
          </div>

          {criteria.map((cr, i) => (
            <Card key={i}><CardContent className="pt-5 space-y-3">
              <div className="flex gap-2">
                <Input className="flex-1" value={cr.name} placeholder="Criterion name" onChange={(e) => setCriteria((cs) => cs.map((c, j) => j === i ? { ...c, name: e.target.value } : c))} />
                <Input type="number" className="w-24" value={cr.maxPoints} placeholder="Points" onChange={(e) => setCriteria((cs) => cs.map((c, j) => j === i ? { ...c, maxPoints: Number(e.target.value) } : c))} />
                <Button variant="ghost" size="icon" onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <Field label="Unit standard (optional)">
                <select className={inputCls} value={cr.unitStandardId ?? ""} onChange={(e) => setCriteria((cs) => cs.map((c, j) => j === i ? { ...c, unitStandardId: e.target.value || null } : c))}>
                  <option value="">— none —</option>
                  {(standards ?? []).map((s) => <option key={s.id} value={s.id}>{s.code} — {s.title}</option>)}
                </select>
              </Field>
              {cr.levels?.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {cr.levels.map((lv, k) => <div key={k} className="flex gap-2"><span className="font-medium">{lv.points}pt</span> {lv.label}: {lv.description}</div>)}
                </div>
              )}
            </CardContent></Card>
          ))}

          <Button variant="outline" className="w-full" onClick={() => setCriteria((cs) => [...cs, { name: "", maxPoints: 25, unitStandardId: null, levels: [] }])}>
            <Plus className="h-4 w-4 mr-2" /> Add criterion
          </Button>
        </div>
      )}

      {tab === "share" && <ShareTab caseId={caseId} published={data.status === "published"} onRunPreview={async () => {
        try { const s = await casesApi.startSession(caseId); navigate(`/case-run/${s.id}`); }
        catch (e) { toast({ title: "Could not start", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
      }} />}
    </div>
  );
}

function ShareTab({ caseId, published, onRunPreview }: { caseId: string; published: boolean; onRunPreview: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: links } = useQuery({ queryKey: ["case-embed-links", caseId], queryFn: () => casesApi.embedLinks(caseId) });
  const [label, setLabel] = useState("");

  const create = useMutation({
    mutationFn: () => casesApi.createEmbedLink(caseId, { label: label || undefined }),
    onSuccess: () => { setLabel(""); qc.invalidateQueries({ queryKey: ["case-embed-links", caseId] }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => casesApi.revokeEmbedLink(caseId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["case-embed-links", caseId] }),
  });

  const publicUrl = (token: string) => `${window.location.origin}${API.replace(/\/api$/, "")}/c/${token}`;

  return (
    <div className="space-y-5">
      <Card><CardContent className="pt-5 flex items-center justify-between gap-4 flex-wrap">
        <div><p className="font-medium text-sm">Preview as a learner</p><p className="text-xs text-muted-foreground">Run the case yourself to test the dialogue.</p></div>
        <Button variant="outline" onClick={onRunPreview}><Play className="h-4 w-4 mr-2" /> Preview run</Button>
      </CardContent></Card>

      <div>
        <p className="font-medium text-sm mb-1">Public embed links</p>
        <p className="text-xs text-muted-foreground mb-3">Share a case with learners who don't have a Praxis account. Anyone with the link can run it.</p>
        {!published && <p className="text-xs text-amber-600 mb-3">Publish the case first to create share links.</p>}
        <div className="flex gap-2 mb-3">
          <Input placeholder="Label (e.g. Enza cohort 3)" value={label} onChange={(e) => setLabel(e.target.value)} disabled={!published} />
          <Button onClick={() => create.mutate()} disabled={!published || create.isPending}><Link2 className="h-4 w-4 mr-2" /> Create link</Button>
        </div>
        <div className="space-y-2">
          {(links ?? []).filter((l) => l.isActive).map((l: EmbedLink) => (
            <Card key={l.id}><CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{l.label || "Untitled link"}</p>
                <p className="text-xs text-muted-foreground truncate">{publicUrl(l.token)} · {l.accessCount} opens</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(publicUrl(l.token)); toast({ title: "Copied" }); }}><Copy className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-red-600" onClick={() => revoke.mutate(l.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardContent></Card>
          ))}
          {!links?.filter((l) => l.isActive).length && published && <p className="text-sm text-muted-foreground">No active links yet.</p>}
        </div>
      </div>
    </div>
  );
}
