import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import StudyNav from "@/components/StudyNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Badge } from "@/components/ui/badge";
import { useStudyKnowledgeGraph } from "@/hooks/use-study-api";
import { useListStudyMaterials } from "@workspace/paideia-api-client";
import {
  TrendingUp, Target, AlertCircle, Award, CheckCircle2,
  Sparkles, BookOpen, GraduationCap, Loader2, Flame,
  ChevronRight, Network, Brain,
} from "lucide-react";

type Node = {
  id: string;
  label: string;
  description?: string | null;
  category?: string | null;
  masteryLevel: number;
  confidenceScore?: number;
};

function band(m: number): "gap" | "developing" | "strong" {
  if (m < 0.4) return "gap";
  if (m < 0.75) return "developing";
  return "strong";
}

const BAND_META = {
  gap:        { label: "Gap",        color: "text-rose-600",    bg: "bg-rose-500/10",    bar: "bg-rose-500" },
  developing: { label: "Developing", color: "text-amber-600",   bg: "bg-amber-500/10",   bar: "bg-amber-500" },
  strong:     { label: "Strong",     color: "text-emerald-600", bg: "bg-emerald-500/10", bar: "bg-emerald-500" },
} as const;

export default function StudyProgress() {
  const [, setLoc] = useLocation();
  const { data: knowledge, isLoading } = useStudyKnowledgeGraph();
  const { data: materials } = useListStudyMaterials();
  const [starting, setStarting] = useState(false);

  const nodes: Node[] = useMemo(() => {
    const ns: any[] = knowledge?.nodes ?? [];
    return ns.map((n) => ({ ...n, masteryLevel: typeof n.masteryLevel === "number" ? n.masteryLevel : 0 }));
  }, [knowledge]);

  const stats = useMemo(() => {
    if (!nodes.length) return { avg: 0, gaps: 0, developing: 0, strong: 0, total: 0 };
    let gaps = 0, developing = 0, strong = 0;
    let sum = 0;
    for (const n of nodes) {
      sum += n.masteryLevel;
      const b = band(n.masteryLevel);
      if (b === "gap") gaps++;
      else if (b === "developing") developing++;
      else strong++;
    }
    return { avg: sum / nodes.length, gaps, developing, strong, total: nodes.length };
  }, [nodes]);

  const gapNodes = useMemo(
    () => [...nodes].filter((n) => band(n.masteryLevel) === "gap").sort((a, b) => a.masteryLevel - b.masteryLevel),
    [nodes],
  );
  const strongNodes = useMemo(
    () => [...nodes].filter((n) => band(n.masteryLevel) === "strong").sort((a, b) => b.masteryLevel - a.masteryLevel),
    [nodes],
  );
  const dailyPlan = useMemo(() => {
    const ranked = [...nodes].sort((a, b) => a.masteryLevel - b.masteryLevel);
    return ranked.slice(0, 3);
  }, [nodes]);

  const startGuided = async (socratic: boolean) => {
    setStarting(true);
    try {
      const r = await fetch("/api/study/tutor/guided/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ socratic }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        notifyError(e?.error, "Could not start the session.");
        setStarting(false);
        return;
      }
      const data = await r.json();
      setLoc(`/tutor/guided/${data.conversation.id}`);
    } catch {
      notifyError(undefined, "Could not start the session.");
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />
      <main className="max-w-5xl mx-auto px-3 sm:px-5 py-5 sm:py-6 space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">Progress</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            How well you know each concept, where the gaps are, and what to study today.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : nodes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-3">
              <Network className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <div className="font-semibold">No knowledge to track yet</div>
                <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Upload study material and generate your knowledge map. Progress and gaps will appear here as you study.
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => setLoc("/materials/new")}>
                  <BookOpen className="h-4 w-4 mr-1.5" /> Add material
                </Button>
                <Button variant="outline" onClick={() => setLoc("/knowledge-map")}>
                  Open knowledge map
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mastery summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Card>
                <CardContent className="p-3.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Overall mastery</div>
                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-2xl font-bold">{Math.round(stats.avg * 100)}%</span>
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{stats.total} concepts tracked</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-rose-500" /> Gaps
                  </div>
                  <div className="text-2xl font-bold mt-1 text-rose-600">{stats.gaps}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">below 40%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Flame className="h-3 w-3 text-amber-500" /> Developing
                  </div>
                  <div className="text-2xl font-bold mt-1 text-amber-600">{stats.developing}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">40 – 75%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3.5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Award className="h-3 w-3 text-emerald-500" /> Strong
                  </div>
                  <div className="text-2xl font-bold mt-1 text-emerald-600">{stats.strong}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">above 75%</div>
                </CardContent>
              </Card>
            </div>

            {/* Daily plan */}
            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-sm">Your plan for today</h2>
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-0 hover:bg-primary/15">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI-picked
                    </Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => startGuided(false)} disabled={starting} className="gap-1.5">
                      {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                      Start guided
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => startGuided(true)} disabled={starting} className="gap-1.5">
                      <Brain className="h-3.5 w-3.5" /> Socratic
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your 3 weakest concepts, closing these gaps will lift overall mastery the fastest.
                </p>
                <div className="space-y-1.5">
                  {dailyPlan.map((n, i) => {
                    const pct = Math.round(n.masteryLevel * 100);
                    const b = BAND_META[band(n.masteryLevel)];
                    return (
                      <div key={n.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-background border">
                        <span className="text-[11px] font-semibold text-muted-foreground w-4">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{n.label}</div>
                          {n.description && (
                            <div className="text-[11px] text-muted-foreground truncate">{n.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full ${b.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`text-[11px] font-semibold tabular-nums w-9 text-right ${b.color}`}>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Gaps to close */}
            {gapNodes.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-rose-500" />
                    <h2 className="font-semibold text-sm">Gaps to close</h2>
                    <Badge variant="outline" className="text-[10px] h-4 border-rose-500/30 text-rose-600">
                      {gapNodes.length}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {gapNodes.slice(0, 12).map((n) => (
                      <NodeRow key={n.id} node={n} onTutor={() => startGuided(false)} disabled={starting} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Strong areas */}
            {strongNodes.length > 0 && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <h2 className="font-semibold text-sm">Strong areas</h2>
                    <Badge variant="outline" className="text-[10px] h-4 border-emerald-500/30 text-emerald-600">
                      {strongNodes.length}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground ml-auto">Keep these warm with spaced review</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {strongNodes.slice(0, 10).map((n) => {
                      const pct = Math.round(n.masteryLevel * 100);
                      return (
                        <div key={n.id} className="flex items-center gap-2 px-3 py-1.5 rounded-md border">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <div className="text-sm truncate flex-1">{n.label}</div>
                          <span className="text-[11px] font-medium text-emerald-600 tabular-nums">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NodeRow({ node, onTutor, disabled }: { node: Node; onTutor: () => void; disabled: boolean }) {
  const pct = Math.round(node.masteryLevel * 100);
  const b = BAND_META[band(node.masteryLevel)];
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-md border bg-card">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{node.label}</div>
        {node.category && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{node.category}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${b.bar}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[11px] font-semibold tabular-nums w-9 text-right ${b.color}`}>{pct}%</span>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={disabled} onClick={onTutor}>
          Tutor <ChevronRight className="h-3 w-3 ml-0.5" />
        </Button>
      </div>
    </div>
  );
}

