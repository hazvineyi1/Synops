import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Eye, Pencil, Inbox, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ActivityPlayer } from "@/components/ActivityPlayer";
import { activitiesApi, type Activity, type ActivitySubmission } from "@/lib/activitiesApi";

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

function useActivities() {
  return useQuery({ queryKey: ["activities"], queryFn: () => activitiesApi.list() });
}

/* ── Editor ── */
function Editor({ activity, onSaved }: { activity: Activity | null; onSaved: (a: Activity) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [html, setHtml] = useState(STARTER_HTML);
  const [published, setPublished] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setTitle(activity?.title ?? "");
    setInstructions(activity?.instructions ?? "");
    setHtml(activity?.html || STARTER_HTML);
    setPublished(activity?.published ?? false);
    setPreview(false);
  }, [activity?.id]);

  const save = useMutation({
    mutationFn: () => {
      const input = { title, instructions, html, published };
      return activity ? activitiesApi.update(activity.id, input) : activitiesApi.create(input);
    },
    onSuccess: (a) => {
      toast({ title: activity ? "Activity saved" : "Activity created" });
      qc.invalidateQueries({ queryKey: ["activities"] });
      onSaved(a);
    },
    onError: (e) => toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <Button variant={preview ? "outline" : "default"} size="sm" onClick={() => setPreview(false)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
          <Button variant={preview ? "default" : "outline"} size="sm" onClick={() => setPreview(true)}><Eye className="h-4 w-4 mr-1" />Preview</Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={published} onCheckedChange={setPublished} id="pub" />
            <Label htmlFor="pub" className="text-sm">Published</Label>
          </div>
          <Button size="sm" onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="space-y-2">
          {instructions && <p className="text-muted-foreground text-sm">{instructions}</p>}
          <ActivityPlayer html={html} disabled />
          <p className="text-xs text-muted-foreground">Preview — submissions here are not recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-sm">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. UDL quick check" />
          </div>
          <div>
            <Label className="text-sm">Instructions (optional)</Label>
            <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown above the activity" />
          </div>
          <div>
            <Label className="text-sm">Activity HTML</Label>
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
              className="font-mono text-xs h-80"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Runs in a sandbox. Call <code className="text-foreground">SynopsActivity.submit(payload, score)</code> to hand in.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Submissions ── */
function payloadPreview(p: unknown): string {
  try { return JSON.stringify(p); } catch { return String(p); }
}

function Submissions({ activityId }: { activityId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ["activity-subs", activityId],
    queryFn: () => activitiesApi.submissions(activityId),
  });

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
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="font-medium px-3 py-2">Learner</th>
            <th className="font-medium px-3 py-2">Result</th>
            <th className="font-medium px-3 py-2">Score</th>
            <th className="font-medium px-3 py-2">Status</th>
            <th className="font-medium px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((s: ActivitySubmission) => (
            <tr key={s.id} className="border-b border-border/50 align-top">
              <td className="px-3 py-2">
                <div className="font-medium">{s.learnerName}</div>
                <div className="text-xs text-muted-foreground">{new Date(s.submittedAt).toLocaleString()}</div>
              </td>
              <td className="px-3 py-2 max-w-[22rem]"><code className="text-xs text-muted-foreground break-all">{payloadPreview(s.payload)}</code></td>
              <td className="px-3 py-2">{s.score ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variant={s.status === "approved" ? "default" : "secondary"}>{s.status}</Badge>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {s.status !== "approved" && (
                  <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, status: "approved" })}>Approve</Button>
                )}
                {s.status === "submitted" && (
                  <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: s.id, status: "reviewed" })}>Mark reviewed</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Page ── */
export function ActivitiesAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: activities, isLoading } = useActivities();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [rightTab, setRightTab] = useState<"edit" | "subs">("edit");

  const selected = creating ? null : activities?.find((a) => a.id === selectedId) ?? null;

  const del = useMutation({
    mutationFn: (id: string) => activitiesApi.remove(id),
    onSuccess: () => { toast({ title: "Activity deleted" }); setSelectedId(null); qc.invalidateQueries({ queryKey: ["activities"] }); },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">Interactive Activities</h1>
          <p className="text-muted-foreground">Author HTML activities learners complete and hand in.</p>
        </div>
        <Button onClick={() => { setCreating(true); setSelectedId(null); setRightTab("edit"); }}>
          <Plus className="h-4 w-4 mr-1" /> New activity
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* List */}
        <Card className="p-2 h-fit">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : !activities || activities.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No activities yet. Create one.</div>
          ) : (
            <div className="space-y-1">
              {activities.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setCreating(false); setSelectedId(a.id); setRightTab("edit"); }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    !creating && selectedId === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{a.title}</span>
                    {a.published
                      ? <span className="text-[10px] text-emerald-600 border border-emerald-500/30 rounded-full px-1.5">live</span>
                      : <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5">draft</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Detail */}
        <div>
          {creating || selected ? (
            <Card className="p-5">
              {selected && (
                <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                  <div className="flex gap-1">
                    <Button variant={rightTab === "edit" ? "default" : "outline"} size="sm" onClick={() => setRightTab("edit")}><Pencil className="h-4 w-4 mr-1" />Editor</Button>
                    <Button variant={rightTab === "subs" ? "default" : "outline"} size="sm" onClick={() => setRightTab("subs")}><Inbox className="h-4 w-4 mr-1" />Submissions</Button>
                  </div>
                  <div className="flex gap-2">
                    {selected.published && (
                      <Button variant="outline" size="sm" onClick={() => window.open(`/activities/${selected.id}/play`, "_blank")}>
                        <ExternalLink className="h-4 w-4 mr-1" /> Open as learner
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => del.mutate(selected.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {rightTab === "edit" || creating ? (
                <Editor
                  activity={selected}
                  onSaved={(a) => { setCreating(false); setSelectedId(a.id); }}
                />
              ) : (
                selected && <Submissions activityId={selected.id} />
              )}
            </Card>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">
              Select an activity to edit, or create a new one.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
