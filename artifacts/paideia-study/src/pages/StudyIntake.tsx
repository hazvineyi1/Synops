import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Sparkles } from "lucide-react";
import {
  useStudyProfile,
  useUpdateStudyProfile,
} from "@/hooks/use-study-journey";

type Step =
  | "goal"
  | "examDate"
  | "hoursPerWeek"
  | "baseline"
  | "calibration"
  | "failureMode"
  | "coach"
  | "review";

const STEPS: Step[] = [
  "goal",
  "examDate",
  "hoursPerWeek",
  "baseline",
  "calibration",
  "failureMode",
  "coach",
  "review",
];

const BASELINE_OPTIONS = [
  { value: "zero", label: "Brand new to this", hint: "Starting from scratch" },
  { value: "foundations", label: "Some foundations", hint: "I've seen the basics" },
  { value: "rusty", label: "Studied before, rusty now", hint: "I need a refresher" },
  { value: "solid", label: "Solid base, polishing", hint: "I'm refining edges" },
];

const CALIBRATION_OPTIONS = [
  { value: "high", label: "Confident I'll do well", hint: "I expect strong results" },
  { value: "mid", label: "Cautiously optimistic", hint: "I think I'm on track" },
  { value: "low", label: "Pretty unsure", hint: "I'm worried I'll fall short" },
  { value: "under", label: "Underestimating myself", hint: "I always think I'll fail and don't" },
];

const FAILURE_MODE_OPTIONS = [
  { value: "passive", label: "I re-read but don't really practice", hint: "Mostly highlighting & reviewing" },
  { value: "cram", label: "I cram right before the test", hint: "Big push at the end" },
  { value: "avoid", label: "I avoid the hard topics", hint: "I skip what makes me uncomfortable" },
  { value: "scattered", label: "I jump between topics", hint: "Hard to stick with one thing" },
  { value: "perfect", label: "I get stuck perfecting one topic", hint: "I can't move on until it feels mastered" },
];

const COACH_OPTIONS = [
  { value: "drill",    label: "The Drill Sergeant",     hint: "Direct, demanding, high accountability. Push me hard." },
  { value: "socratic", label: "The Socratic Mentor",    hint: "Leads with questions. Makes me reason to the answer." },
  { value: "warm",     label: "The Warm Encourager",    hint: "Supportive, steady, normalises struggle. Keeps me moving." },
  { value: "analyst",  label: "The Strategic Analyst",  hint: "Calm, data-driven. Shows me the path to the exam." },
];

// Recommendation, voice/pressure only; never changes pedagogy or accuracy.
// Scoring (highest wins) lets multiple weak signals combine instead of one early `return`
// hiding the rest, e.g. low-confidence avoidant studiers still see Drill if the avoidance
// signal outweighs the timidity signal.
function recommendCoach(baseline: string, calibration: string, failureMode: string): string {
  const score: Record<"drill" | "socratic" | "warm" | "analyst", number> = {
    drill: 0, socratic: 0, warm: 0, analyst: 0,
  };
  // Spec: "low confidence + 'I often overestimate' leans Socratic or Analyst"
  if (calibration === "high")  { score.socratic += 3; score.analyst += 1; } // overestimates
  if (calibration === "under") { score.analyst  += 3; score.socratic += 1; } // underestimates
  if (calibration === "low")   { score.warm     += 2; }                      // anxious
  if (calibration === "mid")   { score.analyst  += 1; }
  // Spec: "rebuilding/rusty leans Encourager"
  if (baseline === "rusty")       score.warm     += 2;
  if (baseline === "zero")        score.warm     += 1;
  if (baseline === "foundations") score.socratic += 1;
  if (baseline === "solid")       score.analyst  += 1;
  // Failure modes that need a push
  if (failureMode === "passive" || failureMode === "avoid" || failureMode === "cram") score.drill += 3;
  if (failureMode === "scattered") score.analyst += 2;
  if (failureMode === "perfect")   score.socratic += 1;
  const ranked = (Object.entries(score) as [keyof typeof score, number][])
    .sort((a, b) => b[1] - a[1]);
  return ranked[0][1] === 0 ? "warm" : ranked[0][0];
}

