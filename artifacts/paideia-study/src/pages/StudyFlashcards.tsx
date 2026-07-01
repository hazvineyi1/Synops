import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useCompletePathStep } from "@/hooks/use-study-journey";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useGetStudyReviewQueue,
  useReviewStudyFlashcard,
  getGetStudyReviewQueueQueryKey,
  useListStudyMaterials,
} from "@workspace/paideia-api-client";
import { useStudyKnowledgeGraph } from "@/hooks/use-study-api";
import StudyNav from "@/components/StudyNav";
import { useQueryClient } from "@tanstack/react-query";
import {
  RotateCcw, Eye, EyeOff, Flame, BrainCircuit,
  TrendingUp, Target, Clock, ChevronRight, Zap, Sparkles,
  Lightbulb, Loader2, BookOpen
} from "lucide-react";
import type { StudyFlashcard } from "@workspace/paideia-api-client";

const REVIEW_LABELS: Record<number, { label: string; color: string; desc: string }> = {
  0: { label: "Again", color: "text-red-500 bg-red-50 border-red-200 hover:bg-red-100", desc: "Complete blackout" },
  1: { label: "Hard", color: "text-orange-500 bg-orange-50 border-orange-200 hover:bg-orange-100", desc: "Struggled significantly" },
  2: { label: "Good", color: "text-blue-500 bg-blue-50 border-blue-200 hover:bg-blue-100", desc: "Correct with effort" },
  3: { label: "Easy", color: "text-emerald-500 bg-emerald-50 border-emerald-200 hover:bg-emerald-100", desc: "Immediate recall" },
};

