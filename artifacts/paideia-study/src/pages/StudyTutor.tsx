import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StudyNav from "@/components/StudyNav";
import {
  useListStudyTutorConversations,
  useCreateStudyTutorConversation,
  useListStudyMaterials,
} from "@workspace/paideia-api-client";
import {
  useStudyKnowledgeGraph,
} from "@/hooks/use-study-api";
import {
  MessageSquare, Plus, GraduationCap, Sparkles, Loader2,
  Brain, Target, Clock, BookOpen, RefreshCw, ChevronRight, MessagesSquare,
  AlertCircle, Compass,
} from "lucide-react";

export default function StudyTutor() {
  const [, setLoc] = useLocation();
  const { data: conversations, isLoading } = useListStudyTutorConversations();
  const { data: materials } = useListStudyMaterials();
  const { data: knowledge } = useStudyKnowledgeGraph();
  const createMutation = useCreateStudyTutorConversation();
  const [starting, setStarting] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);

  // Weakest concepts = knowledge nodes sorted by ascending masteryLevel, take 3
  const focusNodes = useMemo(() => {
    const nodes: any[] = knowledge?.nodes ?? [];
    if (!nodes.length) return [];
    return [...nodes]
      .sort((a, b) => (a.masteryLevel ?? 0) - (b.masteryLevel ?? 0))
      .slice(0, 3);
  }, [knowledge]);

  const lastGuided = useMemo(() => {
    const list: any[] = conversations ?? [];
    return list.find((c) => typeof c.scopeRefId === "string" && c.scopeRefId.startsWith("guided:"));
  }, [conversations]);

  const startGuided = async (
    opts: { socratic?: boolean; materialId?: string | null; conceptId?: string | null } = {},
  ) => {
    const tag = opts.socratic ? "socratic" : "guided";
    setStarting(tag);
    try {
      const r = await fetch("/api/study/tutor/guided/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          socratic: !!opts.socratic,
          ...(opts.materialId ? { materialId: opts.materialId } : {}),
          ...(opts.conceptId ? { conceptId: opts.conceptId } : {}),
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e?.error || "Could not start session.");
        setStarting(null);
        return;
      }
      const data = await r.json();
      setLoc(`/tutor/guided/${data.conversation.id}`);
    } catch {
      alert("Could not start session.");
      setStarting(null);
    }
  };

  const handleNewChat = async (title?: string) => {
    setStarting("chat");
    try {
      const res = await createMutation.mutateAsync({
        data: { title: title || "Free-form chat" },
      });
      setLoc(`/tutor/${res.id}`);
    } catch {
      alert("Failed to start chat.");
      setStarting(null);
    }
  };

  const allConvs: any[] = conversations ?? [];
  const visibleConvs = showAllSessions ? allConvs : allConvs.slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />
      <main className="max-w-5xl mx-auto px-3 sm:px-5 py-5 sm:py-6 space-y-5">
        {/* Header line */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Synops Coach</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Diagnose what you don't know, then teach exactly that, grounded in your materials.
            </p>
          </div>
          {lastGuided && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => setLoc(`/tutor/guided/${lastGuided.id}`)}
            >
              <Clock className="h-3.5 w-3.5" /> Resume last
            </Button>
          )}
        </div>

        {/* Primary CTAs, two paths, above the fold */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm">Guided diagnostic</h2>
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary/15 text-primary hover:bg-primary/15 border-0">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" /> recommended
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Diagnose → teach → check</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                3-question diagnostic on your weakest concepts, then a tailored lesson with a check question on whatever you missed.
              </p>
              <Button
                className="w-full gap-1.5"
                onClick={() => startGuided({ socratic: false })}
                disabled={starting !== null}
                size="sm"
              >
                {starting === "guided" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
                {starting === "guided" ? "Setting up your diagnostic…" : "Begin guided session"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Brain className="h-4.5 w-4.5 text-amber-600" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-semibold text-sm">Socratic dialogue</h2>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-700">
                      think-first
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">Questions before answers</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Same flow, but I ask guiding questions to make you reason it out before revealing the key insight. Best for deep understanding.
              </p>
              <Button
                variant="outline"
                className="w-full gap-1.5 border-amber-500/40 hover:bg-amber-500/5"
                onClick={() => startGuided({ socratic: true })}
                disabled={starting !== null}
                size="sm"
              >
                {starting === "socratic" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                {starting === "socratic" ? "Setting up Socratic flow…" : "Begin Socratic session"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Today's focus, weakest concepts as one-tap shortcuts */}
        {focusNodes.length > 0 ? (
          <Card>
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-rose-500" />
                <h3 className="font-semibold text-sm">Today's focus</h3>
                <span className="text-xs text-muted-foreground">your weakest concepts right now</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {focusNodes.map((n) => {
                  const pct = Math.round((n.masteryLevel ?? 0) * 100);
                  return (
                    <button
                      key={n.id}
                      onClick={() => startGuided({ socratic: false, conceptId: n.id })}
                      disabled={starting !== null}
                      className="text-left rounded-lg border bg-card hover:border-primary/40 hover:bg-accent/40 transition-all p-3 group"
                      title={n.description || ""}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="text-sm font-medium leading-tight line-clamp-2">{n.label}</div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-rose-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Tap any concept to start a guided session focused on it.
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-4 flex items-center gap-3">
              <Compass className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Build your knowledge map first</div>
                <div className="text-xs text-muted-foreground">
                  Upload material and generate a knowledge map so the tutor knows what to focus on.
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setLoc("/knowledge-map")}>Open map</Button>
            </CardContent>
          </Card>
        )}

        {/* Materials strip, one-tap scope */}
        {materials && materials.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <h3 className="font-semibold text-sm">Your materials</h3>
                  <Badge variant="outline" className="text-[10px] h-4">{materials.length}</Badge>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setLoc("/materials")}>
                  Manage <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {materials.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => startGuided({ materialId: m.id })}
                    disabled={starting !== null}
                    className="shrink-0 max-w-[200px] text-left rounded-md border bg-card hover:border-primary/40 hover:bg-accent/40 px-3 py-2 transition-colors"
                    title={`Start guided session on ${m.title}`}
                  >
                    <div className="text-xs font-medium truncate">{m.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Sparkles className="h-2.5 w-2.5" /> tutor on this
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => setLoc("/materials/new")}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-dashed bg-card hover:bg-accent/40 px-3 py-2 text-xs text-muted-foreground"
                >
                  <Plus className="h-3 w-3" /> Add material
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Free-form chat, secondary, compact */}
        <Card className="border-dashed">
          <CardContent className="p-3.5 flex items-center gap-3 flex-wrap">
            <MessagesSquare className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">Open-ended chat</div>
              <div className="text-xs text-muted-foreground">
                Ask anything, no diagnostic, no structure.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNewChat()}
              disabled={starting !== null}
              className="gap-1.5"
            >
              {starting === "chat" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
              New chat
            </Button>
          </CardContent>
        </Card>

        {/* Recent sessions, compact list */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : allConvs.length === 0 ? null : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Recent sessions</span>
                <Badge variant="outline" className="text-[10px] h-4">{allConvs.length}</Badge>
              </div>
              {allConvs.length > 5 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setShowAllSessions((s) => !s)}
                >
                  {showAllSessions ? "Show less" : `Show all ${allConvs.length}`}
                </Button>
              )}
            </div>
            <div className="divide-y rounded-md border overflow-hidden">
              {visibleConvs.map((c) => {
                const isGuided = typeof c.scopeRefId === "string" && c.scopeRefId.startsWith("guided:");
                const href = isGuided ? `/tutor/guided/${c.id}` : `/tutor/${c.id}`;
                return (
                  <button
                    key={c.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
                    onClick={() => setLoc(href)}
                  >
                    {isGuided ? (
                      <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{c.title || "Untitled"}</span>
                        {isGuided && (
                          <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0 leading-none">
                            guided
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(c.updatedAt).toLocaleDateString(undefined, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
