import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Plus, Eye, Pencil, Inbox, Trash2, ExternalLink, Loader2, Sparkles, Code2, Share2, Link2, Copy, Check, CalendarClock, Clock, CheckCircle2, Play, Wand2, Rocket, Upload, ArrowLeft, BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { PageHeader } from "@/components/PageHeader";
import { ActivityAssignDialog } from "@/components/ActivityAssignDialog";
import { ActivityBuilder } from "@/components/ActivityBuilder";
import { AddToGradebookDialog } from "@/components/AddToGradebookDialog";
import { renderActivity, type InteractionType, type ActivitySpec } from "@/lib/activityTemplates";
import { activitiesApi, type Activity, type ActivitySubmission, type GeneratedActivity, type MyActivityAssignment } from "@/lib/activitiesApi";
import { apiFetch } from "@/lib/api";

const CAN_AUTHOR = ["super_admin", "instructional_designer", "org_admin", "partner_admin", "coach"];
const CAN_ASSIGN = ["super_admin", "instructional_designer", "org_admin", "partner_admin"];
const BLOOMS = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
const DIFFS = ["foundational", "intermediate", "advanced"];
const KINDS = ["quiz", "flashcards", "drag_drop", "matching", "scenario", "hotspot", "embed", "custom"];

const STARTER_HTML = `<!-- Author your activity here. Call SynopsActivity.submit(payload, score) to hand in. -->
<h2>Quick check</h2>
<p>What does UDL stand for?</p>
<div id="opts"></div>
<button id="go" disabled>Submit</button>
<script>
  var answer = null;
  var options = [
    { t: "Universal Design for Learning", correct: true },
    { t: "Unified Digital Lab", correct: false },
    { t: "User Data Layer", correct: false }
  ];
  var wrap = document.getElementById('opts');
  options.forEach(function(o, i){
    var b = document.createElement('button');
    b.textContent = o.t;
    b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff';
    b.onclick = function(){
      answer = i;
      Array.from(wrap.children).forEach(function(c){ c.style.borderColor = '#cbd5e1'; });
      b.style.borderColor = '#6366f1';
      document.getElementById('go').disabled = false;
    };
    wrap.appendChild(b);
  });
  document.getElementById('go').onclick = function(){
    var correct = options[answer].correct;
    SynopsActivity.submit({ chosen: options[answer].t, correct: correct }, correct ? 100 : 0);
  };
<\/script>`;

/** Pull an embed URL out of a pasted snippet (or accept a bare URL). */
function parseEmbed(raw: string): { embedUrl: string | null; html: string } {
  const t = raw.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { embedUrl: t, html: "" };
  const m = t.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (m) return { embedUrl: m[1], html: t };
  return { embedUrl: null, html: t };
}

type NewMode = "html" | "embed" | null;

function useActivities() {
  return useQuery({ queryKey: ["activities"], queryFn: () => activitiesApi.list() });
}