export default function StudyIntake() {
  const [, setLoc] = useLocation();
  const { data: profile } = useStudyProfile();
  const updateMutation = useUpdateStudyProfile();

  const [stepIdx, setStepIdx] = useState(0);
  const [goal, setGoal] = useState<string>(profile?.examTarget ?? "");
  const [examDate, setExamDate] = useState<string>(
    profile?.examDate ? new Date(profile.examDate).toISOString().slice(0, 10) : "",
  );
  const [hoursPerWeek, setHoursPerWeek] = useState<number | "">(
    profile?.hoursPerWeek ?? "",
  );
  const [baseline, setBaseline] = useState<string>(profile?.baselineLevel ?? "");
  const [calibration, setCalibration] = useState<string>(profile?.calibrationSelfRating ?? "");
  const [failureMode, setFailureMode] = useState<string>(profile?.failureMode ?? "");
  const [coachPersonality, setCoachPersonality] = useState<string>(profile?.coachPersonality ?? "");
  const [saving, setSaving] = useState(false);

  const recommended = recommendCoach(baseline, calibration, failureMode);

  const step = STEPS[stepIdx];
  const totalQuestions = STEPS.length - 1; // exclude review
  const progress = Math.min(stepIdx, totalQuestions) / totalQuestions;

  const canAdvance = (() => {
    switch (step) {
      case "goal": return goal.trim().length > 0;
      case "examDate": return true; // optional
      case "hoursPerWeek": return typeof hoursPerWeek === "number" && hoursPerWeek > 0;
      case "baseline": return baseline.length > 0;
      case "calibration": return calibration.length > 0;
      case "failureMode": return failureMode.length > 0;
      case "coach": return coachPersonality.length > 0;
      case "review": return true;
      default: return false;
    }
  })();

  const next = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIdx((i) => Math.max(0, i - 1));

  const submit = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        examTarget: goal.trim() || null,
        examDate: examDate ? new Date(examDate).toISOString() : null,
        hoursPerWeek: typeof hoursPerWeek === "number" ? hoursPerWeek : null,
        baselineLevel: baseline || null,
        calibrationSelfRating: calibration || null,
        failureMode: failureMode || null,
        coachPersonality: (coachPersonality || recommended) as "drill" | "socratic" | "warm" | "analyst",
      });
      setLoc("/coach");
    } catch {
      setSaving(false);
      notifyError(undefined, "Couldn't save your intake. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary font-semibold mb-3">
          <Compass className="w-4 h-4" /> Meet your coach
        </div>
        <h1 className="font-serif text-4xl text-foreground leading-tight mb-2">
          First, let me understand you.
        </h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Your answers shape how I plan your days, when I push, and when I ease off. About a minute.
        </p>

        <div className="h-[3px] bg-muted rounded-full mb-7 overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <Card>
          <CardContent className="p-6">
            {step === "goal" && (
              <Section title="What are you preparing for?" hint="Be specific, exam name, course, certification, etc.">
                <Input
                  autoFocus
                  placeholder="e.g., CompTIA Security+, MCAT Biology, Calc II final"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canAdvance && next()}
                />
              </Section>
            )}

            {step === "examDate" && (
              <Section
                title="When's your exam or deadline?"
                hint="Leave blank if you're learning without a fixed date."
              >
                <Input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </Section>
            )}

            {step === "hoursPerWeek" && (
              <Section
                title="How many hours a week can you realistically study?"
                hint="Be honest, under-promising is fine. I adapt as we go."
              >
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    placeholder="e.g., 6"
                    value={hoursPerWeek}
                    onChange={(e) => {
                      const v = e.target.value;
                      setHoursPerWeek(v === "" ? "" : Math.max(1, Math.min(80, Number(v))));
                    }}
                    className="max-w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">hours / week</span>
                </div>
              </Section>
            )}

            {step === "baseline" && (
              <Section title="Where would you say you're starting from?" hint="Your honest baseline, not where you wish you were.">
                <OptionList options={BASELINE_OPTIONS} selected={baseline} onSelect={setBaseline} />
              </Section>
            )}

            {step === "calibration" && (
              <Section
                title="When you think you understand something, how often are you actually right?"
                hint="This tells me how much to trust your own confidence ratings during practice."
              >
                <OptionList options={CALIBRATION_OPTIONS} selected={calibration} onSelect={setCalibration} />
              </Section>
            )}

            {step === "failureMode" && (
              <Section
                title="When studying goes wrong for you, it usually looks like…"
                hint="No judgement, knowing your pattern lets me route around it."
              >
                <OptionList options={FAILURE_MODE_OPTIONS} selected={failureMode} onSelect={setFailureMode} />
              </Section>
            )}

            {step === "coach" && (
              <Section
                title="Which coach do you respond to best?"
                hint="Voice and pressure change. Accuracy never does. You can change this anytime in settings."
              >
                <OptionList
                  options={COACH_OPTIONS}
                  selected={coachPersonality}
                  onSelect={setCoachPersonality}
                  recommendedValue={recommended}
                />
              </Section>
            )}

            {step === "review" && (
              <div>
                <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                  <Sparkles className="w-5 h-5" /> Ready when you are
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Here's what your coach will start with:
                </p>
                <ReviewRow label="Goal" value={goal || "(none)"} />
                <ReviewRow label="Exam date" value={examDate || "Open-ended"} />
                <ReviewRow label="Hours/week" value={String(hoursPerWeek || "-")} />
                <ReviewRow label="Baseline" value={labelOf(BASELINE_OPTIONS, baseline)} />
                <ReviewRow label="Self-prediction" value={labelOf(CALIBRATION_OPTIONS, calibration)} />
                <ReviewRow label="Failure pattern" value={labelOf(FAILURE_MODE_OPTIONS, failureMode)} />
                <ReviewRow label="Coach" value={labelOf(COACH_OPTIONS, coachPersonality || recommended)} />
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={back}
                disabled={stepIdx === 0}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>

              {step !== "review" ? (
                <Button onClick={next} disabled={!canAdvance}>
                  {step === "examDate" && !examDate ? "Skip" : "Next"} <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={submit} disabled={saving}>
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {saving ? "Saving…" : "Meet my coach"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Voice and pressure are tunable. Accuracy is not.
        </p>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-serif text-2xl text-foreground mb-1 leading-snug">{title}</h2>
      {hint && <p className="text-sm text-muted-foreground mb-4">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function OptionList({
  options,
  selected,
  onSelect,
  recommendedValue,
}: {
  options: { value: string; label: string; hint: string }[];
  selected: string;
  onSelect: (v: string) => void;
  recommendedValue?: string;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const active = selected === opt.value;
        const recommended = recommendedValue === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`w-full text-left px-4 py-3 rounded-lg border transition relative ${
              active
                ? "bg-primary/5 border-primary ring-1 ring-primary/30"
                : "bg-card border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-foreground text-sm">{opt.label}</div>
              {recommended && !active && (
                <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                  Recommended for you
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{opt.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b last:border-b-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function labelOf(opts: { value: string; label: string }[], v: string): string {
  return opts.find((o) => o.value === v)?.label ?? "-";
}
