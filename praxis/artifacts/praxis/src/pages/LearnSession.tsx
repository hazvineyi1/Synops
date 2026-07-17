import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetSession, useGetModule } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Send, Sparkles, Info, FileText, ChevronDown, ChevronUp, Target, Clock, MessageCircleQuestion } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { BeatType } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

// Functional colour map (cognitive-load brief §4): colour encodes the KIND of step so a
// learner can tell what it is without reading the label. Content/reading = purple,
// applied scenario = coral, structural framing = slate; current work falls back to teal.
// Nothing here is red — red is reserved for genuine errors only.
const BEAT_BADGE: Record<string, string> = {
  title_card: 'text-slate-600 bg-slate-500/10',
  close: 'text-slate-600 bg-slate-500/10',
  points: 'text-purple-600 bg-purple-500/10',
  compare: 'text-purple-600 bg-purple-500/10',
  diagram: 'text-purple-600 bg-purple-500/10',
  video: 'text-purple-600 bg-purple-500/10',
  scenario: 'text-orange-600 bg-orange-500/10',
};
const beatBadge = (type: string): string => BEAT_BADGE[type] ?? 'text-teal-700 bg-teal-500/10';

type DoneMeta = { scaffold?: boolean; grade?: number; mastered?: boolean; masteryScore?: number };

// Generic SSE reader: streams text tokens, captures the final done-event metadata,
// and hands that metadata to onComplete so the caller can react (e.g. offer support).
async function streamSSE(
  url: string,
  body: unknown,
  onToken: (token: string) => void,
  onComplete: (meta: DoneMeta) => void
) {
  let meta: DoneMeta = {};
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    });

    if (!res.body) return onComplete(meta);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) onToken(data.content);
            if (data.done) {
              meta = {
                scaffold: data.scaffold,
                grade: data.grade,
                mastered: data.mastered,
                masteryScore: data.masteryScore,
              };
            }
          } catch (e) {
            // parse error, ignore partial chunk
          }
        }
      }
    }
  } catch (error) {
    console.error("Streaming error:", error);
  } finally {
    onComplete(meta);
  }
}

