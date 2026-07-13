import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useListStudyMaterials,
  useDeleteStudyMaterial,
  getListStudyMaterialsQueryKey,
} from "@workspace/paideia-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, BookOpen, FileText, Layers, Sparkles, Network, ChevronRight } from "lucide-react";
import StudyNav from "@/components/StudyNav";

export default function StudyMaterials() {
  const [, setLoc] = useLocation();
  const { data: materials, isLoading } = useListStudyMaterials();
  const deleteMutation = useDeleteStudyMaterial();
  const queryClient = useQueryClient();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Retry concept extraction for a material that has none. Unlike the upload path
  // (fire-and-forget), /reanalyze is synchronous and returns a real error, so the
  // user finally learns WHY analysis failed instead of staring at "0 concepts".
  const runAnalyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      const r = await fetch(`/api/study/materials/${id}/reanalyze`, {
        method: "POST",
        credentials: "include",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        notifyError(data?.error, "Analysis failed. Please try again in a moment.");
        return;
      }
      notifySuccess(`Extracted ${data?.conceptCount ?? 0} concepts.`, "Analyzed");
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
    } catch {
      notifyError(undefined, "Could not reach the server. Check your connection.");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm(`Delete "${title}" and all its concepts, flashcards, and practice history?\n\nThis cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync({ materialId: id });
      queryClient.invalidateQueries({ queryKey: getListStudyMaterialsQueryKey() });
    } catch {
      notifyError(undefined, "Could not delete that material. Please try again.");
    }
  };

  const getIcon = (sourceType: string) => {
    switch (sourceType) {
      case "url": return <BookOpen className="h-4 w-4" />;
      case "file": return <FileText className="h-4 w-4" />;
      default: return <Layers className="h-4 w-4" />;
    }
  };

  const getColor = (sourceType: string) => {
    switch (sourceType) {
      case "url": return "bg-blue-50 border-blue-100 text-blue-600";
      case "file": return "bg-amber-50 border-amber-100 text-amber-600";
      default: return "bg-emerald-50 border-emerald-100 text-emerald-600";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />
      <div className="border-b px-4 py-2 flex items-center justify-between sticky top-12 bg-background/95 backdrop-blur-sm z-10">
        <h1 className="text-sm font-semibold">Materials</h1>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setLoc("/materials/new")}>
          <Plus className="h-3.5 w-3.5" />
          Add Material
        </Button>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Your Materials</h1>
          <p className="text-sm text-muted-foreground">
            {materials?.length ?? 0} sources ingested · AI has extracted {materials?.reduce((s, m) => s + (m.conceptCount ?? 0), 0) ?? 0} concepts
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !materials || materials.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <BookOpen className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">No materials yet</h3>
              <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
                Add PDFs, images, URLs, or paste notes. AI will extract concepts and build your knowledge graph.
              </p>
              <Button onClick={() => setLoc("/materials/new")} className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add First Material
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {materials.map((m) => (
              <Card key={m.id} className="group overflow-hidden hover:shadow-md transition-shadow cursor-pointer" onClick={() => setLoc(`/materials/${m.id}`)}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${getColor(m.sourceType)}`}>
                        {getIcon(m.sourceType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="font-semibold text-sm truncate">{m.title}</h3>
                          <Badge variant="outline" className="text-[10px] h-5 shrink-0 capitalize">
                            {m.sourceType}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Network className="h-3 w-3" />
                            {m.conceptCount ?? 0} concepts
                          </span>
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            {m.flashcardCount ?? 0} flashcards
                          </span>
                          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                        {m.conceptCount && m.conceptCount > 0 ? (
                          <div className="mt-2">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-muted-foreground">Study Progress</span>
                              <span className="font-medium">{Math.round(((m.flashcardCount ?? 0) / (m.conceptCount * 0.7)) * 100)}%</span>
                            </div>
                            <Progress value={Math.min(100, ((m.flashcardCount ?? 0) / (m.conceptCount * 0.7)) * 100)} className="h-1" />
                          </div>
                        ) : (
                          // Zero concepts means analysis never succeeded. Extraction runs
                          // fire-and-forget on upload, so a failure used to leave the material
                          // sitting here silently with nothing in it -- and the tutor would then
                          // refuse to start ("I need at least one studied concept") with no clue
                          // why. Surface it, and give them a one-click retry.
                          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-amber-900 leading-snug">
                              Not analyzed yet. The tutor and practice need concepts from this material.
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px] shrink-0"
                              disabled={analyzingId === m.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                runAnalyze(m.id);
                              }}
                            >
                              {analyzingId === m.id ? "Analyzing..." : "Analyze"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${m.title}`}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                        disabled={deleteMutation.isPending}
                        onClick={(e) => handleDelete(e, m.id, m.title)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
