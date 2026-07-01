import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDailySession, useStartPathStep, useCompletePathStep } from "@/hooks/use-study-journey";
import {
  Brain, BookOpen, Zap, Target, MessageCircle, CheckCircle2,
  ArrowRight, Clock, ChevronLeft, Sparkles, Loader2,
  RotateCcw, Award,
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

const stepTypeConfig: Record<string, { icon: typeof Brain; label: string; color: string; bg: string; action: string }> = {
  read_material: { icon: BookOpen, label: "Read & Understand", color: "text-blue-600", bg: "bg-blue-50", action: "Open Reading" },
  flashcard_review: { icon: Zap, label: "Active Recall", color: "text-amber-600", bg: "bg-amber-50", action: "Start Flashcards" },
  practice_questions: { icon: Target, label: "Apply Knowledge", color: "text-emerald-600", bg: "bg-emerald-50", action: "Start Practice" },
  tutor_session: { icon: MessageCircle, label: "Deep Dive", color: "text-purple-600", bg: "bg-purple-50", action: "Open Tutor" },
  mastery_check: { icon: Award, label: "Mastery Check", color: "text-orange-600", bg: "bg-orange-50", action: "Begin Check" },
  spaced_review: { icon: RotateCcw, label: "Spaced Review", color: "text-teal-600", bg: "bg-teal-50", action: "Start Review" },
};

export default function StudyDailySession() {
  const [, setLoc] = useLocation();
  const { data: sessionData, isLoading } = useDailySession();
  const startStep = useStartPathStep();
  const completeStep = useCompletePathStep();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Brain className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Preparing your session...</p>
        </div>
      </div>
    );
  }

  if (!sessionData?.hasActivePath) {
    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Start Your Learning Journey</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Upload materials and take a quick diagnostic. AI will build your personalized path.
          </p>
          <Button size="lg" className="gap-2" onClick={() => setLoc("/materials/new")}>
            <BookOpen className="h-4 w-4" />
            Add Study Material
            <ArrowRight className="h-4 w-4" />
          </Button>
        </main>
      </div>
    );
  }

  const { path, session, progress, coachingMessage } = sessionData;
  const primaryStep = session?.primaryStep ?? session?.steps?.[0] ?? null;
  const upcomingSteps: any[] = session?.upcomingSteps ?? session?.steps?.slice(1) ?? [];

  const navigateToStep = (step: any) => {
    const ref = step.contentRef || step.conceptId;
    const stepParams = `?pathId=${encodeURIComponent(path.id)}&pathStepId=${encodeURIComponent(step.id)}`;
    switch (step.stepType) {
      case "read_material": setLoc(`/read-step/${path.id}/${step.id}`); break;
      case "flashcard_review": setLoc(`/flashcards${stepParams}`); break;
      case "practice_questions": setLoc(`/practice${stepParams}`); break;
      case "tutor_session": setLoc(`/tutor${stepParams}`); break;
      default: setLoc("/dashboard");
    }
  };

  const handleStepAction = (step: any) => {
    if (step.status === "locked") return;
    if (step.status === "available") {
      startStep.mutate(
        { pathId: path.id, stepId: step.id },
        { onSuccess: () => navigateToStep(step) }
      );
    } else {
      navigateToStep(step);
    }
  };

  const handleCompletePrimary = () => {
    if (!primaryStep) return;
    completeStep.mutate({ pathId: path.id, stepId: primaryStep.id, masteryScore: 0.7 });
  };

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />
      <header className="border-b px-4 py-2 sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Learning Session</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {primaryStep ? (
          <>
            {/* Hero step card */}
            {(() => {
              const config = stepTypeConfig[primaryStep.stepType] ?? stepTypeConfig.read_material;
              const Icon = config.icon;
              const isInProgress = primaryStep.status === "in_progress";

              return (
                <Card className="border-primary/20 shadow-sm overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-primary to-primary/40" />
                  <CardContent className="py-6 px-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                          {isInProgress ? "Continue Where You Left Off" : "Your Next Step"}
                        </p>
                        <p className={`text-xs font-medium ${config.color}`}>{config.label}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {primaryStep.estimatedMinutes}m
                      </div>
                    </div>

                    <h1 className="font-bold text-xl leading-snug mb-2">{primaryStep.title}</h1>
                    {primaryStep.description && (
                      <p className="text-sm text-muted-foreground mb-4">{primaryStep.description}</p>
                    )}

                    {coachingMessage && (
                      <div className="bg-muted/50 rounded-lg p-3 mb-5 border-l-2 border-primary/40">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-relaxed">{coachingMessage}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        className="flex-1 gap-2"
                        size="lg"
                        onClick={() => handleStepAction(primaryStep)}
                        disabled={startStep.isPending}
                      >
                        {startStep.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {config.action}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      {isInProgress && (
                        <Button
                          variant="outline"
                          size="lg"
                          className="gap-1.5"
                          onClick={handleCompletePrimary}
                          disabled={completeStep.isPending}
                        >
                          {completeStep.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Done
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Coming up */}
            {upcomingSteps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">After This</p>
                <div className="space-y-2">
                  {upcomingSteps.slice(0, 3).map((step) => {
                    const conf = stepTypeConfig[step.stepType] ?? stepTypeConfig.read_material;
                    const ConfIcon = conf.icon;
                    return (
                      <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-transparent">
                        <div className={`w-8 h-8 rounded-md ${conf.bg} flex items-center justify-center shrink-0`}>
                          <ConfIcon className={`h-4 w-4 ${conf.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{step.title}</p>
                          <p className="text-[10px] text-muted-foreground">{step.estimatedMinutes}m · {conf.label}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">queued</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Journey progress */}
            <div className="pt-2 space-y-2 border-t">
              <div className="flex items-center justify-between text-sm pt-2">
                <span className="font-medium text-xs text-muted-foreground">Path: {path.title}</span>
                <span className="text-xs text-muted-foreground">
                  {progress.completedSteps} / {progress.totalSteps} done · {progress.percentComplete}%
                </span>
              </div>
              <Progress value={progress.percentComplete} className="h-1.5" />
            </div>
          </>
        ) : (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h2 className="font-bold text-lg mb-1">You're caught up!</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Great work. Spaced reviews will unlock automatically.
              </p>
              <Button variant="outline" size="sm" onClick={() => setLoc("/dashboard")}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
