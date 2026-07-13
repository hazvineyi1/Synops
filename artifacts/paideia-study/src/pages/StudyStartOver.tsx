import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { customFetch } from "@workspace/paideia-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Compass, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import StudyNav from "@/components/StudyNav";

type Scope = "progress" | "diagnostic" | "everything";

const OPTIONS: Array<{
  scope: Scope;
  icon: typeof RotateCcw;
  title: string;
  body: string;
  keeps: string;
  removes: string;
}> = [
  {
    scope: "progress",
    icon: RefreshCw,
    title: "Just restart my study plan",
    body: "Use this if you want to take the same goal in a new direction, keep what you've told us about yourself, just clear the path you've been walking.",
    keeps: "Your materials, intake answers, and learning style stay.",
    removes: "All learning paths, practice sessions, and mock exams are deleted.",
  },
  {
    scope: "diagnostic",
    icon: Compass,
    title: "Retake the diagnostic",
    body: "Use this if your goal has changed, your exam date moved, or your honest answers from before don't reflect you anymore. We'll re-ask the intake and learning style questions.",
    keeps: "Your materials and study progress stay.",
    removes: "Your intake answers, learning style, and prior diagnostic assessments are cleared so you can answer again.",
  },
  {
    scope: "everything",
    icon: RotateCcw,
    title: "Start fully fresh",
    body: "A clean slate, like a brand new account but with your materials still uploaded. We'll walk you through onboarding from scratch.",
    keeps: "Only your materials stay.",
    removes: "Intake, learning style, paths, practice, and exams are all cleared.",
  },
];

export default function StudyStartOver() {
  const [, setLoc] = useLocation();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Scope | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Scope | null>(null);

  const run = async () => {
    if (!picked) return;
    setRunning(true);
    try {
      await customFetch("/api/study/profile/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: picked }),
      });
      // Drop every cached query so the next page-load reflects the cleared state, anything
      // less and the gates won't re-trigger correctly.
      await qc.invalidateQueries();
      setDone(picked);
    } catch {
      setRunning(false);
      notifyError(undefined, "Couldn't reset. Please try again.");
    }
  };

  const finish = () => {
    if (!done) return;
    // Diagnostic and everything both clear the intake fields → the dashboard's
    // single onboarding gate will then redirect to /intake.
    setLoc("/dashboard");
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50">
        <StudyNav />
        <main className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 mx-auto mb-4 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Reset complete</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {done === "progress"
              ? "Your study plan is cleared. Pick a material and we'll build a fresh path."
              : "We'll walk you through onboarding again from the dashboard."}
          </p>
          <Button onClick={finish} className="w-full">Continue</Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <StudyNav />
      <main className="max-w-xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => setLoc("/dashboard")} className="-ml-2 mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-2xl font-bold mb-1">Test and start again</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Pick the level of reset that fits. Your uploaded materials are never touched.
        </p>

        <div className="space-y-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = picked === opt.scope;
            return (
              <button
                key={opt.scope}
                onClick={() => { setPicked(opt.scope); setConfirming(false); }}
                className={`w-full text-left rounded-xl border p-4 transition ${
                  active
                    ? "bg-white border-blue-400 ring-2 ring-blue-100"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"
                  }`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm">{opt.title}</div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{opt.body}</p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-[11px]">
                      <div className="text-emerald-700"><span className="font-medium">Keeps:</span> {opt.keeps}</div>
                      <div className="text-rose-700"><span className="font-medium">Removes:</span> {opt.removes}</div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {picked && (
          <Card className="mt-6 border-amber-200 bg-amber-50/50">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm text-amber-900 mb-1">This can't be undone.</div>
                  <p className="text-xs text-amber-800 mb-3">
                    {confirming
                      ? "Are you sure? Tap confirm to proceed."
                      : "When you're ready, tap to confirm and we'll do the reset."}
                  </p>
                  <div className="flex items-center gap-2">
                    {!confirming ? (
                      <Button size="sm" variant="default" onClick={() => setConfirming(true)}>
                        I understand, continue
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="destructive" onClick={run} disabled={running}>
                          {running ? "Resetting…" : "Confirm reset"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={running}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