export default function StudyFlashcards() {
  const [, setLoc] = useLocation();
  const { data: queue, isLoading } = useGetStudyReviewQueue();
  const reviewMutation = useReviewStudyFlashcard();
  const queryClient = useQueryClient();
  const { data: materials } = useListStudyMaterials();
  const { data: kgraph } = useStudyKnowledgeGraph();

  const allCards = [
    ...(queue?.dueToday ?? []),
    ...(queue?.newCards ?? []),
  ];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewStats, setReviewStats] = useState({ again: 0, hard: 0, good: 0, easy: 0, totalTime: 0 });
  const [startTime] = useState(Date.now());
  const [didCompletePathStep, setDidCompletePathStep] = useState(false);
  const completePathStep = useCompletePathStep();
  const searchRef = useRef(new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""));
  const pathStepId = searchRef.current.get("pathStepId");
  const pathId = searchRef.current.get("pathId");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!allCards || allCards.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <StudyNav />
        <main className="max-w-md mx-auto px-6 py-16 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Flame className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">All caught up!</h2>
          <p className="text-muted-foreground mb-6 text-sm">
            No flashcards due for review. The adaptive spaced repetition engine will schedule your next review at the optimal time based on your mastery.
          </p>
          {materials && materials.length > 0 ? (
            <div className="space-y-2">
              <Button onClick={() => setLoc("/materials/new")} className="w-full gap-1.5">
                <Sparkles className="h-4 w-4" />
                Add New Material
              </Button>
              <Button variant="outline" onClick={() => setLoc("/knowledge-map")} className="w-full gap-1.5">
                <BrainCircuit className="h-4 w-4" />
                Explore Knowledge Map
              </Button>
            </div>
          ) : (
            <Button onClick={() => setLoc("/materials/new")} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              Add Your First Material
            </Button>
          )}
        </main>
      </div>
    );
  }

  if (sessionComplete) {
    const accuracy = allCards.length > 0
      ? Math.round(((reviewStats.good + reviewStats.easy) / allCards.length) * 100)
      : 0;
    return (
      <div className="min-h-screen bg-background">
        <StudyNav />
        <main className="max-w-lg mx-auto px-6 py-12 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Flame className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Review Complete!</h2>
          <p className="text-muted-foreground mb-6">
            You reviewed {allCards.length} flashcards in {Math.round((Date.now() - startTime) / 1000 / 60)} minutes.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Again", count: reviewStats.again, color: "text-red-500 bg-red-50" },
              { label: "Hard", count: reviewStats.hard, color: "text-orange-500 bg-orange-50" },
              { label: "Good", count: reviewStats.good, color: "text-blue-500 bg-blue-50" },
              { label: "Easy", count: reviewStats.easy, color: "text-emerald-500 bg-emerald-50" },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="py-3 text-center">
                  <p className={`text-2xl font-bold ${stat.color.split(" ")[0]}`}>{stat.count}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Mastery indicator */}
          <Card className="mb-6 text-left">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Session Accuracy</span>
                <span className="ml-auto font-bold">{accuracy}%</span>
              </div>
              <Progress value={accuracy} className="h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                The SM-2 spaced repetition algorithm has rescheduled cards based on your performance.
              </p>
            </CardContent>
          </Card>

          <div className="flex gap-2 justify-center">
            <Button onClick={() => {
              setSessionComplete(false);
              setCurrentIndex(0);
              setShowBack(false);
              setReviewStats({ again: 0, hard: 0, good: 0, easy: 0, totalTime: 0 });
              queryClient.invalidateQueries({ queryKey: getGetStudyReviewQueueQueryKey() });
            }} variant="outline" className="gap-1.5">
              <RotateCcw className="h-4 w-4" />
              Review Again
            </Button>
            {pathStepId && pathId && !didCompletePathStep && (
              <Button
                variant="default"
                className="gap-1.5"
                onClick={() => {
                  completePathStep.mutate(
                    { pathId, stepId: pathStepId, masteryScore: accuracy / 100, durationSeconds: Math.round((Date.now() - startTime) / 1000) },
                    { onSuccess: () => setDidCompletePathStep(true) }
                  );
                }}
                disabled={completePathStep.isPending}
              >
                {completePathStep.isPending ? "Completing..." : "Mark Path Step Complete"}
              </Button>
            )}
            <Button onClick={() => setLoc("/dashboard")}>
              Back to Dashboard
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const currentCard = allCards[currentIndex];
  const progress = ((currentIndex) / allCards.length) * 100;

  // Find related knowledge node
  const relatedNode = kgraph?.nodes?.find((n) =>
    currentCard.front.toLowerCase().includes(n.label.toLowerCase()) ||
    n.label.toLowerCase().includes(currentCard.front.toLowerCase())
  );
  const relatedMaterial = materials?.find((m) => m.id === currentCard.materialId);

  const handleReview = async (quality: number) => {
    await reviewMutation.mutateAsync({
      flashcardId: currentCard.id,
      data: { quality },
    });
    setReviewStats((prev) => ({
      ...prev,
      again: prev.again + (quality <= 1 ? 1 : 0),
      hard: prev.hard + (quality === 2 ? 1 : 0),
      good: prev.good + (quality === 3 ? 1 : 0),
      easy: prev.easy + (quality >= 4 ? 1 : 0),
    }));
    setShowBack(false);
    if (currentIndex + 1 >= allCards.length) {
      setSessionComplete(true);
      queryClient.invalidateQueries({ queryKey: getGetStudyReviewQueueQueryKey() });
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StudyNav />
      {/* Session bar */}
      <header className="border-b px-4 py-2 flex items-center justify-between shrink-0 sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="text-sm font-semibold">Flashcards</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Flame className="h-4 w-4 text-orange-500" />
          <span>{currentIndex + 1} / {allCards.length}</span>
        </div>
      </header>

      {/* Progress */}
      <div className="w-full bg-muted h-1">
        <div className="bg-primary h-1 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-6 max-w-lg mx-auto w-full">
        {/* Card Meta */}
        <div className="w-full flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {relatedMaterial && (
              <Badge variant="outline" className="text-[10px] h-5 cursor-pointer" onClick={() => setLoc(`/materials/${relatedMaterial.id}`)}>
                <BookOpen className="h-3 w-3 mr-1" />
                {relatedMaterial.title}
              </Badge>
            )}
            {relatedNode && (
              <Badge variant="outline" className="text-[10px] h-5 cursor-pointer border-purple-200 text-purple-600" onClick={() => setLoc("/knowledge-map")}>
                <BrainCircuit className="h-3 w-3 mr-1" />
                {relatedNode.category || "Concept"}
              </Badge>
            )}
          </div>
          {currentCard.reviewCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Reviewed {currentCard.reviewCount}x
            </span>
          )}
        </div>

        {/* Flashcard */}
        <Card
          className="w-full min-h-[260px] flex flex-col cursor-pointer hover:shadow-lg transition-shadow mb-6"
          onClick={() => !showBack && setShowBack(true)}
        >
          <CardContent className="flex-1 flex flex-col items-center justify-center py-8 text-center">
            {showBack ? (
              <>
                <Badge variant="outline" className="mb-3 text-[10px]">Answer</Badge>
                <p className="text-base leading-relaxed">{currentCard.back}</p>
                {currentCard.hint && (
                  <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100 text-left w-full">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lightbulb className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] font-medium text-amber-600 uppercase">Hint</span>
                    </div>
                    <p className="text-xs text-amber-700">{currentCard.hint}</p>
                  </div>
                )}
                {relatedNode && (
                  <div className="mt-3 w-full text-left">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Target className="h-3 w-3 text-purple-500" />
                      <span className="text-[10px] font-medium text-purple-600 uppercase">Mastery</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={(relatedNode.masteryLevel || 0) * 100} className="h-1 flex-1" />
                      <span className="text-xs text-muted-foreground">
                        {Math.round((relatedNode.masteryLevel || 0) * 100)}%
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Badge variant="outline" className="mb-3 text-[10px]">Question</Badge>
                <p className="text-lg font-medium leading-relaxed">{currentCard.front}</p>
                <p className="text-sm text-muted-foreground mt-6">
                  Click or tap to reveal answer
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Rating buttons */}
        {showBack ? (
          <div className="w-full">
            <div className="grid grid-cols-4 gap-2 mb-3">
              {([0, 1, 2, 3] as const).map((q) => {
                const { label, color, desc } = REVIEW_LABELS[q];
                return (
                  <button
                    key={q}
                    disabled={reviewMutation.isPending}
                    onClick={() => handleReview(q)}
                    className={`flex flex-col items-center py-2.5 rounded-lg border text-xs transition-all ${color} disabled:opacity-50`}
                  >
                    <span className="font-semibold">{label}</span>
                    <span className="text-[10px] opacity-70 hidden sm:block">{desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              How well did you recall? This affects your next review schedule.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Button variant="outline" onClick={() => setShowBack(true)} className="gap-1.5">
              <Eye className="h-4 w-4" />
              Show Answer
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>Spacebar or tap to reveal</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
