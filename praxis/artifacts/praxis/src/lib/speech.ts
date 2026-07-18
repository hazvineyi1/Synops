import { useState, useCallback, useEffect, useRef } from "react";

const BCP47_MAP: Record<string, string> = { en: "en-ZA", zu: "zu-ZA", xh: "xh-ZA", af: "af-ZA", sn: "sn-ZW" };
const FEMALE_HINT = /female|woman|zira|samantha|victoria|karen|moira|tessa|serena|fiona|susan|linda|amelie|joana/i;
const MALE_HINT = /male|man|david|mark|daniel|alex|fred|george|arthur|thomas|oliver|rishi/i;

const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Shared voice picker: prefer the requested language, then English, then anything. */
function pickVoiceFor(gender: "female" | "male" | null, lang: string): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const base = (lang || "en").slice(0, 2).toLowerCase();
  const langMatch = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  const english = voices.filter((v) => /^en/i.test(v.lang));
  const pool = langMatch.length ? langMatch : (english.length ? english : voices);
  if (gender === "female") { const m = pool.find((v) => FEMALE_HINT.test(v.name)); if (m) return m; }
  if (gender === "male") { const m = pool.find((v) => MALE_HINT.test(v.name)); if (m) return m; }
  return pool[0] ?? null;
}

/**
 * Does the browser actually have a voice in this language? Worth surfacing: isiZulu,
 * isiXhosa and Shona voices are rare on desktop, and without this the reader silently
 * narrates them with an English voice, which is grating across a whole reading.
 */
export function hasVoiceForLang(lang: string): boolean {
  if (!speechSupported()) return false;
  const base = (lang || "en").slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(base));
}

/**
 * Split text into sentence-sized chunks. Required: speech engines truncate long
 * utterances (Chrome caps around 32k chars, some cut off after ~15s of audio), so a
 * multi-paragraph reading must be queued sentence by sentence.
 */
export function chunkForSpeech(text: string, max = 220): string[] {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [clean];
  const out: string[] = [];
  let buf = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length > max) {
      if (buf) { out.push(buf); buf = ""; }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if ((buf ? `${buf} ${s}` : s).length <= max) buf = buf ? `${buf} ${s}` : s;
    else { out.push(buf); buf = s; }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Read-aloud for long-form text (module readings).
 *
 * Deliberately separate from useSpeech: the tutor hook is built for short turns, cancels
 * any in-flight utterance on every call, and has no pause/resume. This one chunks the text,
 * queues it, exposes real pause/resume/stop, and reports which sentence is being read so
 * the UI can show it. It is explicitly started by the learner, so it does NOT inherit the
 * tutor's opt-in mute preference.
 */
export function useReadAloud() {
  const supported = speechSupported();
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [index, setIndex] = useState(-1);
  const [chunks, setChunks] = useState<string[]>([]);

  const chunksRef = useRef<string[]>([]);
  const idxRef = useRef(0);
  const stoppedRef = useRef(false);
  const langRef = useRef("en");

  const speakFrom = useCallback(() => {
    if (!supported || stoppedRef.current) return;
    const list = chunksRef.current;
    const i = idxRef.current;
    if (i >= list.length) { setStatus("idle"); setIndex(-1); return; }
    setIndex(i);
    const u = new SpeechSynthesisUtterance(list[i]);
    u.lang = BCP47_MAP[langRef.current] ?? "en-ZA";
    const v = pickVoiceFor(null, langRef.current);
    if (v) u.voice = v;
    u.rate = 1;
    const advance = () => { if (stoppedRef.current) return; idxRef.current = i + 1; speakFrom(); };
    u.onend = advance;
    u.onerror = advance;
    window.speechSynthesis.speak(u);
  }, [supported]);

  const start = useCallback((text: string, lang = "en") => {
    if (!supported || !text?.trim()) return;
    window.speechSynthesis.cancel();
    stoppedRef.current = false;
    langRef.current = lang;
    const list = chunkForSpeech(text);
    chunksRef.current = list;
    setChunks(list);
    idxRef.current = 0;
    setStatus("playing");
    speakFrom();
  }, [supported, speakFrom]);

  const pause = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setStatus("playing");
  }, [supported]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (supported) window.speechSynthesis.cancel();
    setStatus("idle");
    setIndex(-1);
  }, [supported]);

  useEffect(() => () => {
    stoppedRef.current = true;
    if (speechSupported()) window.speechSynthesis.cancel();
  }, []);

  return { start, pause, resume, stop, status, index, chunks, supported };
}

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
