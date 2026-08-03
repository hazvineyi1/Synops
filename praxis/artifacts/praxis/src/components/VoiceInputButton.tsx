import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { personaByEmail } from "@/lib/k12Personas";
import { useCoachProfile } from "@/lib/coachApi";
import { cn } from "@/lib/utils";

/**
 * Speak-to-write (voice input) for learners with the dysgraphia / dictation accommodation.
 *
 * A microphone button that sits next to any text-entry area. Clicking it toggles the browser's
 * Web Speech API dictation; recognised speech is appended to the field via `onTranscript`. It
 * self-gates: it renders NOTHING unless (a) the signed-in learner actually has the accommodation
 * and (b) the browser exposes SpeechRecognition — so it never appears for other learners or in
 * unsupported browsers. Recognition language follows the learner's locale (es-ES for the
 * Spanish-first persona, else en-US).
 */

// The Web Speech API is vendor-prefixed (webkit) and absent from the TS DOM lib, so type it loosely.
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/**
 * Whether the signed-in learner has the speak-to-write accommodation, and which recognition
 * locale to use. Detection mirrors AccommodationsPanel's "Speak-to-write" chip: the dysgraphia
 * persona, OR any voice/dictation accommodation on the coach profile (future-proofing — the demo
 * data drives this off the persona challenge today).
 */
export function useSpeakToWrite(): { enabled: boolean; lang: string; es: boolean } {
  const { user } = useSession();
  const { data: profile } = useCoachProfile();
  const persona = personaByEmail(user?.email);
  const accommodations = profile?.accommodations ?? [];
  const voiceAccommodation = accommodations.some((a) => /voice|speak|dictation|speech/i.test(a));
  const enabled = persona?.challenge === "Dysgraphia" || voiceAccommodation;
  const es = persona?.defaultLang === "es";
  return { enabled, lang: es ? "es-ES" : "en-US", es };
}

export function VoiceInputButton({
  onTranscript,
  className,
  size = "sm",
}: {
  onTranscript: (text: string) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const { enabled, lang, es } = useSpeakToWrite();
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const Ctor = getRecognitionCtor();
  const L = (en: string, esT: string) => (es ? esT : en);

  // Stop any in-flight recognition if the button unmounts.
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* ok */ } }, []);

  // Degrade gracefully: no accommodation, or no browser support -> nothing renders.
  if (!enabled || !Ctor) return null;

  const toggle = () => {
    if (listening) {
      try { recRef.current?.stop(); } catch { /* ok */ }
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e: any) => {
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i]?.isFinal) text += e.results[i][0]?.transcript ?? "";
        }
        text = text.trim();
        if (text) onTranscript(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const dim = size === "md" ? "h-9 w-9" : "h-8 w-8";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={listening ? L("Stop dictation", "Detener dictado") : L("Speak to write", "Hablar para escribir")}
      title={listening ? L("Stop dictation", "Detener dictado") : L("Speak to write", "Hablar para escribir")}
      className={cn(
        "inline-flex items-center justify-center rounded-full border transition-colors shrink-0",
        dim,
        listening
          ? "bg-red-500 text-white border-red-500 animate-pulse"
          : "bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/50",
        className,
      )}
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
