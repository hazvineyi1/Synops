import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { casesApi, streamCaseTurn, type CaseMessage, type CaseSessionRow } from "@/lib/casesApi";
import { ArrowLeft, Send, Sparkles, CheckCircle2, TrendingUp } from "lucide-react";

export function CaseSession({ params }: { params?: { sessionId?: string } }) {
  const sessionId = params?.sessionId ?? "";
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({ queryKey: ["case-session", sessionId], queryFn: () => casesApi.getSession(sessionId), enabled: !!sessionId });

  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [promptCount, setPromptCount] = useState(0);
  const [promptLimit, setPromptLimit] = useState(8);
  const [budgetReached, setBudgetReached] = useState(false);
  const [analysis, setAnalysis] = useState<CaseSessionRow | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data) return;
    setMessages(data.messages ?? []);
    setPromptCount(data.promptCount);
    setPromptLimit(data.promptLimit);
    setBudgetReached(data.promptCount >= data.promptLimit);
    if (data.status === "completed" && data.engagementNarrative) setAnalysis(data);
  }, [data]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, streaming]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "learner", content: text }, { role: "tutor", content: "" }]);
    setStreaming(true);
    await streamCaseTurn(
      `/case-sessions/${sessionId}/message`,
      { response: text },
      (tok) => setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + tok }; return c; }),
      (meta) => {
        setStreaming(false);
        if (meta.error) { toast({ title: "Something went wrong", description: meta.error, variant: "destructive" }); return; }
        if (typeof meta.promptCount === "number") setPromptCount(meta.promptCount);
        if (meta.budgetReached) setBudgetReached(true);
      }
    );
  };

  const finish = async () => {
    setAnalysing(true);
    try { const r = await casesApi.completeSession(sessionId); setAnalysis(r); }
    catch (e) { toast({ title: "Could not generate analysis", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setAnalysing(false); }
  };

  if (isLoading || !data) {
    return <div className="min-h-screen p-6" style={{ background: "hsl(43 30% 97%)" }}><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-96 rounded-xl" /></div>;
  }

  if (analysis) return <AnalysisView a={analysis} onDone={() => navigate("/cases")} />;

  const pct = Math.min(100, Math.round((promptCount / promptLimit) * 100));

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(43 30% 97%)" }}>
      <header className="flex items-center justify-between px-4 h-14 border-b bg-white/80 backdrop-blur">
        <Link href="/cases"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" /> Exit</Button></Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{promptCount} / {promptLimit} exchanges</span>
          <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "hsl(145 45% 42%)" : "hsl(222 47% 30%)" }} /></div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "learner" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "learner" ? "bg-[hsl(222_47%_20%)] text-white" : "bg-white border"}`}>
                {m.content || <span className="inline-flex gap-1"><span className="animate-pulse">●</span></span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3">
          {budgetReached && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/30 px-3 py-2">
              <p className="text-xs text-emerald-800">You've reached the planned depth. Keep going, or finish to get your reasoning analysis.</p>
              <Button size="sm" onClick={finish} disabled={analysing}><Sparkles className="h-4 w-4 mr-1.5" />{analysing ? "Analysing…" : "Finish & analyse"}</Button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm max-h-32"
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
            <button onClick={finish} disabled={analysing} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Finish early & get analysis</button>
          )}
        </div>
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