export function LearnSession({ params }: { params: { sessionId: string } }) {
  const { sessionId } = params;
  const [, setLocation] = useLocation();
  const { data: session, refetch: refetchSession } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: ['session', sessionId] } });
  
  // Try to load module data if we have the session
  const moduleId = session?.moduleId || '';
  const { data: moduleData } = useGetModule(moduleId, { query: { enabled: !!moduleId, queryKey: ['module', moduleId] } });

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  // Scaffolding trigger: when the learner has struggled with several items in a row,
  // the backend flags `scaffold` on the done event. We surface a gentle, opt-in offer
  // of a worked example rather than another question (the worked-example effect).
  const [showScaffold, setShowScaffold] = useState(false);
  // Guidance + context panels — both available at all times via the sticky bar, each minimisable.
  const [showHow, setShowHow] = useState(true);
  const [showFacts, setShowFacts] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Local state for turns to optimistically append user message and streaming tutor message
  const [localTurns, setLocalTurns] = useState<any[]>([]);

  useEffect(() => {
    if (session?.turns) {
      setLocalTurns(session.turns);
    }
  }, [session?.turns]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localTurns, streamingText]);

  if (!session) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-8 w-32 bg-muted rounded"></div>
      </div>
    </div>
  );

  const masteryPercentage = Math.round((session.masteryScore || 0) * 100);
  const isMastered = session.masteryScore >= 0.8;

  const currentBeat = moduleData?.beats?.find(b => b.id === session.currentBeatId);

  // The "fact pattern": the context the learner should be able to see at all times — what
  // they're catching up on (if remedial), the module's premise, and the situation for the
  // current step. Composed from the session + module + current beat.
  const factPattern = {
    focus: ((session as unknown as { remedialFocus?: string | null }).remedialFocus) || null,
    description: moduleData?.description || '',
    scenario: currentBeat?.scenario || currentBeat?.narration || '',
    bullets: (currentBeat?.bulletPoints ?? []) as string[],
  };
  const hasFacts = !!(factPattern.focus || factPattern.description || factPattern.scenario || factPattern.bullets.length);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming) return;
    
    const userMessage = inputValue;
    setInputValue('');
    setIsStreaming(true);
    setStreamingText('');
    setShowScaffold(false);

    // Optimistically add user message
    const tempUserTurn = {
      id: `temp-${Date.now()}`,
      role: 'learner',
      content: userMessage,
      createdAt: new Date().toISOString()
    };

    setLocalTurns(prev => [...prev, tempUserTurn]);

    await streamSSE(
      `/api/sessions/${sessionId}/respond`,
      { response: userMessage, beatId: session.currentBeatId || '' },
      (token) => {
        setStreamingText(prev => prev + token);
      },
      (meta) => {
        // When complete, refetch the session to get the real turns and updated mastery/beat
        refetchSession().then(() => {
          setIsStreaming(false);
          setStreamingText('');
          // Offer a worked example only when the learner has genuinely been struggling.
          if (meta.scaffold && !meta.mastered) setShowScaffold(true);
        });
      }
    );
  };

  // Deliberate scaffolding: fetch one worked example, then let the learner try again.
  const handleWorkedExample = async () => {
    if (isStreaming) return;
    setShowScaffold(false);
    setIsStreaming(true);
    setStreamingText('');

    await streamSSE(
      `/api/sessions/${sessionId}/worked-example`,
      {},
      (token) => {
        setStreamingText(prev => prev + token);
      },
      () => {
        refetchSession().then(() => {
          setIsStreaming(false);
          setStreamingText('');
        });
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header Bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation('/dashboard')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="hidden sm:block">
            <h1 className="font-serif font-bold text-lg">{moduleData?.title || 'Loading Module...'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4 w-48 sm:w-64">
          <div className="flex-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground font-medium uppercase tracking-wider">Mastery</span>
              <span className="font-bold">{masteryPercentage}%</span>
            </div>
            <Progress value={masteryPercentage} className="h-2" />
          </div>
        </div>
      </header>

      {/* Guidance + context bar — sticky under the header so instructions and the fact pattern
          are reachable at all times. Each panel can be minimised or expanded during the session. */}
      {!isMastered && (
        <div className="shrink-0 sticky top-14 z-10 border-b border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-2 flex flex-wrap items-center gap-2">
            {currentBeat?.title && (
              <span className="text-sm font-medium text-foreground truncate">{currentBeat.title}</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowHow(v => !v)}
                aria-expanded={showHow}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/40"
              >
                <Info className="h-3.5 w-3.5" /> How this works
                {showHow ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setShowFacts(v => !v)}
                aria-expanded={showFacts}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/40"
              >
                <FileText className="h-3.5 w-3.5" /> Fact pattern
                {showFacts ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* How this works — expectations, mastery, and time to complete */}
          {showHow && (
            <div className="border-t border-border bg-background">
              <div className="mx-auto max-w-3xl grid gap-3 px-4 py-3 text-sm sm:grid-cols-3">
                <div className="flex gap-2">
                  <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">What to do</p>
                    <p className="text-muted-foreground">Your coach asks guiding questions. Answer in your own words and explain your reasoning — there's no single right wording, and the coach won't hand you the answer.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">What mastery looks like</p>
                    <p className="text-muted-foreground">Move the Mastery bar to 80% by reasoning clearly and applying the idea to new situations. Reach 80% and you've mastered it — and earn your credential.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">How long it takes</p>
                    <p className="text-muted-foreground">About 10–15 minutes. Your progress saves as you go, so you can pause and pick up where you left off.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fact pattern — the situation/context, available throughout */}
          {showFacts && (
            <div className="border-t border-border bg-amber-50/40 dark:bg-amber-950/10">
              <div className="mx-auto max-w-3xl px-4 py-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Fact pattern — the context for this session</p>
                {factPattern.focus && (
                  <p className="mb-2 text-foreground"><span className="font-medium">You're catching up on:</span> {factPattern.focus}</p>
                )}
                {factPattern.description && <p className="mb-2 text-muted-foreground">{factPattern.description}</p>}
                {factPattern.scenario && <p className="whitespace-pre-wrap text-foreground">{factPattern.scenario}</p>}
                {factPattern.bullets.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {factPattern.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                {!hasFacts && <p className="text-muted-foreground">Your coach will set the scene as you begin.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Dialogue Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 flex justify-center">
        <div className="w-full max-w-3xl space-y-6">
          <AnimatePresence initial={false}>
            {localTurns.map((turn, idx) => (
              <motion.div
                key={turn.id || idx}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  "flex w-full",
                  turn.role === 'learner' ? "justify-end" : "justify-start"
                )}
              >
                <div 
                  className={cn(
                    "max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap",
                    turn.role === 'learner' 
                      ? "bg-primary text-primary-foreground rounded-tr-sm" 
                      : "bg-card border border-border shadow-sm rounded-tl-sm text-foreground"
                  )}
                >
                  {turn.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Streaming active message */}
          {isStreaming && (
             <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full justify-start"
             >
              <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap bg-card border border-border shadow-sm rounded-tl-sm text-foreground relative">
                {streamingText || (
                  <span className="inline-flex gap-1 items-center">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" />
                  </span>
                )}
                {streamingText && <span className="inline-block w-1.5 h-4 bg-primary ml-1 animate-pulse align-middle" />}
              </div>
            </motion.div>
          )}

          {/* Scaffolding offer — appears after a run of struggle. Warm, not punitive:
              it normalises the difficulty and offers a worked example, opt-in. */}
          {showScaffold && !isStreaming && !isMastered && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:p-6 dark:border-orange-900/40 dark:bg-orange-950/20"
            >
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                This one is genuinely tricky — that's normal.
              </p>
              <p className="mt-1 text-sm text-orange-800/90 dark:text-orange-200/80">
                Want me to walk through one worked example first? Then you can try a similar one yourself.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleWorkedExample}
                  className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                  Show me a worked example
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowScaffold(false)}
                  className="text-orange-800 hover:bg-orange-100 dark:text-orange-200 dark:hover:bg-orange-900/30"
                >
                  I'll keep trying
                </Button>
              </div>
            </motion.div>
          )}

          {/* Mastery Achieved Banner */}
          {isMastered && (
            <div className="mt-8 mb-4 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
              <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center mb-4 text-primary-foreground shadow-lg">
                <Sparkles className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-foreground mb-2">Mastery Achieved</h3>
              <p className="text-muted-foreground max-w-md mb-6">
                You've demonstrated sufficient reasoning capability for this module. Your PraxisMark is ready.
              </p>
              <Button size="lg" onClick={() => setLocation('/credentials')}>
                View PraxisMark Credential
              </Button>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Input Area */}
      <footer className="shrink-0 bg-background border-t border-border p-4 pb-safe">
        <div className="max-w-3xl mx-auto relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMastered ? "Session completed." : "Type your response..."}
            disabled={isStreaming || isMastered}
            className="w-full resize-none rounded-xl border border-input bg-card px-4 py-4 pr-14 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[60px] max-h-[200px]"
            rows={1}
            style={{
              height: 'auto',
            }}
          />
          <Button 
            size="icon" 
            className="absolute right-2 top-[50%] -translate-y-[50%] h-10 w-10 rounded-lg"
            disabled={!inputValue.trim() || isStreaming || isMastered}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3">
          The tutor will not provide answers, only questions to guide your reasoning.
        </p>
      </footer>
    </div>
  );
}
