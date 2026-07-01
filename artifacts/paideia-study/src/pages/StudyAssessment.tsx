import { useState, useEffect, useCallback, createElement } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useStudyAssessment, useCompleteAssessment } from "@/hooks/use-study-journey";
import {
  Brain, CheckCircle2, XCircle, ArrowRight, RotateCcw,
  Sparkles, Clock, Target, Zap, BookOpen, Trophy,
  ChevronRight, Loader2, TrendingUp, Lightbulb
} from "lucide-react";
import StudyNav from "@/components/StudyNav";

interface Answer {
  questionId: string;
  selectedOptionIndex: number;
  timeSpentSeconds: number;
  correct?: boolean;
}

export default function StudyAssessment() {
  const [, params] = useRoute("/assessment/:id");
  const [, setLoc] = useLocation();
  const assessmentId = params?.id;
  const { data: assessment, isLoading } = useStudyAssessment(assessmentId);
  const completeMutation = useCompleteAssessment();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<any>(null);

  const questions = assessment?.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = answers.length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  useEffect(() => {
    setQuestionStartTime(Date.now());
    setSelectedOption(null);
    setShowExplanation(false);
  }, [currentIndex]);

  const handleSelectOption = (index: number) => {
    if (showExplanation) return;
    setSelectedOption(index);
  };

  const handleSubmitAnswer = useCallback(() => {
    if (selectedOption === null || !currentQuestion) return;

    const timeSpent = Math.round((Date.now() - questionStartTime) / 1000);
    const isCorrect = selectedOption === currentQuestion.correctOptionIndex;

    const answer: Answer = {
      questionId: currentQuestion.id,
      selectedOptionIndex: selectedOption,
      timeSpentSeconds: timeSpent,
      correct: isCorrect,
    };

    setAnswers((prev) => [...prev, answer]);
    setShowExplanation(true);
  }, [selectedOption, currentQuestion, questionStartTime]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      // Submit all answers
      setIsSubmitting(true);
      completeMutation.mutate(
        {
          id: assessmentId!,
          answers: answers.map(({ correct, ...a }) => a),
        },
        {
          onSuccess: (data) => {
            setResults(data);
            setIsSubmitting(false);
          },
          onError: () => setIsSubmitting(false),
        },
      );
    }
  }, [currentIndex, questions.length, answers, assessmentId, completeMutation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Brain className="h-8 w-8 text-primary animate-pulse mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Preparing your diagnostic assessment...</p>
        </div>
      </div>
    );
  }

  // Results screen
  if (results) {
    const { score, detectedDifficulty, recommendedPathType, accuracyByConcept, conceptNameMap, learningProfile, avgTimePerQuestion, sampleSizeBreakdown } = results.results ?? {};

    // Build concept accuracies with names, sorted weakest first
    const conceptAccuracies = Object.entries(accuracyByConcept ?? {})
      .map(([id, acc]) => ({
        id,
        name: (conceptNameMap?.[id]?.title) || "Concept",
        accuracy: acc as number,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakConcepts = conceptAccuracies.filter((c) => c.accuracy < 50);
    const strongConcepts = conceptAccuracies.filter((c) => c.accuracy >= 70);
    const moderateConcepts = conceptAccuracies.filter((c) => c.accuracy >= 50 && c.accuracy < 70);

    const pathTypeLabel = recommendedPathType === "gentle" ? "Gentle Pace" : recommendedPathType === "intensive" ? "Intensive" : "Standard";
    const pathTypeDesc = recommendedPathType === "gentle"
      ? "Extra scaffolding and repetition. More time on each concept before advancing."
      : recommendedPathType === "intensive"
      ? "Fast-paced with deeper connections. Assumes solid foundation, pushes to mastery quickly."
      : "Balanced approach. Solid instruction with moderate practice per concept.";

    return (
      <div className="min-h-screen bg-background">
        <main className="max-w-2xl mx-auto px-4 py-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Your Study Plan is Ready</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Here's What the AI Found</h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Based on your diagnostic, the AI chose where to start and how fast to move. Here's why.
            </p>
          </div>

          {/* AI Decision Summary */}
          <Card className="mb-5 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardContent className="py-5 px-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm mb-1">AI's Decision</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    You scored <span className="font-semibold text-foreground">{score}%</span> - {detectedDifficulty === "advanced" ? "strong grasp" : detectedDifficulty === "intermediate" ? "decent foundation" : "building from fundamentals"}.
                    The AI has scheduled <span className="font-semibold text-foreground">{weakConcepts.length > 0 ? weakConcepts.length : "no"} weak concept{weakConcepts.length !== 1 ? "s" : ""}</span> first
                    {strongConcepts.length > 0 ? ` and will briefly revisit ${strongConcepts.length} mastered concept${strongConcepts.length !== 1 ? "s" : ""} for retention.` : "."}
                    Path type: <span className="font-semibold text-foreground">{pathTypeLabel}</span>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score + Path Type */}
          <div className="grid sm:grid-cols-3 gap-3 mb-5">
            <Card className="sm:col-span-1">
              <CardContent className="py-5 text-center">
                <div className="relative w-20 h-20 mx-auto mb-2">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/20" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      strokeDashoffset={`${2 * Math.PI * 42 * (1 - score / 100)}`}
                      strokeLinecap="round"
                      className={score >= 70 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-orange-500"}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold">{score}%</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Diagnostic Score</p>
              </CardContent>
            </Card>
            <Card className="sm:col-span-2">
              <CardContent className="py-5 px-5">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{pathTypeLabel} Path</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{pathTypeDesc}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant={detectedDifficulty === "advanced" ? "default" : detectedDifficulty === "intermediate" ? "secondary" : "outline"}>
                    {detectedDifficulty?.charAt(0).toUpperCase() + detectedDifficulty?.slice(1)} Level Detected
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Learning Profile - cognitive science-based */}
          {learningProfile && (
            <Card className="mb-5 border-primary/20">
              <CardContent className="py-5 px-5">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Your Learning Profile</h3>
                  <Badge variant="outline" className={`text-[10px] ml-auto ${
                    learningProfile.inferenceConfidence === "strong" ? "border-emerald-300 text-emerald-700" :
                    learningProfile.inferenceConfidence === "low" ? "border-amber-300 text-amber-700" : ""
                  }`}>
                    {learningProfile.inferenceConfidence === "strong" ? "Strong confidence" :
                     learningProfile.inferenceConfidence === "moderate" ? "Moderate signal" :
                     learningProfile.inferenceConfidence === "developing" ? "Developing signal" :
                     "Early signal"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                  Inferred from how you answered - your response patterns across question types, timing, and accuracy trend. Not a self-report quiz, and not VARK. The AI uses these signals to sequence your path and will refine them as you progress.
                  {(learningProfile.inferenceConfidence === "low" || learningProfile.inferenceConfidence === "developing") && (
                    <span className="block mt-1 text-amber-700"> ⚠ Based on {learningProfile.sampleSize ?? sampleSizeBreakdown?.total ?? 0} questions - treat these as initial hints that will sharpen as you do more.</span>
                  )}
                </p>
                {(() => {
                  const strengths = learningProfile.strengthByQuestionType ?? { recall: 0, comprehension: 0, application: 0 };
                  const strengthOrder = (["recall", "comprehension", "application"] as const).slice().sort((a, b) => strengths[b] - strengths[a]);
                  const strengthModality = strengthOrder[0]!;
                  return (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Processing Style</p>
                    <p className="text-sm font-semibold capitalize">{learningProfile.processingStyle}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {learningProfile.processingStyle === "conceptual"
                        ? "You grasp the big picture first, then fill in details."
                        : learningProfile.processingStyle === "sequential"
                        ? "You build understanding step-by-step from fundamentals."
                        : "You shift between big-picture and step-by-step as the material asks."}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Pace</p>
                    <p className="text-sm font-semibold capitalize">{learningProfile.pace}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {learningProfile.pace === "deliberate"
                        ? `Avg ${avgTimePerQuestion ?? "-"}s/question - you think things through.`
                        : learningProfile.pace === "quick"
                        ? `Avg ${avgTimePerQuestion ?? "-"}s/question - quick pattern recognition.`
                        : `Avg ${avgTimePerQuestion ?? "-"}s/question - balanced reflection.`}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Strength</p>
                    <p className="text-sm font-semibold capitalize">{strengthModality}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {strengthModality === "application"
                        ? "Strong at applying concepts to new problems."
                        : strengthModality === "comprehension"
                        ? "Strong at explaining and interpreting concepts."
                        : "Strong at remembering facts and definitions."}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/40">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">Confidence Pattern</p>
                    <p className="text-sm font-semibold capitalize">{learningProfile.confidencePattern}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {learningProfile.confidencePattern === "improving"
                        ? "You warm up - your accuracy grew through the quiz."
                        : learningProfile.confidencePattern === "fatiguing"
                        ? "Best to keep sessions short - accuracy faded over time."
                        : "Steady performance - consistent attention throughout."}
                    </p>
                  </div>
                </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Concept Breakdown - Prioritized */}
          {conceptAccuracies.length > 0 && (
            <Card className="mb-5">
              <CardContent className="py-5 px-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Concept Priority - Weakest First
                  </h3>
                  <span className="text-[10px] text-muted-foreground">Order = study sequence</span>
                </div>
                <div className="space-y-3">
                  {conceptAccuracies.map((c, i) => {
                    const isWeak = c.accuracy < 50;
                    const isStrong = c.accuracy >= 70;
                    return (
                      <div key={c.id} className={`p-3 rounded-lg border ${isWeak ? "border-orange-200 bg-orange-50/50" : isStrong ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-card"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center ${isWeak ? "bg-orange-100 text-orange-600" : isStrong ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                            <span className="text-sm font-medium truncate max-w-[200px] sm:max-w-xs">{c.name}</span>
                          </div>
                          <span className={`text-xs font-semibold ${isWeak ? "text-orange-600" : isStrong ? "text-emerald-600" : "text-amber-600"}`}>
                            {c.accuracy}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isWeak ? "bg-orange-500" : isStrong ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${c.accuracy}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {isWeak ? "Needs focused study - assigned first in your path" : isStrong ? "Solid - brief retention review scheduled" : "Moderate - standard practice sequence"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA */}
          <div className="text-center">
            <Button size="lg" className="gap-2 w-full max-w-xs" onClick={() => setLoc("/dashboard")}>
              <Trophy className="h-4 w-4" />
              Start My Personalized Path
              <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="text-xs text-muted-foreground mt-3 max-w-sm mx-auto">
              The AI has built {conceptAccuracies.length} concept stages with {recommendedPathType === "gentle" ? "extra practice" : recommendedPathType === "intensive" ? "advanced connections" : "balanced study"} per concept.
              Your first step is ready.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Assessment in progress
  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">All questions answered!</p>
          <Button className="mt-4" onClick={handleNext} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Submit Assessment
          </Button>
        </div>
      </div>
    );
  }

  const difficultyColor =
    currentQuestion.difficulty === "easy" ? "text-emerald-600 bg-emerald-50" :
    currentQuestion.difficulty === "hard" ? "text-orange-600 bg-orange-50" :
    "text-amber-600 bg-amber-50";

  const typeIcon =
    currentQuestion.type === "recall" ? BookOpen :
    currentQuestion.type === "application" ? Target :
    Lightbulb;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <StudyNav />
      <header className="border-b px-4 py-3 sticky top-12 bg-background/95 backdrop-blur-sm z-40">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Diagnostic Assessment</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Question {currentIndex + 1} of {questions.length}</span>
          </div>
        </div>
        <Progress value={progress} className="h-1 mt-3 max-w-2xl mx-auto" />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Question Card */}
        <Card className="mb-6">
          <CardContent className="py-6 px-5">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${difficultyColor}`}>
                {typeIcon ? createElement(typeIcon, { className: "h-3 w-3" }) : null}
                {currentQuestion.type}
              </Badge>
              <Badge variant="outline" className={`text-[10px] h-5 ${difficultyColor}`}>
                {currentQuestion.difficulty}
              </Badge>
            </div>

            <h2 className="text-lg font-semibold leading-relaxed mb-6">
              {currentQuestion.questionText}
            </h2>

            {/* Options */}
            <div className="space-y-2.5">
              {currentQuestion.options.map((opt: string, idx: number) => {
                const isSelected = selectedOption === idx;
                const isCorrect = idx === currentQuestion.correctOptionIndex;
                const showCorrectness = showExplanation;

                let btnClass = "border hover:border-primary/50 hover:bg-primary/5";
                if (showCorrectness) {
                  if (isCorrect) btnClass = "border-emerald-500 bg-emerald-50 text-emerald-900";
                  else if (isSelected && !isCorrect) btnClass = "border-red-400 bg-red-50 text-red-900";
                  else btnClass = "border-muted bg-muted/30";
                } else if (isSelected) {
                  btnClass = "border-primary bg-primary/10 text-primary";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    disabled={showExplanation}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ${btnClass}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      showCorrectness
                        ? isCorrect
                          ? "bg-emerald-500 text-white"
                          : isSelected
                          ? "bg-red-400 text-white"
                          : "bg-muted text-muted-foreground"
                        : isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {showCorrectness && isCorrect ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                       showCorrectness && isSelected && !isCorrect ? <XCircle className="h-3.5 w-3.5" /> :
                       String.fromCharCode(65 + idx)}
                    </div>
                    <span className="text-sm leading-relaxed">{opt}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Explanation */}
        {showExplanation && (
          <Card className={`mb-6 border-l-4 ${answers[answers.length - 1]?.correct ? "border-l-emerald-500" : "border-l-amber-500"}`}>
            <CardContent className="py-4 px-5">
              <div className="flex items-start gap-3">
                {answers[answers.length - 1]?.correct ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Lightbulb className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`text-sm font-medium ${answers[answers.length - 1]?.correct ? "text-emerald-700" : "text-amber-700"}`}>
                    {answers[answers.length - 1]?.correct ? "Correct!" : "Not quite - here's why:"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{currentQuestion.explanation}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {answeredCount} of {questions.length} answered
          </div>
          {!showExplanation ? (
            <Button
              size="lg"
              className="gap-2"
              disabled={selectedOption === null}
              onClick={handleSubmitAnswer}
            >
              Submit Answer
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="lg"
              className="gap-2"
              onClick={handleNext}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {currentIndex < questions.length - 1 ? (
                <>Next Question <ChevronRight className="h-4 w-4" /></>
              ) : (
                <>Finish Assessment <CheckCircle2 className="h-4 w-4" /></>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
