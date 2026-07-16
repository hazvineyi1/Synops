import { useState, useCallback, useEffect } from "react";

/**
 * Browser text-to-speech for the tutor "talking head". Zero-cost, no external service.
 * Picks an English voice matching the tutor's gender when one is available, tracks a
 * `speaking` flag (used to animate the avatar's mouth), and remembers the mute preference.
 */
export function useSpeech() {
  // Voice is OPT-IN: off unless the learner has previously turned it on.
  const [muted, setMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem("tutorMuted") !== "0"; } catch { return true; }
  });
  const [speaking, setSpeaking] = useState(false);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    try { localStorage.setItem("tutorMuted", v ? "1" : "0"); } catch { /* ignore */ }
    if (v && supported) { window.speechSynthesis.cancel(); setSpeaking(false); }
  }, [supported]);

  const BCP47: Record<string, string> = { en: "en-ZA", zu: "zu-ZA", xh: "xh-ZA", af: "af-ZA", sn: "sn-ZW" };

  const femaleHint = /female|woman|zira|samantha|victoria|karen|moira|tessa|serena|fiona|susan|linda|amelie|joana/i;
  const maleHint = /male|man|david|mark|daniel|alex|fred|george|arthur|thomas|oliver|rishi/i;

  const pickVoice = useCallback((gender: "female" | "male" | null, lang: string): SpeechSynthesisVoice | null => {
    if (!supported) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const base = (lang || "en").slice(0, 2).toLowerCase();
    // Prefer a voice in the requested language; fall back to English, then anything.
    const langMatch = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    const pool = langMatch.length ? langMatch : (voices.filter((v) => /^en/i.test(v.lang)) .length ? voices.filter((v) => /^en/i.test(v.lang)) : voices);
    if (gender === "female") { const m = pool.find((v) => femaleHint.test(v.name)); if (m) return m; }
    if (gender === "male") { const m = pool.find((v) => maleHint.test(v.name)); if (m) return m; }
    return pool[0] ?? null;
  }, [supported]);

  const speak = useCallback((text: string, gender: "female" | "male" | null, lang: string = "en") => {
    if (!supported || muted || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
    u.lang = BCP47[lang] ?? "en-ZA";
    const v = pickVoice(gender, lang); if (v) u.voice = v;
    u.rate = 1; u.pitch = gender === "male" ? 0.95 : 1.05;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [supported, muted, pickVoice]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  // Stop any speech when the component using this hook unmounts.
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);

  return { speak, cancel, speaking, muted, setMuted, supported };
}
