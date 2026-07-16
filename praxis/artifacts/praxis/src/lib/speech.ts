import { useState, useCallback, useEffect } from "react";

/**
 * Browser text-to-speech for the tutor "talking head". Zero-cost, no external service.
 * Picks an English voice matching the tutor's gender when one is available, tracks a
 * `speaking` flag (used to animate the avatar's mouth), and remembers the mute preference.
 */
export function useSpeech() {
  const [muted, setMutedState] = useState<boolean>(() => {
    try { return localStorage.getItem("tutorMuted") === "1"; } catch { return false; }
  });
  const [speaking, setSpeaking] = useState(false);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const setMuted = useCallback((v: boolean) => {
    setMutedState(v);
    try { localStorage.setItem("tutorMuted", v ? "1" : "0"); } catch { /* ignore */ }
    if (v && supported) { window.speechSynthesis.cancel(); setSpeaking(false); }
  }, [supported]);

  const pickVoice = useCallback((gender: "female" | "male" | null): SpeechSynthesisVoice | null => {
    if (!supported) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    const en = voices.filter((v) => /en[-_]/i.test(v.lang));
    const pool = en.length ? en : voices;
    const femaleHint = /female|woman|zira|samantha|victoria|karen|moira|tessa|serena|fiona|susan|linda|amelie|joana/i;
    const maleHint = /male|man|david|mark|daniel|alex|fred|george|arthur|thomas|oliver|rishi/i;
    if (gender === "female") { const m = pool.find((v) => femaleHint.test(v.name)); if (m) return m; }
    if (gender === "male") { const m = pool.find((v) => maleHint.test(v.name)); if (m) return m; }
    return pool[0] ?? null;
  }, [supported]);

  const speak = useCallback((text: string, gender: "female" | "male" | null) => {
    if (!supported || muted || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, " ").trim());
    const v = pickVoice(gender); if (v) u.voice = v;
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
