import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useStudyAuth } from "@/hooks/use-study-auth";
import StudyNav from "@/components/StudyNav";
import {
  useDailySession,
  useStartPathStep,
  useStudyProfile,
} from "@/hooks/use-study-journey";
import { useListStudyMaterials, customFetch } from "@workspace/paideia-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BookOpen, Zap, Target, MessageCircle, ArrowRight, LogOut, Flame,
  Brain, Clock, ChevronRight, CheckCircle2, RotateCcw, Award,
  Sparkles, Compass,
} from "lucide-react";

const stepTypeConfig: Record<string, { icon: typeof Brain; label: string; color: string; bg: string }> = {
  read_material: { icon: BookOpen, label: "Read & Understand", color: "text-blue-600", bg: "bg-blue-50" },
  flashcard_review: { icon: Zap, label: "Active Recall", color: "text-amber-600", bg: "bg-amber-50" },
  practice_questions: { icon: Target, label: "Apply Knowledge", color: "text-emerald-600", bg: "bg-emerald-50" },
  tutor_session: { icon: MessageCircle, label: "Deep Dive", color: "text-purple-600", bg: "bg-purple-50" },
  mastery_check: { icon: Award, label: "Mastery Check", color: "text-orange-600", bg: "bg-orange-50" },
  spaced_review: { icon: RotateCcw, label: "Spaced Review", color: "text-teal-600", bg: "bg-teal-50" },
};

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function profileLabel(p: any): string | null {
  if (!p) return null;
  const style = p.processingStyle === "conceptual" ? "Conceptual" : p.processingStyle === "sequential" ? "Sequential" : "Mixed";
  const pace = p.pace === "deliberate" ? "Deliberate" : p.pace === "quick" ? "Quick" : "Moderate";
  return `${style} · ${pace}`;
}

function navigateToStep(step: any, pathId: string, setLoc: (s: string) => void) {
  const ref = step.contentRef || step.conceptId;
  const params = `?pathId=${encodeURIComponent(pathId)}&pathStepId=${encodeURIComponent(step.id)}`;
  switch (step.stepType) {
    case "read_material": setLoc(`/read-step/${pathId}/${step.id}`); break;
    case "flashcard_review": setLoc(`/practice${params}`); break;
    case "practice_questions": setLoc(`/practice${params}`); break;
    case "tutor_session": setLoc(`/tutor${params}`); break;
    default: setLoc(`/practice${params}`);
  }
}

