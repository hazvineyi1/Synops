import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StudyNav from "@/components/StudyNav";
import { Markdown } from "@/components/Markdown";
import {
  Brain, CheckCircle2, XCircle, Loader2, ChevronRight,
  Globe, Sparkles, GraduationCap, Trophy, BookOpen, RefreshCw,
} from "lucide-react";

type DiagnosticQuestion = {
  id: string;
  conceptId: string;
  conceptTitle: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};
type Turn =
  | { v: 1; kind: "diagnostic"; intro: string; questions: DiagnosticQuestion[] }
  | { v: 1; kind: "feedback"; summary: string; items: any[]; focusConceptTitle: string; focusConceptId: string }
  | {
      v: 1; kind: "lesson"; conceptId: string; conceptTitle: string;
      explanation_md: string; example: string;
      check: { question: string; options: string[]; correctIndex: number; explanation: string } | null;
      sources: string[];
    }
  | {
      v: 1; kind: "check_result"; correct: boolean; explanation: string;
      correctIndex: number; selectedIndex: number;
      proposedNext: { conceptId: string; conceptTitle: string } | null;
    }
  | { v: 1; kind: "research"; conceptTitle: string; text_md: string; sources: string[] }
  | { v: 1; kind: "done"; summary: string }
  | { v: 1; kind: "error"; message: string }
  | { v: 1; kind: "user_reply"; reply: any };

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  turn: Turn | null;
};

