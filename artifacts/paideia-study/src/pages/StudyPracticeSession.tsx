import { useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useCompletePathStep } from "@/hooks/use-study-journey";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useGetStudyPractice,
  useAnswerStudyPractice,
} from "@workspace/paideia-api-client";
import { ArrowLeft, CheckCircle2, XCircle, TrendingUp, Brain } from "lucide-react";

export default function StudyPracticeSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [, setLoc] = useLocation();
  const { data: session, isLoading } = useGetStudyPractice(sessionId);
  const answerMutation = useAnswerStudyPractice();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(3);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const completePathStep = useCompletePathStep();
  const [didCompletePathStep, setDidCompletePathStep] = useState(false);
  const searchRef = useRef(new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""));
  const pathStepId = searchRef.current.get("pathStepId");
  const pathId = searchRef.current.get("pathId");
  const [startTime] = useState(Date.now());

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (session.status === "completed" || summary) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b px-6 py-4">
          <Button variant="ghost" size="sm" onClick={() => setLoc("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
        </header>
        <main className="max-w-lg mx-auto px-6 py-12 text-center">
          <div className="mb-6">
            {summary && summary.accuracy >= 0.7 ? (
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-3" />
            ) : (
              <Brain className="h-16 w-16 text-primary mx-auto mb-3" />
            )}
            <h2 className="text-2xl font-bold mb-1">Session Complete!</h2>
            <p className="text-muted-foreground">
              {summary
                ? `${summary.correctCount} / ${summary.totalQuestions} correct (${Math.round(summary.accuracy * 100)}%)`
                : "Good effort!"}
            </p>
          </div>

          {summary && summary.weakConcepts.length > 0 && (
            <Card className="mb-4 text-left">
              <CardContent className="py-4">
                <h3 className="font-semibold text-sm mb-2 text-red-600">Areas to Review</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.weakConcepts.map((c: string) => (
                    <span key={c} className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs">
                      {c}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {summary && summary.strongConcepts.length > 0 && (
            <Card className="mb-4 text-left">
              <CardContent className="py-4">
                <h3 className="font-semibold text-sm mb-2 text-green-600">Strong Areas</h3>
                <div className="flex flex-wrap gap-2">
                  {summary.strongConcepts.map((c: string) => (
                    <span key={c} className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs">
                      {c}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pathStepId && pathId && !didCompletePathStep && (
            <Button
              variant="default"
              className="gap-1.5"
              onClick={() => {
                completePathStep.mutate(
                  { pathId, stepId: pathStepId, masteryScore: summary?.accuracy ?? 0.7, durationSeconds: Math.round((Date.now() - startTime) / 1000) },
                  { onSuccess: () => setDidCompletePathStep(true) }
                );
              }}
              disabled={completePathStep.isPending}
            >
              {completePathStep.isPending ? "Completing..." : "Mark Path Step Complete"}
            </Button>
          )}
          <Button onClick={() => setLoc("/practice")} variant="outline">Practice Again</Button>
        </main>
      </div>
    );
  }

  const currentQuestion = session.currentQuestion;
  if (!currentQuestion) {
    const isEmpty = session.questionCount === 0;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center space-y-3">
            <Brain className="h-10 w-10 text-muted-foreground mx-auto" />
            <div className="font-semibold">
              {isEmpty ? "No questions could be generated" : "No more questions"}
            </div>
            <p className="text-sm text-muted-foreground">
              {isEmpty
                ? "The AI couldn't produce questions for this material. This usually means concepts haven't been extracted yet, or the AI service is temporarily unavailable."
                : "You've finished every question in this session."}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => setLoc("/practice")}>Back to Practice</Button>
              <Button onClick={() => setLoc("/materials")}>Open materials</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleAnswer = async () => {
    if (selectedIndex === null) return;
    const res = await answerMutation.mutateAsync({
      sessionId,
      data: {
        questionId: currentQuestion.id,
        selectedOptionIndex: selectedIndex,
        confidence,
      },
    });
    setResult(res);
    setSubmitted(true);
    if (res.sessionComplete && res.sessionSummary) {
      setSummary(res.sessionSummary);
    }
  };

  const handleNext = () => {
    setSelectedIndex(null);
    setConfidence(3);
    setSubmitted(false);
    setResult(null);
  };

  const progress = ((session.answeredCount) / session.questionCount) * 100;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {session.answeredCount + 1} / {session.questionCount}
        </span>
        <div className="w-32 bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <Card className="mb-6">
          <CardContent className="py-6">
            <p className="font-medium text-lg mb-6">{currentQuestion.prompt}</p>

            <div className="space-y-2">
              {currentQuestion.options.map((opt: string, i: number) => {
                let bg = "bg-background border hover:bg-muted";
                if (submitted) {
                  if (i === currentQuestion.correctOptionIndex) bg = "bg-green-50 border-green-300";
                  else if (i === selectedIndex) bg = "bg-red-50 border-red-300";
                  else bg = "bg-muted border-muted opacity-50";
                } else if (i === selectedIndex) {
                  bg = "bg-primary/10 border-primary";
                }
                return (
                  <button
                    key={i}
                    onClick={() => !submitted && setSelectedIndex(i)}
                    disabled={submitted}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${bg}`}
                  >
                    <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {submitted && result && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  {result.correct ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="font-medium">{result.correct ? "Correct!" : "Incorrect"}</span>
                </div>
                <p className="text-sm text-muted-foreground">{result.explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {!submitted ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">How sure are you of your answer?</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { n: 1, label: "Guess" },
                  { n: 3, label: "Pretty sure" },
                  { n: 5, label: "Certain" },
                ].map((opt) => (
                  <Button
                    key={opt.n}
                    variant={confidence === opt.n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setConfidence(opt.n)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                Calibrating your confidence helps us find your real blind spots.
              </p>
            </div>
            <Button className="w-full" onClick={handleAnswer} disabled={selectedIndex === null}>
              Submit Answer
            </Button>
          </div>
        ) : (
          <Button className="w-full" onClick={handleNext}>
            {result?.sessionComplete ? "See Results" : "Next Question"}
          </Button>
        )}
      </main>
    </div>
  );
}
