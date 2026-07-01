import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useStudyPath } from "@/hooks/use-study-journey";
import {
  Brain, BookOpen, Zap, Target, MessageCircle, CheckCircle2,
  Lock, ArrowLeft, Flame, Award, TrendingUp, Clock,
  ChevronRight, Sparkles, Circle
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

const stepTypeConfig: Record<string, { icon: typeof Brain; label: string; color: string; bg: string }> = {
  read_material: { icon: BookOpen, label: "Read", color: "text-blue-600", bg: "bg-blue-50" },
  flashcard_review: { icon: Zap, label: "Flashcards", color: "text-amber-600", bg: "bg-amber-50" },
  practice_questions: { icon: Target, label: "Practice", color: "text-emerald-600", bg: "bg-emerald-50" },
  tutor_session: { icon: MessageCircle, label: "Tutor", color: "text-purple-600", bg: "bg-purple-50" },
  mastery_check: { icon: Award, label: "Mastery", color: "text-orange-600", bg: "bg-orange-50" },
  spaced_review: { icon: Zap, label: "Review", color: "text-teal-600", bg: "bg-teal-50" },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  locked: { label: "Locked", className: "bg-muted text-muted-foreground" },
  available: { label: "Ready", className: "bg-blue-100 text-blue-700" },
  in_progress: { label: "Active", className: "bg-primary text-primary-foreground" },
  completed: { label: "Done", className: "bg-emerald-100 text-emerald-700" },
  skipped: { label: "Skipped", className: "bg-gray-100 text-gray-500" },
};

export default function StudyLearningPath() {
  const [, setLoc] = useLocation();
  const [, params] = useRoute("/learning-path/:id");
  const pathId = params?.id;
  const { data: pathData, isLoading } = useStudyPath(pathId);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Brain className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading your learning path...</p>
        </div>
      </div>
    );
  }

  if (!pathData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Path Not Found</h1>
          <p className="text-sm text-muted-foreground mb-4">This learning path doesn't exist or you don't have access.</p>
          <Button onClick={() => setLoc("/dashboard")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const steps = pathData.steps ?? [];
  const completedCount = steps.filter((s: any) => s.status === "completed").length;
  const totalCount = steps.length;
  const percentComplete = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Group steps by concept (they come in sequence, so group consecutive same-concept steps)
  const conceptGroups: any[][] = [];
  let currentGroup: any[] = [];
  let currentConcept = "";

  for (const step of steps) {
    const conceptName = step.title.split(":")[1]?.trim() || step.title;
    if (conceptName !== currentConcept && currentGroup.length > 0) {
      conceptGroups.push(currentGroup);
      currentGroup = [];
    }
    currentConcept = conceptName;
    currentGroup.push(step);
  }
  if (currentGroup.length > 0) conceptGroups.push(currentGroup);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <StudyNav />
      <header className="border-b px-4 py-3 sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <Button variant="ghost" size="sm" className="h-auto px-1" onClick={() => setLoc("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-bold text-lg">{pathData.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground ml-8">{pathData.description || "Your personalized learning journey"}</p>

          <div className="flex items-center gap-4 mt-3 ml-8">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">{completedCount} of {totalCount} steps completed</span>
                <span className="font-medium">{percentComplete}%</span>
              </div>
              <Progress value={percentComplete} className="h-2" />
            </div>
            <Badge variant="secondary" className="gap-1 text-xs shrink-0">
              <Clock className="h-3 w-3" />
              {pathData.totalEstimatedMinutes - pathData.completedMinutes}m remaining
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {/* Concept Groups as Journey */}
        {conceptGroups.map((group, gi) => {
          const conceptName = group[0].title.split(":")[1]?.trim() || group[0].title;
          const groupCompleted = group.every((s) => s.status === "completed");
          const groupInProgress = group.some((s) => s.status === "in_progress" || s.status === "available");

          return (
            <div key={gi} className="relative">
              {/* Concept Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  groupCompleted ? "bg-emerald-100 text-emerald-700" :
                  groupInProgress ? "bg-primary text-primary-foreground" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {groupCompleted ? <CheckCircle2 className="h-4 w-4" /> : gi + 1}
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-sm">{conceptName}</h2>
                  <p className="text-[10px] text-muted-foreground">
                    {group.filter((s) => s.status === "completed").length} of {group.length} steps •
                    {group.reduce((sum: number, s: any) => sum + (s.estimatedMinutes ?? 0), 0)} min
                  </p>
                </div>
                {groupCompleted && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 text-[10px]">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Mastered
                  </Badge>
                )}
              </div>

              {/* Steps in Group */}
              <div className="ml-4 pl-8 border-l-2 border-dashed border-muted-foreground/20 space-y-3">
                {group.map((step: any, si: number) => {
                  const config = stepTypeConfig[step.stepType] || stepTypeConfig.read_material;
                  const Icon = config.icon;
                  const status = statusConfig[step.status] || statusConfig.locked;
                  const isLast = si === group.length - 1;

                  return (
                    <Card
                      key={step.id}
                      className={`transition-all ${
                        step.status === "in_progress"
                          ? "ring-1 ring-primary/30 border-primary/20"
                          : step.status === "completed"
                          ? "opacity-60"
                          : step.status === "locked"
                          ? "opacity-40"
                          : "hover:shadow-sm cursor-pointer"
                      }`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            step.status === "completed" ? "bg-emerald-100" :
                            step.status === "in_progress" ? "bg-primary/10" :
                            step.status === "available" ? config.bg : "bg-muted"
                          }`}>
                            {step.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : step.status === "locked" ? (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Icon className={`h-4 w-4 ${config.color}`} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{config.label}</span>
                              <Badge className={`text-[10px] h-4 px-1.5 ${status.className}`}>
                                {status.label}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{step.description || step.title}</p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {step.estimatedMinutes}m
                            </span>
                            {step.status === "available" && (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Journey Complete */}
        {percentComplete === 100 && (
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="py-6 text-center">
              <Sparkles className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-1">Learning Path Complete!</h3>
              <p className="text-sm text-muted-foreground">
                You've mastered all concepts in this path. Add more materials to continue growing.
              </p>
              <Button className="mt-4 gap-2" onClick={() => setLoc("/materials/new")}>
                <BookOpen className="h-4 w-4" />
                Add New Material
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
