import React, { useEffect, useRef, useState } from "react";
import { API } from "@/lib/api";
import { streamCaseTurn, type CaseMessage, type CaseSessionRow } from "@/lib/casesApi";
import { Button } from "@/components/ui/button";
import { Send, Sparkles } from "lucide-react";
import { AnalysisView } from "@/pages/CaseSession";

interface PublicCase {
  token: string;
  title: string;
  learningObjective: string | null;
  contextBlock: string;
  difficulty: string;
  promptLimit: number;
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
      const r = await fetch(`${API}/case-embed/${token}/start`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ learnerName: name || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not start");
      setSessionId(d.sessionId);
      setMessages(d.messages ?? []);
      setPromptCount(d.promptCount ?? 0);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start"); }
    finally { setStarting(false); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming || !sessionId) return;
    setInput("");
    setMessages((m) => [...m, { role: "learner", content: text }, { role: "tutor", content: "" }]);
    setStreaming(true);
    await streamCaseTurn(
      `/case-embed/${token}/chat`,
      { sessionId, response: text },
      (tok) => setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok }; return c; }),
      (meta) => {
        setStreaming(false);
        if (meta.error) { setError(meta.error); return; }
        if (typeof meta.promptCount === "number") setPromptCount(meta.promptCount);
        if (meta.budgetReached) setBudgetReached(true);
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
          <Button className="w-full" onClick={start} disabled={starting}>{starting ? "Starting…" : "Begin the case"}</Button>
        </div>
      </Centered>
    );
  }

  const pct = Math.min(100, Math.round((promptCount / promptLimit) * 100));
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(43 30% 97%)" }}>
      <header className="flex items-center justify-between px-4 h-14 border-b bg-white/80 backdrop-blur">
        <span className="font-serif font-semibold text-sm truncate">{caseData.title}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{promptCount} / {promptLimit}</span>
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "hsl(145 45% 42%)" : "hsl(222 47% 30%)" }} /></div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "learner" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "learner" ? "bg-[hsl(222_47%_20%)] text-white" : "bg-white border"}`}>
                {m.content || <span className="animate-pulse">●</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {budgetReached && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/30 px-3 py-2">
              <p className="text-xs text-emerald-800">You've reached the planned depth. Keep going, or finish for your analysis.</p>
              <Button size="sm" onClick={finish} disabled={analysing}><Sparkles className="h-4 w-4 mr-1.5" />{analysing ? "Analysing…" : "Finish"}</Button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm max-h-32" rows={1} placeholder="Type your reasoning…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} disabled={streaming} />
            <Button onClick={() => void send()} disabled={streaming || !input.trim()}><Send className="h-4 w-4" /></Button>
          </div>
          {!budgetReached && messages.length > 2 && <button onClick={finish} disabled={analysing} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Finish early & get analysis</button>}
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(43 30% 97%)" }}>{children}</div>;
}
