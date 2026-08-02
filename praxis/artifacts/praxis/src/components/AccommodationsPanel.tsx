import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Check, Clock, Volume2, Type, Captions, Mic, Sparkles } from "lucide-react";
import { useCoachProfile } from "@/lib/coachApi";
import { useSession } from "@/context/SessionContext";
import { personaByEmail } from "@/lib/k12Personas";

/**
 * Visible "learning supports" panel for learners with accommodations — the demo's headline selling
 * point. It leads with the learner's challenge and why each support helps, then makes the supports
 * real and operable (easy-reading toggle, read-aloud). Renders only when the learner actually has
 * accommodations, so it never appears for the on-track learner or for other tenants.
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
const FRIENDLY_ES: Record<string, string> = {
  scaffolded_questions: "Preguntas paso a paso",
  simplified_language: "Palabras más sencillas",
  concrete_examples: "Ejemplos de la vida real",
  positive_reinforcement: "Ánimo y motivación",
  chunked_content: "Una idea a la vez",
  explicit_transitions: "Indicaciones claras",
  predictable_structure: "Diseño predecible",
  extended_processing: "Más tiempo para pensar",
  literal_language: "Lenguaje directo y claro",
};

const EASY_CLASS = "easy-reading";
const EASY_KEY = "k12-easy-reading";
const EASY_CSS =
  "html." + EASY_CLASS + "{font-size:18px}" +
  "html." + EASY_CLASS + " body{font-family:'Atkinson Hyperlegible','Verdana','Trebuchet MS',system-ui,sans-serif;letter-spacing:.02em;word-spacing:.08em;line-height:1.85}";

function ensureEasyCss() {
  if (typeof document === "undefined" || document.getElementById("easy-reading-css")) return;
  const s = document.createElement("style");
  s.id = "easy-reading-css"; s.textContent = EASY_CSS;
  document.head.appendChild(s);
}

export function AccommodationsPanel({ compact = false }: { compact?: boolean } = {}) {
  const { user } = useSession();
  const { data: profile } = useCoachProfile();
  const accommodations = profile?.accommodations ?? [];
  const persona = personaByEmail(user?.email);
  const es = persona?.defaultLang === "es";
  const L = (en: string, esT: string) => (es ? esT : en);
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
      const es = persona?.defaultLang === "es";
      const u = new SpeechSynthesisUtterance(es ? "Lo estás haciendo muy bien. Vamos paso a paso." : "You've got this. Let's take it one step at a time.");
      u.lang = es ? "es-ES" : "en-US"; u.rate = 0.95;
      window.speechSynthesis.speak(u);
    } catch { /* ok */ }
  };

  const hasExtraTime = accommodations.includes("extended_processing");
  const isDysgraphia = persona?.challenge === "Dysgraphia";
  const accent = persona?.accent ?? "#4F46E5";

  // Compact: a slim supports summary for the dashboard — title, a single tidy row of chips, and the
  // two operable controls. No long tutor paragraph, so it stays smaller than the lesson cards.
  if (compact) {
    return (
      <Card className="p-3.5 h-full" style={{ borderColor: `${accent}44`, background: `${accent}0D` }}>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white" style={{ background: accent }}>
            <Sparkles className="h-4 w-4" />
          </div>
          <p className="font-semibold text-sm leading-tight">
            {persona ? L(`How ${persona.first} learns`, `Los apoyos de ${persona.first}`) : L("Your learning supports", "Tus apoyos")}
          </p>
          <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">{L("Active", "Activo")}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {accommodations.slice(0, 4).map((a) => (
            <span key={a} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-white dark:bg-white/5" style={{ border: `1px solid ${accent}33`, color: accent }}>
              <Check className="h-3 w-3" />{(es ? FRIENDLY_ES[a] : FRIENDLY[a]) ?? a.replace(/_/g, " ")}
            </span>
          ))}
          {accommodations.length > 4 && (
            <span className="inline-flex items-center text-[11px] px-2 py-1 rounded-full text-muted-foreground">+{accommodations.length - 4}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <button onClick={toggleEasy} aria-pressed={easy}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors"
            style={easy ? { background: accent, color: "#fff", borderColor: accent } : { background: "transparent", color: accent, borderColor: `${accent}55` }}>
            <Type className="h-3.5 w-3.5" /> {L("Easy-reading", "Lectura fácil")}: {easy ? L("On", "Sí") : L("Off", "No")}
          </button>
          <button onClick={speakSample}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border"
            style={{ background: "transparent", color: accent, borderColor: `${accent}55` }}>
            <Volume2 className="h-3.5 w-3.5" /> {persona?.defaultLang === "es" ? "Escuchar" : "Read aloud"}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5" style={{ borderColor: `${accent}44`, background: `${accent}0D` }}>
      <div className="flex items-start gap-2.5 mb-1">
        <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white" style={{ background: accent }}>
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">
            {persona ? L(`How ${persona.first} learns`, `Los apoyos de ${persona.first}`) : L("Your learning supports", "Tus apoyos de aprendizaje")}
          </p>
          <p className="text-xs text-muted-foreground">
            {L("Here's what's turned on to help — always active.", "Esto es lo que está activado para ayudarte — siempre activo.")}
          </p>
        </div>
        <span className="ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">{L("Active", "Activo")}</span>
      </div>

      {/* Supports as chips */}
      <div className="flex flex-wrap gap-2 mt-3">
        {accommodations.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5" style={{ border: `1px solid ${accent}33`, color: accent }}>
            <Check className="h-3.5 w-3.5" style={{ color: accent }} />
            {(es ? FRIENDLY_ES[a] : FRIENDLY[a]) ?? a.replace(/_/g, " ")}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5" style={{ border: `1px solid ${accent}33`, color: accent }}>
          <Captions className="h-3.5 w-3.5" /> {L("Captions on videos", "Subtítulos en los videos")}
        </span>
        {isDysgraphia && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5" style={{ border: `1px solid ${accent}33`, color: accent }}>
            <Mic className="h-3.5 w-3.5" /> {L("Speak-to-write", "Hablar para escribir")}
          </span>
        )}
        {hasExtraTime && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-200 text-amber-700">
            <Clock className="h-3.5 w-3.5" /> {L("Extra time on activities", "Más tiempo en las actividades")}
          </span>
        )}
      </div>

      {/* Operable controls */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button onClick={toggleEasy} aria-pressed={easy}
          className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border transition-colors"
          style={easy ? { background: accent, color: "#fff", borderColor: accent } : { background: "transparent", color: accent, borderColor: `${accent}55` }}>
          <Type className="h-4 w-4" /> {L("Easy-reading text", "Texto de lectura fácil")}: {easy ? L("On", "Activado") : L("Off", "Desactivado")}
        </button>
        <button onClick={speakSample}
          className="inline-flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-lg border"
          style={{ background: "transparent", color: accent, borderColor: `${accent}55` }}>
          <Volume2 className="h-4 w-4" /> {persona?.defaultLang === "es" ? "Escuchar (leer en voz alta)" : "Hear read-aloud"}
        </button>
        <p className="text-xs text-muted-foreground basis-full sm:basis-auto sm:ml-1">
          {L("The AI tutor also adapts automatically — shorter steps, simpler wording, and encouragement.", "El tutor de IA también se adapta solo: pasos más cortos, palabras sencillas y ánimo.")}
        </p>
      </div>
    </Card>
  );
}