function MD({ text }: { text: string }) {
  // Lightweight markdown rendering: headings, bold, italic, lists, paragraphs.
  // Just enough for tutor output, avoids pulling in a markdown library.
  const blocks = text.split(/\n{2,}/).map((b, i) => {
    const trimmed = b.trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,6})/)![1].length;
      const inner = trimmed.replace(/^#{1,6}\s/, "");
      const sizes = ["text-xl", "text-lg", "text-base", "text-sm", "text-sm", "text-sm"];
      return <div key={i} className={`font-semibold ${sizes[level - 1]} mt-3 mb-1.5`}>{inline(inner)}</div>;
    }
    if (/^[-*]\s/.test(trimmed)) {
      const items = trimmed.split(/\n/).map((l) => l.replace(/^[-*]\s/, ""));
      return (
        <ul key={i} className="list-disc pl-5 space-y-1 text-sm leading-relaxed my-2">
          {items.map((it, j) => <li key={j}>{inline(it)}</li>)}
        </ul>
      );
    }
    return <p key={i} className="text-sm leading-relaxed my-2 whitespace-pre-wrap">{inline(trimmed)}</p>;
  });
  return <div>{blocks}</div>;
}
function inline(s: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k++} className="px-1 py-0.5 rounded bg-muted text-[0.85em]">{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

export default function StudyTutorGuided() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const [, setLoc] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [diagAnswers, setDiagAnswers] = useState<Record<string, number>>({});
  const [checkAnswers, setCheckAnswers] = useState<Record<string, number>>({});

  const load = async () => {
    setLoadError(null);
    try {
      const r = await fetch(`/api/study/tutor/guided/${conversationId}`, { credentials: "include" });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setLoadError(e?.error || "Couldn't load this session. Please try again.");
        setLoading(false);
        return;
      }
      const data = await r.json();
      setConversation(data.conversation ?? null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setLoading(false);
    } catch {
      setLoadError("Couldn't load this session. Check your connection and try again.");
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [conversationId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pending]);

  const sendReply = async (reply: any) => {
    setPending(true);
    try {
      const r = await fetch(`/api/study/tutor/guided/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(reply),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        // Never alert() here: a native modal freezes the tab, which is exactly what
        // made a failed reply look like "the socratic dialogue won't send".
        notifyError(e?.error, "The tutor stumbled. Try again.");
      } else {
        await load();
      }
    } finally {
      setPending(false);
    }
  };

  // Render
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (loadError) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-muted-foreground max-w-sm">{loadError}</p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => { setLoading(true); load(); }}>Retry</Button>
        <Button onClick={() => setLoc("/tutor")}>Back to Tutor</Button>
      </div>
    </div>
  );

  const visibleMessages = messages.filter((m) => !(m.turn?.kind === "user_reply"));
  const isSocratic = !!conversation?.socraticMode;

  const restartDiagnostic = async () => {
    if (pending) return;
    if (!confirm("Start a fresh diagnostic? This will leave your current session in your history and open a new one.")) return;
    setPending(true);
    try {
      const r = await fetch("/api/study/tutor/guided/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ socratic: isSocratic }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        notifyError(e?.error, "Could not restart the diagnostic.");
        setPending(false);
        return;
      }
      const data = await r.json();
      if (!data?.conversation?.id) {
        notifyError(undefined, "The tutor did not return a session. Try again.");
        setPending(false);
        return;
      }
      setLoc(`/tutor/guided/${data.conversation.id}`);
    } catch {
      notifyError(undefined, "Could not restart the diagnostic.");
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <StudyNav />
      <div className="border-b px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sticky top-12 z-20 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          {isSocratic ? (
            <Brain className="h-4 w-4 text-amber-600 shrink-0" />
          ) : (
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
          )}
          <h1 className="font-semibold text-sm truncate">
            {conversation?.title || "Guided session"}
          </h1>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isSocratic ? "bg-amber-500/15 text-amber-700" : "bg-primary/15 text-primary"
          }`}>
            {isSocratic ? "Socratic" : "Guided"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={restartDiagnostic}
            disabled={pending}
            title="Start a new diagnostic"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Redo diagnostic</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setLoc("/tutor")}
          >
            <span className="hidden sm:inline">All sessions</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {visibleMessages.map((m) => (
            <TurnView
              key={m.id}
              message={m}
              diagAnswers={diagAnswers}
              setDiagAnswers={setDiagAnswers}
              checkAnswers={checkAnswers}
              setCheckAnswers={setCheckAnswers}
              pending={pending}
              onSend={sendReply}
            />
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Tutor is thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>
    </div>
  );
}

function TurnView({
  message, diagAnswers, setDiagAnswers, checkAnswers, setCheckAnswers, pending, onSend,
}: {
  message: Message;
  diagAnswers: Record<string, number>;
  setDiagAnswers: (a: Record<string, number>) => void;
  checkAnswers: Record<string, number>;
  setCheckAnswers: (a: Record<string, number>) => void;
  pending: boolean;
  onSend: (r: any) => void;
}) {
  const turn = message.turn;
  // Plain-text message fallback
  if (!turn) {
    const isUser = message.role === "user";
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div className={isUser
          ? "max-w-[80%] px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm whitespace-pre-wrap"
          : "max-w-[92%] px-5 py-4 rounded-2xl bg-muted text-[15px] text-foreground"}>
          {isUser ? message.content : <Markdown content={message.content} />}
        </div>
      </div>
    );
  }

  if (turn.kind === "diagnostic") {
    const allAnswered = turn.questions.every((q) => typeof diagAnswers[q.id] === "number");
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-sm leading-relaxed pt-1">{turn.intro}</p>
        </div>
        {turn.questions.map((q, i) => (
          <Card key={q.id} className="border-primary/10">
            <CardContent className="py-4 px-4 space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] h-5">{q.conceptTitle}</Badge>
                <span className="text-xs text-muted-foreground">Question {i + 1} of {turn.questions.length}</span>
              </div>
              <p className="font-medium text-sm">{q.question}</p>
              <div className="space-y-1.5">
                {q.options.map((opt, idx) => {
                  const selected = diagAnswers[q.id] === idx;
                  return (
                    <button
                      key={idx}
                      disabled={pending}
                      onClick={() => setDiagAnswers({ ...diagAnswers, [q.id]: idx })}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        selected ? "border-primary bg-primary/5 text-foreground" : "border-input hover:bg-muted/50"
                      }`}
                    >
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border text-[11px] mr-2 align-middle">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          disabled={!allAnswered || pending}
          className="w-full"
          onClick={() =>
            onSend({
              kind: "diagnostic_answers",
              answers: turn.questions.map((q) => ({ questionId: q.id, selectedIndex: diagAnswers[q.id] })),
            })
          }
        >
          Submit answers
        </Button>
      </div>
    );
  }

  if (turn.kind === "feedback") {
    return (
      <Card className="border-muted">
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="font-semibold text-sm">{turn.summary}</h3>
          </div>
          <div className="space-y-2">
            {turn.items.map((it: any) => (
              <div key={it.questionId} className="flex items-start gap-2 text-sm">
                {it.correct ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{it.conceptTitle}</div>
                  {!it.correct && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Correct answer: <span className="font-medium text-foreground">{it.options[it.correctIndex]}</span>. {it.explanation}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground pt-1 border-t">
            Let's focus on <span className="font-medium text-foreground">{turn.focusConceptTitle}</span> next.
          </div>
        </CardContent>
      </Card>
    );
  }

  if (turn.kind === "lesson") {
    const key = String(message.id);
    const ans = checkAnswers[key];
    return (
      <Card>
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{turn.conceptTitle}</h3>
          </div>
          <MD text={turn.explanation_md} />
          {turn.example && (
            <div className="rounded-lg bg-muted/40 border-l-2 border-primary px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Example</div>
              <p className="text-sm leading-relaxed">{turn.example}</p>
            </div>
          )}
          {turn.sources?.length > 0 && (
            <div className="text-xs">
              <div className="text-muted-foreground mb-1">Sources:</div>
              <ul className="space-y-0.5">
                {turn.sources.map((u, i) => (
                  <li key={i}><a href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">{u}</a></li>
                ))}
              </ul>
            </div>
          )}
          <div className="border-t pt-3 space-y-2">
            {turn.check ? (
              <>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Quick check</div>
                <p className="text-sm font-medium">{turn.check.question}</p>
                <div className="space-y-1.5">
                  {turn.check.options.map((opt, idx) => {
                    const selected = ans === idx;
                    return (
                      <button
                        key={idx}
                        disabled={pending}
                        onClick={() => setCheckAnswers({ ...checkAnswers, [key]: idx })}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          selected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50"
                        }`}
                      >
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border text-[11px] mr-2 align-middle">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            <div className="flex gap-2 pt-1">
              {turn.check ? (
                <Button
                  size="sm"
                  disabled={typeof ans !== "number" || pending}
                  onClick={() => onSend({ kind: "check_answer", lessonMessageId: message.id, selectedIndex: ans })}
                >
                  Check my answer
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onSend({ kind: "teach_next" })}
                >
                  Continue <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onSend({ kind: "research_deeper", conceptTitle: turn.conceptTitle })}
              >
                <Globe className="h-3.5 w-3.5 mr-1.5" /> Pull deeper sources
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (turn.kind === "check_result") {
    return (
      <Card className={turn.correct ? "border-emerald-500/30" : "border-rose-500/30"}>
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center gap-2">
            {turn.correct ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="font-semibold text-sm">Correct.</span></>
            ) : (
              <><XCircle className="h-4 w-4 text-rose-500" /><span className="font-semibold text-sm">Not quite.</span></>
            )}
          </div>
          {turn.explanation && <p className="text-sm leading-relaxed">{turn.explanation}</p>}
          <div className="flex gap-2 pt-1 flex-wrap">
            {turn.proposedNext ? (
              <Button size="sm" disabled={pending} onClick={() => onSend({ kind: "teach_next", conceptId: turn.proposedNext!.conceptId })}>
                Continue with {turn.proposedNext.conceptTitle} <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => onSend({ kind: "done" })}>Finish session</Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onSend({ kind: "done" })}>Pause for now</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (turn.kind === "research") {
    return (
      <Card>
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Deeper sources on {turn.conceptTitle}</h3>
          </div>
          <MD text={turn.text_md} />
        </CardContent>
      </Card>
    );
  }

  if (turn.kind === "done") {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="py-5 px-4 text-center space-y-2">
          <Trophy className="h-6 w-6 text-emerald-500 mx-auto" />
          <p className="text-sm">{turn.summary}</p>
        </CardContent>
      </Card>
    );
  }

  if (turn.kind === "error") {
    return <div className="text-sm text-rose-600 px-1">{turn.message}</div>;
  }

  return null;
}
