import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useGetStudyMaterial,
  useListStudyConcepts,
  useListStudyFlashcards,
  useCreateStudyFlashcard,
  useCreateStudyPractice,
} from "@workspace/paideia-api-client";
import { useStudyKnowledgeGraph, useStudyReanalyzeMaterial } from "@/hooks/use-study-api";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, BookOpen, Network, Brain, Flashlight, Target,
  FileText, ExternalLink, Tag, ChevronRight, Plus, Check,
  Play, Loader2, Settings2, GraduationCap,
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

export default function StudyMaterialView() {
  const { materialId } = useParams<{ materialId: string }>();
  const [, setLoc] = useLocation();
  const { data: material, isLoading: matLoading } = useGetStudyMaterial(materialId);
  const { data: concepts, isLoading: conceptsLoading } = useListStudyConcepts(materialId);
  const { data: allFlashcards, isLoading: fcLoading } = useListStudyFlashcards();
  const flashcards = allFlashcards?.filter((f) => f.materialId === materialId);
  const { data: kgraph } = useStudyKnowledgeGraph();
  const createFcMutation = useCreateStudyFlashcard();
  const createPracticeMutation = useCreateStudyPractice();

  const [createdFlashcards, setCreatedFlashcards] = useState<Set<string>>(new Set());
  const [startingPractice, setStartingPractice] = useState(false);

  const queryClient = useQueryClient();
  const reanalyze = useStudyReanalyzeMaterial();
  const [reanalyzeMsg, setReanalyzeMsg] = useState<string | null>(null);
  const runReanalyze = async () => {
    if (!materialId) return;
    setReanalyzeMsg(null);
    try {
      const r = await reanalyze.mutateAsync(materialId);
      await queryClient.invalidateQueries();
      setReanalyzeMsg(
        r.conceptCount > 0 ? `Extracted ${r.conceptCount} concepts.` : (r.warning ?? "No concepts found in this material."),
      );
    } catch (e) {
      setReanalyzeMsg((e as { message?: string })?.message ?? "Extraction failed. Please try again.");
    }
  };

  const startPracticeNow = async () => {
    if (!materialId || startingPractice) return;
    setStartingPractice(true);
    try {
      const res = await createPracticeMutation.mutateAsync({
        data: { materialId, questionCount: 10, difficulty: "mixed" },
      });
      setLoc(`/practice/${res.id}`);
    } catch {
      notifyError(undefined, "Could not generate a practice session. Try again, or open the configure page.");
      setStartingPractice(false);
    }
  };

  const startGuidedOnMaterial = async () => {
    if (!materialId) return;
    try {
      const r = await fetch("/api/study/tutor/guided/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ materialId }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        notifyError(e?.error, "Could not start the tutor session.");
        return;
      }
      const data = await r.json();
      setLoc(`/tutor/guided/${data.conversation.id}`);
    } catch {
      notifyError(undefined, "Could not start the tutor session.");
    }
  };

  const handleCreateFlashcard = async (concept: { title: string; explanation: string; keyTerms?: string[] }) => {
    const res = await createFcMutation.mutateAsync({
      data: {
        materialId: materialId || null,
        front: concept.title,
        back: concept.explanation,
        hint: concept.keyTerms && concept.keyTerms.length > 0 ? `Think about: ${concept.keyTerms.slice(0, 3).join(", ")}` : null,
      },
    });
    setCreatedFlashcards((prev) => new Set(prev).add(concept.title));
  };

  // Find related knowledge nodes
  const relatedNodes = kgraph?.nodes?.filter((n) =>
    concepts?.some((c) =>
      c.title.toLowerCase().includes(n.label.toLowerCase()) ||
      n.label.toLowerCase().includes(c.title.toLowerCase())
    )
  ) ?? [];

  if (matLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!material) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-semibold mb-1">Material not found</h2>
          <Button size="sm" onClick={() => setLoc("/materials")}>Back to Materials</Button>
        </div>
      </div>
    );
  }

  const hasConcepts = concepts && concepts.length > 0;
  const conceptFlashcardCount = flashcards?.length ?? 0;
  const totalConcepts = concepts?.length ?? 0;
  const fcProgress = totalConcepts > 0 ? Math.min(100, (conceptFlashcardCount / totalConcepts) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <StudyNav />
      <header className="border-b px-4 py-2 flex items-center justify-between sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLoc("/materials")}>
            <ArrowLeft className="h-4 w-4" />
            Materials
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h1 className="font-semibold text-sm truncate max-w-[200px] sm:max-w-sm">{material.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {material.sourceUrl && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
              <a href={material.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </header>

      {/* Primary action bar, surface the things people actually want to do */}
      <div className="border-b bg-gradient-to-b from-primary/[0.03] to-background sticky top-[5.25rem] z-30">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={startPracticeNow}
            disabled={startingPractice || !hasConcepts}
            title={!hasConcepts ? "Waiting for AI to analyze this material" : "Generate 10 mixed-difficulty questions now"}
          >
            {startingPractice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {startingPractice ? "Generating questions…" : "Practice now"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setLoc(`/practice?material=${materialId}`)}
            title="Choose question count and difficulty"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={startGuidedOnMaterial}>
            <GraduationCap className="h-3.5 w-3.5" />
            Tutor on this
          </Button>
          <span className="ml-auto text-[11px] text-muted-foreground hidden sm:inline">
            {totalConcepts > 0
              ? `${totalConcepts} concepts ready`
              : "Analyzing material…"}
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="bg-blue-50/50 border-blue-100">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                <span className="text-xs text-muted-foreground">Concepts</span>
              </div>
              <p className="text-xl font-bold mt-1">{totalConcepts}</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50/50 border-amber-100">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Flashlight className="h-4 w-4 text-amber-600" />
                <span className="text-xs text-muted-foreground">Flashcards</span>
              </div>
              <p className="text-xl font-bold mt-1">{conceptFlashcardCount}</p>
            </CardContent>
          </Card>
          <Card className="bg-emerald-50/50 border-emerald-100">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-muted-foreground">Coverage</span>
              </div>
              <p className="text-xl font-bold mt-1">{Math.round(fcProgress)}%</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50/50 border-purple-100">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-purple-600" />
                <span className="text-xs text-muted-foreground">Linked</span>
              </div>
              <p className="text-xl font-bold mt-1">{relatedNodes.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start">
          {/* Main Content */}
          <div className="min-w-0">
            <Card className="mb-6">
              <CardContent className="py-5">
                <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Content
                </h2>
                <div className="prose prose-sm max-w-none text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
                  {material.contentText}
                </div>
              </CardContent>
            </Card>

            {/* Knowledge Graph Link */}
            {relatedNodes.length > 0 && (
              <Card className="border-purple-100 bg-purple-50/30 cursor-pointer hover:bg-purple-50/60 transition-colors" onClick={() => setLoc("/knowledge-map")}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                      <Network className="h-4 w-4 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">Knowledge Graph Connections</h3>
                      <p className="text-xs text-muted-foreground">
                        {relatedNodes.length} concepts linked to your knowledge map
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <aside className="min-w-0 space-y-4">
            {/* Flashcard Coverage */}
            {totalConcepts > 0 && (
              <Card>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Flashcard Coverage</span>
                    <span className="text-xs font-bold">{Math.round(fcProgress)}%</span>
                  </div>
                  <Progress value={fcProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {conceptFlashcardCount} of {totalConcepts} concepts have flashcards
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Concepts */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Tag className="h-3 w-3" />
                AI-Extracted Concepts
              </h3>
              {conceptsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : !hasConcepts ? (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center">
                    <Brain className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">
                      No concepts yet. Extraction may not have run, or this material has little teachable content.
                    </p>
                    <Button size="sm" onClick={runReanalyze} disabled={reanalyze.isPending}>
                      {reanalyze.isPending ? "Analyzing…" : "Re-analyze material"}
                    </Button>
                    {reanalyzeMsg ? <p className="text-xs text-muted-foreground mt-2">{reanalyzeMsg}</p> : null}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {concepts?.map((concept) => {
                    const hasFc = createdFlashcards.has(concept.title) || flashcards?.some((f) => f.front === concept.title);
                    const difficultyColor = concept.difficulty === "easy" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : concept.difficulty === "hard" ? "bg-red-50 text-red-600 border-red-200" : "bg-blue-50 text-blue-600 border-blue-200";
                    return (
                      <Card key={concept.id} className="overflow-hidden">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-sm truncate">{concept.title}</h4>
                                <Badge variant="outline" className={`text-[10px] h-4 px-1 ${difficultyColor}`}>
                                  {concept.difficulty}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{concept.explanation}</p>
                              {concept.keyTerms && concept.keyTerms.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {concept.keyTerms.map((term) => (
                                    <span key={term} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{term}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 shrink-0"
                              disabled={hasFc || createFcMutation.isPending}
                              onClick={() => handleCreateFlashcard(concept)}
                              title={hasFc ? "Flashcard exists" : "Create flashcard"}
                            >
                              {hasFc ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Plus className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

          </aside>
        </div>
      </div>
    </div>
  );
}
