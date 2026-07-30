import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Check, Clock, Volume2, Type, Captions, Sparkles } from "lucide-react";
import { useCoachProfile } from "@/lib/coachApi";

/**
 * Visible "learning supports" layer for learners with accommodations.
 *
 * Renders ONLY when the signed-in learner has one or more accommodations on their profile, so it
 * never appears for a learner without them (no impact on other tenants). It surfaces the supports
 * that are otherwise applied silently by the AI tutor, and adds two things the learner can actually
 * operate: an "easy-reading text" toggle (larger, more legible type, applied to the whole app) and a
 * read-aloud sample. Extra-time and captions are shown as active badges. This is what makes the
 * accommodations demonstrable rather than invisible.
 */

const FRIENDLY: Record<string, string> = {
  scaffolded_questions: "Step-by-step questions",
  simplified_language: "Simpler wording",
  concrete_examples: "Real-world examples",
  positive_reinforcement: "Encouragement",
  chunked_content: "One idea at a time",
  explicit_transitions: "Clear signposts",
  predictable_structure: "Predictable layout",
  extended_processing: "Extra thinking time",
  literal_language: "Direct, literal language",
};

const EASY_CLASS = "easy-reading";
const EASY_KEY = "k12-easy-reading";
const EASY_CSS =
  "html." + EASY_CLASS + "{font-size:18px}" +
  "html." + EASY_CLASS + " body{font-family:'Atkinson Hyperlegible','Verdana','Trebuchet MS',system-ui,sans-serif;letter-spacing:.02em;word-spacing:.08em;line-height:1.85}";

function ensureEasyCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById("easy-reading-css")) return;
  const s = document.createElement("style");
  s.id = "easy-reading-css";
  s.textContent = EASY_CSS;
  document.head.appendChild(s);
}

export function AccommodationsPanel() {
  const { data: profile } = useCoachProfile();
  const accommodations = profile?.accommodations ?? [];
  const [easy, setEasy] = useState(false);

  useEffect(() => {
    ensureEasyCss();
    const on = typeof window !== "undefined" && window.localStorage.getItem(EASY_KEY) === "1";
    setEasy(on);
    document.documentElement.classList.toggle(EASY_CLASS, on);
  }, []);

  if (!accommodations.length) return null;

  const toggleEasy = () => {
    const next = !easy;
    setEasy(next);
    document.documentElement.classList.toggle(EASY_CLASS, next);
    try { window.localStorage.setItem(EASY_KEY, next ? "1" : "0"); } catch { /* ok */ }
  };

  const speakSample = () => {
    try {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("You've got this. Let's take it one step at a time.");
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch { /* ok */ }
  };

  const hasExtraTime = accommodations.includes("extended_processing");

  return (
    <Card className="p-4 sm:p-5 border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center bg-indigo-500/15 text-indigo-600">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Your learning supports</p>
          <p className="text-xs text-muted-foreground">Turned on for you — always active while you learn.</p>
        </div>
        <span className="ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</span>
      </div>

      {/* Active supports as chips */}
      <div className="flex flex-wrap gap-2 mt-3">
        {accommodations.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5 border border-indigo-100 dark:border-white/10 text-indigo-800 dark:text-indigo-200">
            <Check className="h-3.5 w-3.5 text-indigo-500" />
            {FRIENDLY[a] ?? a.replace(/_/g, " ")}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5 border border-indigo-100 dark:border-white/10 text-indigo-800 dark:text-indigo-200">
          <Captions className="h-3.5 w-3.5 text-indigo-500" /> Captions on videos
        </span>
        {hasExtraTime && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-200 text-amber-700">
            <Clock className="h-3.5 w-3.5" /> Extra time on activities
          </span>
        )}
      </div>

      {/* Controls the learner can operate */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={toggleEasy}
          className={
            "inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border transition-colors " +
            (easy
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white dark:bg-transparent text-indigo-700 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-50")
          }
          aria-pressed={easy}
        >
          <Type className="h-4 w-4" /> Easy-reading text: {easy ? "On" : "Off"}
        </button>
        <button
          onClick={speakSample}
          className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border bg-white dark:bg-transparent text-indigo-700 dark:text-indigo-300 border-indigo-200 hover:bg-indigo-50"
        >
          <Volume2 className="h-4 w-4" /> Hear read-aloud
        </button>
        <p className="text-xs text-muted-foreground basis-full sm:basis-auto sm:ml-1">
          Your tutor also adapts automatically — shorter steps, simpler wording, and encouragement.
        </p>
      </div>
    </Card>
  );
}