/* ══════════════════════════ Editor ══════════════════════════ */
function Editor({ activity, newMode, seed, onSaved }: { activity: Activity | null; newMode: NewMode; seed?: Partial<Activity> | null; onSaved: (a: Activity) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const source = activity?.source ?? seed?.source ?? (newMode === "embed" ? "embed" : "html");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [html, setHtml] = useState(STARTER_HTML);
  const [embedRaw, setEmbedRaw] = useState("");
  const [kind, setKind] = useState("custom");
  const [bloom, setBloom] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [published, setPublished] = useState(false);
  const [courseId, setCourseId] = useState<string>("");
  const [moduleId, setModuleId] = useState<string>("");

  // Course / module placement: homing an activity in a module surfaces it in that module's
  // Complete tab for learners.
  const { data: courseList } = useQuery({
    queryKey: ["courses"],
    queryFn: () => apiFetch<{ id: string; title: string }[]>("/courses"),
  });
  const { data: courseModules } = useQuery({
    queryKey: ["modules", courseId],
    queryFn: () => apiFetch<{ id: string; title: string; order: number }[]>(`/courses/${courseId}/modules`),
    enabled: !!courseId,
  });

  useEffect(() => {
    setTitle(activity?.title ?? seed?.title ?? "");
    setInstructions(activity?.instructions ?? seed?.instructions ?? "");
    setHtml(activity?.html || seed?.html || (newMode === "embed" ? "" : STARTER_HTML));
    setEmbedRaw(activity?.embedUrl || (activity?.source === "embed" ? activity?.html ?? "" : ""));
    setKind(activity?.kind ?? seed?.kind ?? (newMode === "embed" ? "embed" : "custom"));
    setBloom(activity?.bloomsLevel ?? seed?.bloomsLevel ?? "");
    setDifficulty(activity?.difficulty ?? seed?.difficulty ?? "");
    setPublished(activity?.published ?? false);
    setCourseId(activity?.courseId ?? seed?.courseId ?? "");
    setModuleId(activity?.moduleId ?? seed?.moduleId ?? "");
  }, [activity?.id, newMode, seed]);

  const isEmbed = source === "embed";
  const parsed = useMemo(() => (isEmbed ? parseEmbed(embedRaw) : { embedUrl: null, html }), [isEmbed, embedRaw, html]);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        title, instructions,
        source,
        html: isEmbed ? parsed.html : html,
        embedUrl: isEmbed ? parsed.embedUrl : null,
        kind, bloomsLevel: bloom || null, difficulty: difficulty || null,
        published,
        courseId: courseId || null,
        moduleId: moduleId || null,
      };
      return activity ? activitiesApi.update(activity.id, input) : activitiesApi.create(input);
    },
    onSuccess: (a) => { toast({ title: activity ? "Activity saved" : "Activity created" }); qc.invalidateQueries({ queryKey: ["activities"] }); onSaved(a); },
    onError: (e) => toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        <div className="flex items-center gap-2"><Switch checked={published} onCheckedChange={setPublished} id="pub" /><Label htmlFor="pub" className="text-sm">Published</Label></div>
        <Button size="sm" onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>

      <div className="space-y-3">
          <div>
            <Label className="text-sm">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UDL quick check" />
          </div>
          <div>
            <Label className="text-sm">Instructions (optional)</Label>
            <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown above the activity" />
          </div>

          {isEmbed ? (
            <div>
              <Label className="text-sm">Embed code or URL</Label>
              <Textarea value={embedRaw} onChange={(e) => setEmbedRaw(e.target.value)} spellCheck={false} className="font-mono text-xs h-40" placeholder='Paste an embed snippet (e.g. <iframe src="https://..."></iframe>) or a share URL' />
              <p className="text-xs text-muted-foreground mt-1">{parsed.embedUrl ? <>Detected embed URL: <span className="text-foreground break-all">{parsed.embedUrl}</span></> : "Paste an <iframe> from Genially, H5P, YouTube, Google Forms, etc., or a plain share URL."}</p>
            </div>
          ) : (
            <div>
              <Label className="text-sm">Activity HTML</Label>
              <Textarea value={html} onChange={(e) => setHtml(e.target.value)} spellCheck={false} className="font-mono text-xs h-80" />
              <p className="text-xs text-muted-foreground mt-1">Runs in a sandbox. Call <code className="text-foreground">SynopsActivity.submit(payload, score)</code> to hand in.</p>
            </div>
          )}

          {/* Rigor + kind */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-sm">Type</Label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm capitalize">
                {KINDS.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm">Bloom's level</Label>
              <select value={bloom} onChange={(e) => setBloom(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
                <option value="">—</option>
                {BLOOMS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm">Difficulty</Label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm capitalize">
                <option value="">—</option>
                {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Placement: home this activity in a course/module so it appears in that
              module's Complete tab for learners. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm">Course</Label>
              <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setModuleId(""); }} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
                <option value="">Standalone (no course)</option>
                {(courseList ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm">Module</Label>
              <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={!courseId} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm disabled:opacity-50">
                <option value="">{courseId ? "Whole course (not module-specific)" : "Pick a course first"}</option>
                {(courseModules ?? []).slice().sort((a, b) => a.order - b.order).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Assign to a module to surface this activity inside that module's Complete tab.</p>
        </div>
    </div>
  );
}

/* ══════════════════════════ AI generate ══════════════════════════ */
function AIGenerateDialog({ onClose, onUse }: { onClose: () => void; onUse: (g: GeneratedActivity) => void }) {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [count, setCount] = useState(4);
  const [drafts, setDrafts] = useState<GeneratedActivity[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [url, setUrl] = useState("");
  const [showUrl, setShowUrl] = useState(false);

  const gen = useMutation({
    mutationFn: () => activitiesApi.generate({ content, count }),
    onSuccess: (r) => { setDrafts(r.activities); if (!r.activities.length) toast({ title: "No activities came back", description: "Try adding more content.", variant: "destructive" }); },
    onError: (e) => toast({ title: "Generation failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const extract = useMutation({
    mutationFn: (body: { url?: string; filename?: string; dataBase64?: string }) => activitiesApi.extract(body),
    onSuccess: (r) => { setContent(r.text); toast({ title: `Imported ${r.chars.toLocaleString()} characters`, description: "Review the text below, then Generate." }); },
    onError: (e) => toast({ title: "Could not import", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const onFile = (file?: File) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast({ title: "File too large", description: "Max 20MB.", variant: "destructive" }); return; }
    const e = (file.name.split(".").pop() || "").toLowerCase();
    const reader = new FileReader();
    if (["txt", "md", "markdown", "csv", "tsv", "json", "log"].includes(e)) {
      reader.onload = () => { setContent(String(reader.result || "")); toast({ title: "File loaded" }); };
      reader.readAsText(file);
    } else {
      reader.onload = () => { const b64 = String(reader.result || "").split(",")[1] || ""; extract.mutate({ filename: file.name, dataBase64: b64 }); };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[88vh] overflow-auto rounded-xl bg-white shadow-xl border">
        <div className="sticky top-0 bg-white border-b px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4" /> Generate activities from course content</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <Label className="text-sm">Course content</Label>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border hover:bg-muted cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Upload file
                  <input type="file" className="hidden" accept=".txt,.md,.csv,.tsv,.json,.pdf,.docx,.xlsx,.xls,.pptx,.html,.htm" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
                <button type="button" onClick={() => setShowUrl((v) => !v)} className={`inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-md border transition-colors ${showUrl ? "bg-muted" : "hover:bg-muted"}`}>
                  <Link2 className="h-3.5 w-3.5" /> From URL
                </button>
              </div>
            </div>
            {showUrl && (
              <div className="flex gap-2 mb-2">
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…  or a Google Doc / Sheet share link" onKeyDown={(e) => { if (e.key === "Enter" && url.trim()) extract.mutate({ url }); }} />
                <Button size="sm" variant="outline" onClick={() => extract.mutate({ url })} disabled={!url.trim() || extract.isPending}>{extract.isPending ? "Fetching…" : "Fetch"}</Button>
              </div>
            )}
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="h-40 text-sm" placeholder="Paste a lesson, notes, a reading, learning outcomes… or use Upload file / From URL above. The AI turns it into gamified activities and decides the rigor." />
            {extract.isPending
              ? <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Reading your document…</p>
              : <p className="text-[11px] text-muted-foreground mt-1">Supports PDF, Word, PowerPoint, Excel, text, HTML, and Google Docs / Sheets links.</p>}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm">How many</Label>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <Button size="sm" onClick={() => gen.mutate()} disabled={content.trim().length < 40 || gen.isPending} className="ml-auto">
              {gen.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4 mr-1.5" /> Generate</>}
            </Button>
          </div>

          {gen.isPending && <p className="text-xs text-muted-foreground">The generator is designing gamified activities and assigning each a Bloom's level — this can take a moment.</p>}

          {drafts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{drafts.length} activities — preview, then use the ones you want.</p>
              {drafts.map((d, i) => (
                <div key={i} className="rounded-lg border">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{d.title}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-white capitalize">{d.type.replace("_", " ")}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-700 border-purple-500/30">{d.bloomsLevel}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-white capitalize">{d.difficulty}</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setPreviewIdx(previewIdx === i ? null : i)}><Eye className="h-4 w-4 mr-1" />{previewIdx === i ? "Hide" : "Preview"}</Button>
                      <Button size="sm" onClick={() => onUse(d)}>Use this</Button>
                    </div>
                  </div>
                  {d.rationale && <p className="text-xs text-muted-foreground px-3 py-1.5">{d.rationale}</p>}
                  {previewIdx === i && <div className="p-3"><ActivityPlayer html={renderActivity(d.type as InteractionType, d.spec as ActivitySpec)} disabled /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ Publish / share ══════════════════════════ */
function PublishShare({ activity }: { activity: Activity }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const { data: links } = useQuery({ queryKey: ["activity-embed-links", activity.id], queryFn: () => activitiesApi.embedLinks(activity.id), enabled: activity.published });
  const active = (links ?? []).filter((l) => l.isActive);

  const create = useMutation({
    mutationFn: () => activitiesApi.createEmbedLink(activity.id, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-embed-links", activity.id] }),
    onError: (e) => toast({ title: "Could not create link", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: (linkId: string) => activitiesApi.revokeEmbedLink(activity.id, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity-embed-links", activity.id] }),
  });
  const pub = useMutation({
    mutationFn: () => activitiesApi.update(activity.id, { published: true }),
    onSuccess: () => { toast({ title: "Published" }); qc.invalidateQueries({ queryKey: ["activities"] }); },
    onError: (e) => toast({ title: "Could not publish", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = (token: string) => `${origin}/a/${token}`;
  const snippet = (token: string) => `<iframe src="${publicUrl(token)}" width="100%" height="600" style="border:0" allowfullscreen></iframe>`;
  const copy = (text: string, key: string) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 1500); };

  if (!activity.published) return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">This activity is a draft. Publish it to get a shareable / embeddable link and to assign it.</p>
      <Button size="sm" onClick={() => pub.mutate()} disabled={pub.isPending}><Rocket className="h-4 w-4 mr-1.5" />{pub.isPending ? "Publishing…" : "Publish now"}</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {active.length === 0 ? (
        <div className="text-sm text-muted-foreground">No public link yet. <Button size="sm" variant="outline" className="ml-2" onClick={() => create.mutate()} disabled={create.isPending}><Link2 className="h-4 w-4 mr-1" />Create embed link</Button></div>
      ) : (
        <>
          {active.map((l) => (
            <div key={l.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{l.accessCount} opens</span>
                <button className="text-rose-600 hover:underline" onClick={() => revoke.mutate(l.id)}>Revoke</button>
              </div>
              <div>
                <Label className="text-xs">Public link</Label>
                <div className="flex gap-2 mt-1">
                  <Input readOnly value={publicUrl(l.token)} className="text-xs" />
                  <Button size="sm" variant="outline" onClick={() => copy(publicUrl(l.token), `u${l.id}`)}>{copied === `u${l.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Embed snippet</Label>
                <div className="flex gap-2 mt-1">
                  <Textarea readOnly value={snippet(l.token)} className="text-xs font-mono h-16" />
                  <Button size="sm" variant="outline" onClick={() => copy(snippet(l.token), `s${l.id}`)}>{copied === `s${l.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
              </div>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="h-4 w-4 mr-1" />Another link</Button>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════ Submissions ══════════════════════════ */
function payloadPreview(p: unknown): string { try { return JSON.stringify(p); } catch { return String(p); } }

function Submissions({ activityId }: { activityId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["activity-subs", activityId], queryFn: () => activitiesApi.submissions(activityId) });
  const review = useMutation({
    mutationFn: (v: { id: string; status: string }) => activitiesApi.review(v.id, { status: v.status }),
    onSuccess: () => { toast({ title: "Submission updated" }); qc.invalidateQueries({ queryKey: ["activity-subs", activityId] }); },
    onError: (e) => toast({ title: "Update failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  if (isLoading) return <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (!data || data.length === 0) return <div className="text-center text-muted-foreground py-10">No submissions yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-muted-foreground">
          <th className="font-medium px-3 py-2">Learner</th><th className="font-medium px-3 py-2">Result</th><th className="font-medium px-3 py-2">Score</th><th className="font-medium px-3 py-2">Status</th><th className="font-medium px-3 py-2"></th>
        </tr></thead>
        <tbody>
          {data.map((s: ActivitySubmission) => (
            <tr key={s.id} className="border-b border-border/50 align-top">
              <td className="px-3 py-2"><div className="font-medium">{s.learnerName}</div><div className="text-xs text-muted-foreground">{new Date(s.submittedAt).toLocaleString()}</div></td>
              <td className="px-3 py-2 max-w-[22rem]"><code className="text-xs text-muted-foreground break-all">{payloadPreview(s.payload)}</code></td>
              <td className="px-3 py-2">{s.score ?? "—"}</td>
              <td className="px-3 py-2"><Badge variant={s.status === "approved" ? "default" : "secondary"}>{s.status}</Badge></td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {s.status !== "approved" && <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, status: "approved" })}>Approve</Button>}
                {s.status === "submitted" && <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, status: "reviewed" })}>Mark reviewed</Button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════ Learner view ══════════════════════════ */
function LearnerActivities() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery({ queryKey: ["my-activity-assignments"], queryFn: () => activitiesApi.myAssignments() });
  const rows = (data ?? []).filter((a) => a.published);

  const dueLabel = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso); const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (days < 0) return { text: `Overdue by ${Math.abs(days)}d`, cls: "text-rose-700" };
    if (days === 0) return { text: "Due today", cls: "text-amber-700" };
    if (days <= 3) return { text: `Due in ${days}d`, cls: "text-amber-700" };
    return { text: `Due ${d.toLocaleDateString()}`, cls: "text-muted-foreground" };
  };
  const statusPill = (s: string) =>
    s === "completed" ? { text: "Completed", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 }
    : s === "in_progress" ? { text: "In progress", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", Icon: Clock }
    : { text: "Not started", cls: "bg-slate-500/15 text-slate-700 border-slate-500/30", Icon: Play };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader title="Activities" icon={Sparkles} subtitle="Interactive activities assigned to you." />
      {isLoading ? <Skeletons /> : rows.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">Nothing assigned yet. Check back soon.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((a: MyActivityAssignment) => {
            const due = dueLabel(a.dueDate); const st = statusPill(a.status);
            return (
              <Card key={a.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-sm leading-snug">{a.title}</h3>
                  <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${st.cls}`}><st.Icon className="h-3 w-3" />{st.text}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.bloomsLevel && <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-700 border-purple-500/30">{a.bloomsLevel}</span>}
                  {a.difficulty && <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-muted capitalize">{a.difficulty}</span>}
                </div>
                {a.instructions && <p className="text-xs text-muted-foreground line-clamp-2">{a.instructions}</p>}
                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  {due ? <span className={`text-[11px] font-medium ${due.cls}`}>{due.text}</span> : <span />}
                  <Button size="sm" onClick={() => navigate(`/activities/${a.activityId}/play`)}>{a.status === "completed" ? "Revisit" : "Start"}</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Skeletons() { return <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Card key={i} className="h-32" />)}</div>; }

/** Quick "Add to course" picker for an activity: homes it in a course (and optional module). */
function AddActivityToCourseDialog({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [courseId, setCourseId] = useState<string>(activity.courseId ?? "");
  const [moduleId, setModuleId] = useState<string>(activity.moduleId ?? "");
  const { data: courses } = useQuery({ queryKey: ["courses"], queryFn: () => apiFetch<{ id: string; title: string }[]>("/courses") });
  const { data: modules } = useQuery({ queryKey: ["modules", courseId], queryFn: () => apiFetch<{ id: string; title: string; order: number }[]>(`/courses/${courseId}/modules`), enabled: !!courseId });
  const save = useMutation({
    mutationFn: () => apiFetch(`/activities/${activity.id}`, { method: "PATCH", body: JSON.stringify({ courseId: courseId || null, moduleId: moduleId || null }) }),
    onSuccess: () => { toast({ title: courseId ? "Added to course" : "Removed from course" }); qc.invalidateQueries({ queryKey: ["activities"] }); onClose(); },
    onError: (e) => toast({ title: "Could not save", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold text-sm">Add &quot;{activity.title}&quot; to a course</div>
        <div>
          <Label className="text-sm">Course</Label>
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setModuleId(""); }} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm">
            <option value="">Standalone (not in a course)</option>
            {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-sm">Module (optional)</Label>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={!courseId} className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm disabled:opacity-50">
            <option value="">{courseId ? "Whole course (not module-specific)" : "Pick a course first"}</option>
            {(modules ?? []).slice().sort((a, b) => a.order - b.order).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>
        </div>
      </Card>
    </div>
  );
}

/* ══════════════════════════ Page ══════════════════════════ */
export function ActivitiesAdmin() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: activities, isLoading } = useActivities();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newMode, setNewMode] = useState<NewMode>(null);
  const [seed, setSeed] = useState<Partial<Activity> | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Activity | null>(null);
  const [courseFor, setCourseFor] = useState<Activity | null>(null);
  const [rightTab, setRightTab] = useState<"preview" | "edit" | "subs" | "share">("preview");

  const canAuthor = !!user && CAN_AUTHOR.includes(user.role);
  const canAssign = !!user && CAN_ASSIGN.includes(user.role);

  // When opened from a course ("Add interactive"), preselect that course so a new activity links to it.
  const search = useSearch();
  const preCourseId = new URLSearchParams(search).get("courseId") || "";

  // Learners get a dedicated assigned-activities view (no authoring).
  if (user && !canAuthor) return <LearnerActivities />;

  const selected = creating ? null : activities?.find((a) => a.id === selectedId) ?? null;
  const detailActive = creating || !!selected; // on mobile: show list OR detail, not both

  const del = useMutation({
    mutationFn: (id: string) => activitiesApi.remove(id),
    onSuccess: () => { toast({ title: "Activity deleted" }); setSelectedId(null); qc.invalidateQueries({ queryKey: ["activities"] }); },
  });

  const setPublish = useMutation({
    mutationFn: (v: { id: string; published: boolean }) => activitiesApi.update(v.id, { published: v.published }),
    onSuccess: (a) => { toast({ title: a.published ? "Published — now shareable and assignable" : "Unpublished" }); qc.invalidateQueries({ queryKey: ["activities"] }); },
    onError: (e) => toast({ title: "Could not update", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  const startNew = (mode: NewMode) => { setSeed(preCourseId ? { courseId: preCourseId } : null); setNewMode(mode); setCreating(true); setSelectedId(null); setRightTab("edit"); setNewMenu(false); };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {aiOpen && <AIGenerateDialog onClose={() => setAiOpen(false)} onUse={(g) => { setSeed({ title: g.title, instructions: g.instructions, html: renderActivity(g.type as InteractionType, g.spec as ActivitySpec), kind: g.type, bloomsLevel: g.bloomsLevel, difficulty: g.difficulty as Activity["difficulty"], source: "ai", ...(preCourseId ? { courseId: preCourseId } : {}) }); setNewMode("html"); setCreating(true); setSelectedId(null); setRightTab("edit"); setAiOpen(false); }} />}
      {preCourseId && !detailActive && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> New activities you create here will be linked to the course you came from.
        </div>
      )}
      {builderOpen && <ActivityBuilder onClose={() => setBuilderOpen(false)} onCreated={(a) => { setBuilderOpen(false); setCreating(false); setSelectedId(a.id); setRightTab("preview"); }} />}
      {assignFor && <ActivityAssignDialog activityId={assignFor.id} activityTitle={assignFor.title} onClose={() => setAssignFor(null)} />}
      {courseFor && <AddActivityToCourseDialog activity={courseFor} onClose={() => setCourseFor(null)} />}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Interactive Activities</h1>
          <p className="text-muted-foreground">Build or embed activities, or let AI generate gamified ones from your content — then publish and assign.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAiOpen(true)}><Sparkles className="h-4 w-4 mr-1.5" /> Generate with AI</Button>
          <div className="relative">
            <Button onClick={() => setNewMenu((o) => !o)}><Plus className="h-4 w-4 mr-1" /> New activity</Button>
            {newMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNewMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-60 rounded-lg border bg-white shadow-lg p-1 text-sm">
                  <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center gap-2" onClick={() => { setNewMenu(false); setBuilderOpen(true); }}><Wand2 className="h-4 w-4" /> Build interactive <span className="ml-auto text-[10px] text-muted-foreground">quiz, cards, sort…</span></button>
                  <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center gap-2" onClick={() => { setNewMenu(false); setAiOpen(true); }}><Sparkles className="h-4 w-4" /> Generate with AI</button>
                  <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center gap-2" onClick={() => startNew("embed")}><Link2 className="h-4 w-4" /> Paste embed code</button>
                  <div className="my-1 border-t" />
                  <button className="w-full text-left px-3 py-2 rounded-md hover:bg-muted flex items-center gap-2 text-muted-foreground" onClick={() => startNew("html")}><Code2 className="h-4 w-4" /> Advanced (raw HTML)</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {detailActive ? (
        <div>
          <button onClick={() => { setCreating(false); setSelectedId(null); }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All activities
          </button>
          {creating ? (
            <Card className="p-5 max-w-4xl">
              <Editor activity={null} newMode={newMode} seed={seed} onSaved={(a) => { setCreating(false); setNewMode(null); setSeed(null); setSelectedId(a.id); setRightTab("preview"); }} />
            </Card>
          ) : selected ? (
            <Card className="p-5 space-y-4 max-w-4xl">
              {/* Header: title + rigor chips + actions */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-semibold text-lg leading-tight">{selected.title}</h2>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full border ${selected.published ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/10" : "text-muted-foreground"}`}>{selected.published ? "Live" : "Draft"}</span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-muted capitalize">{(selected.kind || "custom").replace("_", " ")}</span>
                    {selected.bloomsLevel && <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-700 border-purple-500/30">{selected.bloomsLevel}</span>}
                    {selected.difficulty && <span className="text-[11px] px-1.5 py-0.5 rounded-full border bg-muted capitalize">{selected.difficulty}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!selected.published
                    ? <Button size="sm" onClick={() => setPublish.mutate({ id: selected.id, published: true })} disabled={setPublish.isPending}><Rocket className="h-4 w-4 mr-1" />{setPublish.isPending ? "Publishing…" : "Publish"}</Button>
                    : <Button size="sm" variant="outline" onClick={() => setPublish.mutate({ id: selected.id, published: false })} disabled={setPublish.isPending}>Unpublish</Button>}
                  {canAssign && selected.published && <Button variant="outline" size="sm" onClick={() => setAssignFor(selected)}><Share2 className="h-4 w-4 mr-1" />Assign</Button>}
                  {canAssign && selected.published && (
                    <AddToGradebookDialog sourceType="activity" sourceId={selected.id} title={selected.title}>
                      <Button variant="outline" size="sm"><BookOpenCheck className="h-4 w-4 mr-1" />Add to gradebook</Button>
                    </AddToGradebookDialog>
                  )}
                  {selected.published && <Button variant="outline" size="sm" onClick={() => window.open(`/activities/${selected.id}/play`, "_blank")}><ExternalLink className="h-4 w-4 mr-1" />Open as learner</Button>}
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(selected.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Tabs: Activity (rendered) is the default */}
              <div className="flex gap-1 border-b border-border pb-2 flex-wrap">
                <Button variant={rightTab === "preview" ? "default" : "ghost"} size="sm" onClick={() => setRightTab("preview")}><Eye className="h-4 w-4 mr-1" />Activity</Button>
                <Button variant={rightTab === "edit" ? "default" : "ghost"} size="sm" onClick={() => setRightTab("edit")}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                <Button variant={rightTab === "subs" ? "default" : "ghost"} size="sm" onClick={() => setRightTab("subs")}><Inbox className="h-4 w-4 mr-1" />Submissions</Button>
                <Button variant={rightTab === "share" ? "default" : "ghost"} size="sm" onClick={() => setRightTab("share")}><Share2 className="h-4 w-4 mr-1" />Publish &amp; share</Button>
              </div>

              {rightTab === "preview" ? (
                <div className="space-y-2">
                  {selected.instructions && <p className="text-sm text-muted-foreground">{selected.instructions}</p>}
                  <ActivityPlayer html={selected.html} embedUrl={selected.embedUrl} disabled />
                  <p className="text-xs text-muted-foreground">Preview — submissions here are not recorded.</p>
                </div>
              ) : rightTab === "edit" ? (
                <Editor activity={selected} newMode={null} seed={null} onSaved={(a) => { setSelectedId(a.id); setRightTab("preview"); }} />
              ) : rightTab === "share" ? (
                <PublishShare activity={selected} />
              ) : (
                <Submissions activityId={selected.id} />
              )}
            </Card>
          ) : null}
        </div>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-32" />)}</div>
      ) : !activities || activities.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">No activities yet — use “New activity” or “Generate with AI” to make one.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activities.map((a) => (
            <Card key={a.id} onClick={() => { setCreating(false); setSelectedId(a.id); setRightTab("preview"); }} className="p-4 cursor-pointer border hover:border-primary/40 hover:shadow-sm transition-colors flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm leading-snug">{a.title}</h3>
                {a.published
                  ? <span className="shrink-0 text-[10px] text-emerald-700 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-1.5 py-0.5">Live</span>
                  : <span className="shrink-0 text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">Draft</span>}
              </div>
              {a.instructions && <p className="text-xs text-muted-foreground line-clamp-2">{a.instructions}</p>}
              <div className="flex flex-wrap gap-1 mt-auto pt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-muted capitalize">{a.source === "ai" ? "AI" : a.source === "embed" ? "Embed" : (a.kind || "custom").replace("_", " ")}</span>
                {a.bloomsLevel && <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-700 border-purple-500/30">{a.bloomsLevel}</span>}
                {a.difficulty && <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-muted capitalize">{a.difficulty}</span>}
                {a.courseId && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700">In a course</span>}
              </div>
              {canAuthor && (
                <div className="pt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full" onClick={(e) => { e.stopPropagation(); setCourseFor(a); }}>
                    <Plus className="h-3 w-3" /> {a.courseId ? "Change course" : "Add to course"}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