export default function StudyDashboard() {
  const [, setLoc] = useLocation();
  const { user, logout } = useStudyAuth();
  const { data: sessionData, isLoading } = useDailySession();
  const { data: profile } = useStudyProfile();
  const { data: materials } = useListStudyMaterials();
  const startStep = useStartPathStep();
  const queryClient = useQueryClient();
  const [buildingPath, setBuildingPath] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const API_BASE = "/api/study";

  const buildPath = async (materialId: string) => {
    setPlanError(null);
    setBuildingPath(true);
    try {
      await customFetch(`${API_BASE}/paths/from-material`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materialId }),
      });
      await queryClient.invalidateQueries({ queryKey: ["study", "daily-session"] });
    } catch (err: unknown) {
      const apiErr = err as { data?: { error?: string }; message?: string };
      setPlanError(
        apiErr?.data?.error ||
          apiErr?.message ||
          "Couldn't build your study plan. Make sure the material has finished concept extraction, then try again.",
      );
    } finally {
      setBuildingPath(false);
    }
  };

  const clearStaleHistory = async () => {
    if (!confirm("Clear all your old practice sessions? This removes any leftover questions from earlier sessions (including any that mixed subjects). Your materials and flashcards stay.")) return;
    setClearingHistory(true);
    try {
      await customFetch(`${API_BASE}/practice/sessions`, { method: "DELETE" });
    } catch {
      notifyError(undefined, "Couldn't clear practice history. Please try again.");
    } finally {
      setClearingHistory(false);
    }
  };

  // Single onboarding gate: send incomplete profiles straight to intake.
  // (The legacy learning-style gate was removed, The Coach spec forbids VARK/modality framing.)
  // Wait for profile data to load to avoid a flash-redirect on first paint.
  useEffect(() => {
    // Admins (and super admins) are exempt from the onboarding gate so they can
    // always reach the dashboard + admin console instead of being trapped on the
    // learner intake. They can still open /intake manually if they want it.
    if (profile && !profile.diagnosticComplete && !user?.isAdmin) {
      setLoc("/intake");
    }
  }, [profile, setLoc, user]);

  const hasActivePath = sessionData?.hasActivePath ?? false;
  const progress = sessionData?.progress ?? { completedSteps: 0, totalSteps: 0, percentComplete: 0 };
  const primaryStep = sessionData?.session?.primaryStep ?? sessionData?.session?.steps?.[0] ?? null;
  const upcomingSteps = sessionData?.session?.upcomingSteps ?? sessionData?.session?.steps?.slice(1) ?? [];
  const coachingMessage = sessionData?.coachingMessage ?? null;
  const learningProfile = sessionData?.learningProfile ?? null;
  const activePath = sessionData?.path ?? null;
  const examTarget = profile?.examTarget ?? null;

  const stepConfig = primaryStep ? (stepTypeConfig[primaryStep.stepType] ?? stepTypeConfig.read_material) : null;
  const StepIcon = stepConfig?.icon ?? Brain;

  const handleBegin = () => {
    if (!primaryStep || !activePath) return;
    if (primaryStep.status === "available") {
      startStep.mutate(
        { pathId: activePath.id, stepId: primaryStep.id },
        { onSuccess: () => navigateToStep(primaryStep, activePath.id, setLoc) }
      );
    } else {
      navigateToStep(primaryStep, activePath.id, setLoc);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <StudyNav />

      <main className="max-w-xl mx-auto px-4 py-8 space-y-6">
        {/* Greeting + context */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">
              {getGreeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </h1>
            {examTarget ? (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5 text-orange-500" />
                Preparing for: <span className="font-medium text-foreground">{examTarget}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">
                {hasActivePath ? "Your AI coach has chosen your next step." : "Let's build your personalized learning journey."}
              </p>
            )}
          </div>
          {learningProfile && profileLabel(learningProfile) && (
            <Badge variant="outline" className="shrink-0 text-[10px] gap-1">
              <Brain className="h-3 w-3" />
              {profileLabel(learningProfile)}
            </Badge>
          )}
        </div>

        {/* Main content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <Brain className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Preparing your next step...</p>
            </div>
          </div>
        ) : hasActivePath && primaryStep && stepConfig ? (
          <>
            {/* AI Coach - single Next Step card */}
            <Card className="border-primary/20 overflow-hidden shadow-sm">
              <div className="h-1 bg-gradient-to-r from-primary to-primary/40" />
              <CardContent className="py-5 px-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${stepConfig.bg} flex items-center justify-center shrink-0`}>
                    <StepIcon className={`h-5 w-5 ${stepConfig.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Your Next Step</p>
                    <p className={`text-xs font-medium ${stepConfig.color}`}>{stepConfig.label}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="h-3 w-3" />
                    {primaryStep.estimatedMinutes}m
                  </div>
                </div>

                <h2 className="font-bold text-lg leading-snug mb-3">
                  {primaryStep.title}
                </h2>

                {coachingMessage && (
                  <div className="bg-muted/50 rounded-lg p-3 mb-4 border-l-2 border-primary/40">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{coachingMessage}</p>
                    </div>
                  </div>
                )}

                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handleBegin}
                  disabled={startStep.isPending}
                >
                  {primaryStep.status === "in_progress" ? "Continue this step" : "Begin this step"}
                  <ArrowRight className="h-4 w-4" />
                </Button>

                {/* Dialogue affordance, the learner should never feel stuck. One tap to ask. */}
                <button
                  type="button"
                  onClick={() => setLoc("/tutor")}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary py-1.5 rounded-md"
                >
                  <MessageCircle className="h-3 w-3" /> Talk this through with your tutor first
                </button>
              </CardContent>
            </Card>

            {/* Journey progress (subtle) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Your Journey</span>
                <span className="text-muted-foreground text-xs">
                  Step {Math.min(progress.completedSteps + 1, progress.totalSteps || 1)} of {progress.totalSteps}
                </span>
              </div>
              <Progress value={progress.percentComplete} className="h-1.5" />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{progress.percentComplete}% complete</p>
              </div>
            </div>

            {/* Up Next (small preview, no action) */}
            {upcomingSteps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Coming Up</p>
                <div className="space-y-2">
                  {upcomingSteps.slice(0, 2).map((step: any) => {
                    const conf = stepTypeConfig[step.stepType] ?? stepTypeConfig.read_material;
                    const ConfIcon = conf.icon;
                    return (
                      <div key={step.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-transparent">
                        <div className={`w-7 h-7 rounded-md ${conf.bg} flex items-center justify-center shrink-0`}>
                          <ConfIcon className={`h-3.5 w-3.5 ${conf.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{step.title}</p>
                          <p className="text-[10px] text-muted-foreground">{step.estimatedMinutes}m · {conf.label}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : hasActivePath && !primaryStep ? (
          // Path active but nothing available right now, explicit "come back when, bring what" guidance
          // so the learner doesn't have to guess what to do with the down-time.
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h2 className="font-bold text-lg mb-1">You're done for now</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Rest matters as much as the work. Your next review will unlock automatically when memory needs the reinforcement.
              </p>
              <div className="text-left max-w-sm mx-auto space-y-2 text-sm mb-4">
                <div className="rounded-lg bg-white/70 border border-emerald-100 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mb-0.5">Come back</div>
                  <div className="text-gray-800">When you feel ready, your next review unlocks automatically once spaced repetition decides you'll benefit most.</div>
                </div>
                <div className="rounded-lg bg-white/70 border border-emerald-100 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold mb-0.5">Bring with you</div>
                  <div className="text-gray-800">Just yourself. No prep needed, your AI coach will pick the next step.</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLoc("/tutor")} className="gap-1.5">
                <MessageCircle className="h-3.5 w-3.5" /> Ask about anything you covered
              </Button>
            </CardContent>
          </Card>
        ) : materials && materials.length > 0 ? (
          // Materials exist but no active path, let the AI build one
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-8 px-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-bold mb-1">Let the AI lead your study plan</h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                Pick a material and your coach will sequence every concept into a guided path: read → recall → practice → mastery check. You just follow the next step.
              </p>
              <div className="space-y-2 max-w-sm mx-auto text-left">
                {materials.map((m) => (
                  <Button
                    key={m.id}
                    variant="outline"
                    className="w-full justify-between h-auto py-3 px-4"
                    disabled={buildingPath}
                    onClick={() => buildPath(m.id)}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-4 w-4 text-primary shrink-0" />
                      <span className="truncate font-medium">{m.title}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      {m.conceptCount ?? 0} concepts <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Button>
                ))}
              </div>
              {buildingPath && (
                <p className="text-xs text-muted-foreground mt-4">
                  Building your personalized path, this takes a few seconds.
                </p>
              )}
              {planError && (
                <div className="mt-4 mx-auto max-w-sm rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 text-left">
                  {planError}
                </div>
              )}
              <div className="mt-5 pt-4 border-t border-primary/10 flex items-center justify-center gap-3 text-xs">
                <button
                  className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setLoc("/materials/new")}
                >
                  Add another material
                </button>
                <span className="text-muted-foreground/50">·</span>
                <button
                  className="text-muted-foreground hover:text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={clearingHistory}
                  onClick={clearStaleHistory}
                >
                  Clear old practice history
                </button>
              </div>
            </CardContent>
          </Card>
        ) : (
          // No materials at all, onboarding
          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardContent className="py-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Start Your Learning Journey</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Your learning profile is ready. Now upload your material and we'll build a personalized study strategy for you.
              </p>
              <Button size="lg" className="gap-2" onClick={() => setLoc("/materials/new")}>
                <BookOpen className="h-4 w-4" />
                Upload Material
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
