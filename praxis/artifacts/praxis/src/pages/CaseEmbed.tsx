import React, { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { streamCaseTurn, LANGUAGES, type CaseMessage, type CaseSessionRow } from "@/lib/casesApi";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, BookOpen, Settings2 } from "lucide-react";
import { AnalysisView } from "@/pages/CaseSession";
import { TutorAvatar, tutorGender } from "@/components/TutorAvatar";
import { useSpeech } from "@/lib/speech";

interface PublicCase {
  token: string;
  title: string;
  learningObjective: string | null;
  contextBlock: string;
  difficulty: string;
  promptLimit: number;
  tutorName: string | null;
  tutorAvatar: string | null;
  language: string;
}

/**
 * Public, unauthenticated case runner reached via a signed embed token (/c/:token).
 * No app chrome, no login — the token is the credential.
 */
export function CaseEmbed({ params }: { params?: { token?: string } }) {
  const token = params?.token ?? "";
  const [caseData, setCaseData] = useState<PublicCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [promptCount, setPromptCount] = useState(0);
  const [promptLimit, setPromptLimit] = useState(8);
  const [budgetReached, setBudgetReached] = useState(false);
  const [analysis, setAnalysis] = useState<CaseSessionRow | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { speak, cancel, speaking, muted, setMuted, supported } = useSpeech();
  const tutorName = caseData?.tutorName || "Your coach";
  const tutorAvatar = caseData?.tutorAvatar || "f1";
  const gender = tutorGender(tutorAvatar);
  const [lang, setLang] = useState<string>("en");
  useEffect(() => { if (caseData?.language) setLang(caseData.language); }, [caseData?.language]);
  const [factsOpen, setFactsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [animate, setAnimateState] = useState<boolean>(() => { try { return localStorage.getItem("tutorAnimate") !== "0"; } catch { return true; } });
  const setAnimate = (v: boolean) => { setAnimateState(v); try { localStorage.setItem("tutorAnimate", v ? "1" : "0"); } catch { /* ignore */ } };

  useEffect(() => {
    fetch(`${API}/case-embed/${token}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("This link is not available.")))
      .then((d) => { setCaseData(d); setPromptLimit(d.promptLimit); })
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, streaming]);

  const start = async () => {
    setStarting(true);
    try {
      const r = await fetch(`${API}/case-embed/${token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ learnerName: name || undefined, language: lang }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not start");
      setSessionId(d.sessionId);
      setMessages(d.messages ?? []);
      setPromptCount(d.promptCount ?? 0);
      const opening = [...(d.messages ?? [])].reverse().find((m: CaseMessage) => m.role === "tutor");
      if (opening?.content) speak(opening.content, gender, lang);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start"); }
    finally { setStarting(false); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !sessionId) return;
    cancel();
    setInput("");
    setMessages((m) => [...m, { role: "learner", content: text }, { role: "tutor", content: "" }]);
    setStreaming(true);
    let acc = "";
    await streamCaseTurn(
      `/case-embed/${token}/chat`,
      { sessionId, response: text, language: lang },
      (tok) => { acc += tok; setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok }; return c; }); },
      (meta) => {
        setStreaming(false);
        if (meta.error) { setError(meta.error); return; }
        if (typeof meta.promptCount === "number") setPromptCount(meta.promptCount);
        if (meta.budgetReached) setBudgetReached(true);
        if (acc.trim()) speak(acc, gender, lang);
      }
    );
  };

  const finish = async () => {
    if (!sessionId) return;
    setAnalysing(true);
    try {
      const r = await fetch(`${API}/case-embed/${token}/analysis`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ sessionId }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Analysis failed");
      setAnalysis({
        id: sessionId, caseId: "", status: "completed", messages, promptCount, promptLimit,
        engagementScore: d.engagementScore ?? null, engagementNarrative: d.engagementNarrative ?? null,
        conceptsAddressed: d.conceptsAddressed ?? [], reasoningStrengths: d.reasoningStrengths ?? [],
        developmentAreas: d.developmentAreas ?? [], rubricScores: d.rubricScores ?? [],
        createdAt: "", completedAt: null,
      });
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed"); }
    finally { setAnalysing(false); }
  };

  if (error) return <Centered><p className="text-muted-foreground">{error}</p></Centered>;
  if (!caseData) return <Centered><p className="text-muted-foreground">Loading…</p></Centered>;
  if (analysis) return <AnalysisView a={analysis} onDone={() => window.location.reload()} />;

  // Intro / name-gate before starting.
  if (!sessionId) {
    return (
      <Centered>
        <div className="max-w-lg w-full rounded-xl bg-white border p-8 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{caseData.difficulty} case</p>
            <h1 className="text-2xl font-serif font-bold">{caseData.title}</h1>
          </div>
          {caseData.learningObjective && <p className="text-sm text-muted-foreground">{caseData.learningObjective}</p>}
          <div className="rounded-lg bg-muted/40 border p-4 text-sm whitespace-pre-wrap max-h-56 overflow-auto">{caseData.contextBlock}</div>
          <p className="text-xs text-muted-foreground">A coach will guide you with questions — there are no lectures. Reason out loud; you'll get an analysis at the end.</p>
          <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="block text-sm">
            <span className="text-muted-foreground text-xs">Language</span>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </label>
          <Button className="w-full" onClick={start} disabled={starting}>{starting ? "Starting…" : "Begin the case"}</Button>
        </div>
      </Centered>
    );
  }

  const pct = Math.min(100, Math.round((promptCount / promptLimit) * 100));

  const facts = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> The situation</p>
        <button onClick={() => setFactsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Minimise</button>
      </div>
      {caseData.learningObjective && (
        <p className="text-xs rounded-md px-2.5 py-1.5" style={{ background: "hsl(222 47% 96%)", color: "hsl(222 30% 35%)" }}>Goal: {caseData.learningObjective}</p>
      )}
      <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{caseData.contextBlock || "No background provided."}</p>
      <p className="text-[11px] text-muted-foreground pt-1">The coach's questions are grounded in these facts — refer back any time.</p>
    </div>
  );

  return (
    <div className="h-screen flex flex-col" style={{ background: "hsl(43 30% 97%)" }}>
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 h-16 border-b bg-white/85 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <TutorAvatar avatar={tutorAvatar} size={40} speaking={speaking && animate} ring />
          <div className="leading-tight min-w-0">
            <p className="text-sm font-medium truncate">{tutorName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{speaking ? "speaking…" : caseData.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFactsOpen((o) => !o)} title="Case facts" className={`inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${factsOpen ? "bg-muted border-transparent" : "hover:bg-muted"}`}>
            <BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Facts</span>
          </button>
          <select value={lang} onChange={(e) => setLang(e.target.value)} title="Language" className="text-xs rounded-md border border-input bg-background px-1.5 py-1.5">
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setSettingsOpen((o) => !o)} title="Voice & tutor settings" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Settings2 className="h-4 w-4" /></button>
            {settingsOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSettingsOpen(false)} />
                <div className="absolute right-0 top-9 z-20 w-60 rounded-lg border bg-white shadow-lg p-3 space-y-3 text-sm">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span>Voice (read aloud)</span>
                    <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} disabled={!supported} />
                  </label>
                  <label className={`flex items-center justify-between cursor-pointer ${muted ? "opacity-50" : ""}`}>
                    <span>Animate the face</span>
                    <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} disabled={muted} />
                  </label>
                  <p className="text-[11px] text-muted-foreground">Turn on Voice to hear the coach. Turn off Animate for a still face.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="h-1 bg-muted shrink-0"><div className="h-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "hsl(145 45% 42%)" : "hsl(222 47% 30%)" }} /></div>

          <div ref={scrollRef} className="flex-1 overflow-auto">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {factsOpen && <div className="md:hidden rounded-xl border bg-white">{facts}</div>}
              {messages.map((m, i) =>
                m.role === "learner" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-[hsl(222_47%_20%)] text-white">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start items-end gap-2">
                    <TutorAvatar avatar={tutorAvatar} size={28} speaking={speaking && animate && i === messages.length - 1} />
                    <div className="max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed bg-white border">{m.content || <span className="animate-pulse">●</span>}</div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="border-t bg-white shrink-0">
            <div className="max-w-2xl mx-auto px-4 py-3">
              {budgetReached && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/30 px-3 py-2">
                  <p className="text-xs text-emerald-800">You've reached the planned depth. Keep going, or finish for your analysis.</p>
                  <Button size="sm" onClick={finish} disabled={analysing}><Sparkles className="h-4 w-4 mr-1.5" />{analysing ? "Analysing…" : "Finish"}</Button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm max-h-32" rows={1} placeholder="Type your reasoning…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} disabled={streaming} />
                <Button onClick={() => void send()} disabled={streaming || !input.trim()}><Send className="h-4 w-4" /></Button>
              </div>
              {!budgetReached && messages.length > 2 && <button onClick={finish} disabled={analysing} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Finish early &amp; get analysis</button>}
            </div>
          </div>
        </main>

        {factsOpen && <aside className="hidden md:block w-80 border-l bg-white/70 overflow-auto shrink-0">{facts}</aside>}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(43 30% 97%)" }}>{children}</div>;
}
