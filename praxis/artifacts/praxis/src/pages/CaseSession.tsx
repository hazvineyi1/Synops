import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { casesApi, streamCaseTurn, LANGUAGES, type CaseMessage, type CaseSessionRow } from "@/lib/casesApi";
import { TutorAvatar, tutorGender } from "@/components/TutorAvatar";
import { useSpeech } from "@/lib/speech";
import { ArrowLeft, Send, Sparkles, CheckCircle2, TrendingUp, BookOpen, Settings2, Loader2 } from "lucide-react";

export function CaseSession({ params }: { params?: { sessionId?: string } }) {
  const sessionId = params?.sessionId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["case-session", sessionId], queryFn: () => casesApi.getSession(sessionId), enabled: !!sessionId, retry: false });

  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [promptCount, setPromptCount] = useState(0);
  const [promptLimit, setPromptLimit] = useState(8);
  const [budgetReached, setBudgetReached] = useState(false);
  const [analysis, setAnalysis] = useState<CaseSessionRow | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [lang, setLang] = useState<string>("en");
  // Facts live in local state so a mid-session language switch can re-render them instantly.
  const [factsCtx, setFactsCtx] = useState<string>("");
  const [factsObj, setFactsObj] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [factsOpen, setFactsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [animate, setAnimateState] = useState<boolean>(() => { try { return localStorage.getItem("tutorAnimate") !== "0"; } catch { return true; } });
  const setAnimate = (v: boolean) => { setAnimateState(v); try { localStorage.setItem("tutorAnimate", v ? "1" : "0"); } catch { /* ignore */ } };
  const scrollRef = useRef<HTMLDivElement>(null);
  const { speak, cancel, speaking, muted, setMuted, supported } = useSpeech();

  const tutorName = data?.tutorName || "Your coach";
  const tutorAvatar = data?.tutorAvatar || "f1";
  const gender = tutorGender(tutorAvatar);
  const spokeOpening = useRef(false);

  useEffect(() => {
    if (!data) return;
    setMessages(data.messages ?? []);
    setPromptCount(data.promptCount);
    setPromptLimit(data.promptLimit);
    setBudgetReached(data.promptCount >= data.promptLimit);
    setLang(data.language ?? "en");
    setFactsCtx(data.contextBlock ?? "");
    setFactsObj(data.learningObjective ?? null);
    if (data.status === "completed" && data.engagementNarrative) setAnalysis(data);
    // Speak the opening question once, when the session first loads.
    if (!spokeOpening.current && data.status !== "completed") {
      const lastTutor = [...(data.messages ?? [])].reverse().find((m) => m.role === "tutor");
      if (lastTutor?.content) speak(lastTutor.content, tutorGender(data.tutorAvatar || "f1"), data.language ?? "en");
      spokeOpening.current = true;
    }
  }, [data, speak]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    cancel(); // stop any in-progress speech before the next turn
    setInput("");
    setMessages((m) => [...m, { role: "learner", content: text }, { role: "tutor", content: "" }]);
    setStreaming(true);
    let acc = "";
    await streamCaseTurn(
      `/case-sessions/${sessionId}/message`,
      { response: text, language: lang },
      (tok) => { acc += tok; setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok }; return c; }); },
      (meta) => {
        setStreaming(false);
        if (meta.error) { toast({ title: "Something went wrong", description: meta.error, variant: "destructive" }); return; }
        if (typeof meta.promptCount === "number") setPromptCount(meta.promptCount);
        if (meta.budgetReached) setBudgetReached(true);
        if (acc.trim()) speak(acc, gender, lang); // the tutor "speaks" its question
      }
    );
  };

  // Switch language mid-conversation: re-translate the facts + every prior tutor turn and
  // re-render the whole thread in the new language. Subsequent turns follow automatically.
  const changeLanguage = async (next: string) => {
    if (next === lang || switching || streaming) return;
    const prev = lang;
    cancel(); // stop any speech in the old language
    setLang(next);
    setSwitching(true);
    try {
      const r = await casesApi.setSessionLanguage(sessionId, next);
      setMessages(r.messages);
      setFactsCtx(r.contextBlock ?? "");
      setFactsObj(r.learningObjective ?? null);
      // Keep the cache consistent so a refetch/reload shows the switched language.
      qc.setQueryData<CaseSessionRow>(["case-session", sessionId], (old) =>
        old ? { ...old, language: next, messages: r.messages, contextBlock: r.contextBlock, learningObjective: r.learningObjective } : old);
      const lastTutor = [...r.messages].reverse().find((m) => m.role === "tutor");
      if (lastTutor?.content) speak(lastTutor.content, gender, next);
    } catch (e) {
      setLang(prev);
      toast({ title: "Could not switch language", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSwitching(false);
    }
  };

  const finish = async () => {
    setAnalysing(true);
    try { const r = await casesApi.completeSession(sessionId); setAnalysis(r); }
    catch (e) { toast({ title: "Could not generate analysis", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setAnalysing(false); }
  };

  if (isLoading) {
    return <div className="min-h-screen p-6" style={{ background: "hsl(43 30% 97%)" }}><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-96 rounded-xl" /></div>;
  }
  if (isError || !data) {
    return <div className="min-h-screen p-6 flex items-center justify-center text-center" style={{ background: "hsl(43 30% 97%)" }}>
      <div className="max-w-sm space-y-3">
        <p className="text-muted-foreground">This case session could not be loaded. It may have ended or you may not have access.</p>
        <button className="text-sm font-medium text-primary hover:underline" onClick={() => navigate('/dashboard')}>Back to dashboard</button>
      </div>
    </div>;
  }

  if (analysis) return <AnalysisView a={analysis} onDone={() => navigate("/cases")} />;

  const pct = Math.min(100, Math.round((promptCount / promptLimit) * 100));

  const facts = (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> The situation</p>
        <button onClick={() => setFactsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Minimise</button>
      </div>
      {factsObj && (
        <p className="text-xs rounded-md px-2.5 py-1.5" style={{ background: "hsl(222 47% 96%)", color: "hsl(222 30% 35%)" }}>Goal: {factsObj}</p>
      )}
      <p className={`text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 transition-opacity ${switching ? "opacity-40" : ""}`}>{factsCtx || "No background was provided for this case."}</p>
      {switching
        ? <p className="text-[11px] text-muted-foreground pt-1 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Switching the conversation into {LANGUAGES.find((l) => l.code === lang)?.name}…</p>
        : <p className="text-[11px] text-muted-foreground pt-1">The coach's questions are grounded in these facts — refer back any time.</p>}
    </div>
  );

  return (
    <div className="h-screen flex flex-col" style={{ background: "hsl(43 30% 97%)" }}>
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 h-16 border-b bg-white/85 backdrop-blur shrink-0">
        <Link href="/cases"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Exit</Button></Link>

        <div className="flex items-center gap-2.5 min-w-0">
          <TutorAvatar avatar={tutorAvatar} size={40} speaking={speaking && animate} ring />
          <div className="leading-tight min-w-0">
            <p className="text-sm font-medium truncate">{tutorName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{speaking ? "speaking…" : "your case coach"}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setFactsOpen((o) => !o)} title="Case facts" className={`inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${factsOpen ? "bg-muted border-transparent" : "hover:bg-muted"}`}>
            <BookOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Facts</span>
          </button>
          <div className="relative inline-flex items-center">
            <select value={lang} onChange={(e) => void changeLanguage(e.target.value)} disabled={switching || streaming} title="Language — switches the whole conversation" className="text-xs rounded-md border border-input bg-background px-1.5 py-1.5 disabled:opacity-60">
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
            {switching && <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin text-muted-foreground" />}
          </div>
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
                  <p className="text-[11px] text-muted-foreground">Turn on Voice to hear the coach. Turn off Animate for a still face. Some languages may not have a device voice.</p>
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
              {/* Inline facts card on mobile (side panel handles desktop) */}
              {factsOpen && <div className="md:hidden rounded-xl border bg-white">{facts}</div>}

              {messages.map((m, i) =>
                m.role === "learner" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed bg-[hsl(222_47%_20%)] text-white">{m.content}</div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start items-end gap-2">
                    <TutorAvatar avatar={tutorAvatar} size={28} speaking={speaking && animate && i === messages.length - 1} />
                    <div className="max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed bg-white border">
                      {m.content || <span className="animate-pulse">●</span>}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="border-t bg-white shrink-0">
            <div className="max-w-2xl mx-auto px-4 py-3">
              {budgetReached && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/30 px-3 py-2">
                  <p className="text-xs text-emerald-800">You've reached the planned depth. Keep going, or finish for your reasoning analysis.</p>
                  <Button size="sm" onClick={finish} disabled={analysing}><Sparkles className="h-4 w-4 mr-1.5" />{analysing ? "Analysing…" : "Finish & analyse"}</Button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <textarea
                  className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm max-h-32"
                  rows={1}
                  placeholder="Type your reasoning…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  disabled={streaming}
                />
                <Button onClick={() => void send()} disabled={streaming || !input.trim()}><Send className="h-4 w-4" /></Button>
              </div>
              {!budgetReached && messages.length > 2 && (
                <button onClick={finish} disabled={analysing} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Finish early &amp; get analysis</button>
              )}
            </div>
          </div>
        </main>

        {/* Desktop facts side panel */}
        {factsOpen && (
          <aside className="hidden md:block w-80 border-l bg-white/70 overflow-auto shrink-0">{facts}</aside>
        )}
      </div>
    </div>
  );
}

export function AnalysisView({ a, onDone }: { a: CaseSessionRow; onDone: () => void }) {
  const score = a.engagementScore ?? 0;
  return (
    <div className="min-h-screen py-10 px-4" style={{ background: "hsl(43 30% 97%)" }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-2" />
          <h1 className="text-2xl font-serif font-bold">Reasoning analysis</h1>
        </div>

        <div className="rounded-xl bg-white border p-6 flex items-center gap-5">
          <div className="flex items-center justify-center h-20 w-20 rounded-full shrink-0" style={{ background: "hsl(222 47% 11%)" }}>
            <span className="text-2xl font-serif text-white">{score}<span className="text-sm opacity-60">/10</span></span>
          </div>
          <div><p className="text-sm font-medium mb-1 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> Engagement</p><p className="text-sm text-muted-foreground">{a.engagementNarrative}</p></div>
        </div>

        {a.conceptsAddressed.length > 0 && (
          <div className="rounded-xl bg-white border p-5">
            <p className="text-sm font-medium mb-2">Concepts you engaged</p>
            <div className="flex flex-wrap gap-1.5">{a.conceptsAddressed.map((c, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-700 border border-purple-500/30">{c}</span>)}</div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-white border p-5">
            <p className="text-sm font-medium mb-2 text-emerald-700">Reasoning strengths</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">{a.reasoningStrengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div className="rounded-xl bg-white border p-5">
            <p className="text-sm font-medium mb-2 text-amber-700">Development areas</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">{a.developmentAreas.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>

        {a.rubricScores.length > 0 && (
          <div className="rounded-xl bg-white border p-5">
            <p className="text-sm font-medium mb-3">Rubric</p>
            <div className="space-y-3">
              {a.rubricScores.map((r, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1"><span>{r.criterion}</span><span className="font-medium">{r.points}/{r.maxPoints}</span></div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.maxPoints ? (r.points / r.maxPoints) * 100 : 0}%`, background: "hsl(222 47% 30%)" }} /></div>
                  {r.note && <p className="text-xs text-muted-foreground mt-1">{r.note}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center"><Button onClick={onDone}>Back to cases</Button></div>
      </div>
    </div>
  );
}
