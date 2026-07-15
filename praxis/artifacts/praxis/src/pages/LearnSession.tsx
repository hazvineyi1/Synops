import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGetSession, useGetModule } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
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

      {/* Beat Context Strip */}
      {currentBeat && !isMastered && (
        <div className="bg-muted/50 border-b border-border px-4 py-3 shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 justify-center">
          <span className={cn("text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-sm w-fit", beatBadge(currentBeat.type))}>
            {currentBeat.type.replace('_', ' ')}
          </span>
          <span className="text-sm font-medium text-foreground">{currentBeat.title}</span>
        </div>
      )}

      {/* Main Dialogue Area */}
      <main className="flex-1 overflow-y-auto px-4 py-8 flex justify-center">
        <div className="w-full max-w-3xl space-y-6">
          {/* Initial Module Context if any */}
          {moduleData?.description && localTurns.length === 0 && (
            <div className="text-center space-y-4 py-12">
              <h2 className="text-2xl font-serif font-bold">{moduleData.title}</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">{moduleData.description}</p>
            </div>
          )}

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
