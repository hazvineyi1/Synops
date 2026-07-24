import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useGetSession, useGetModule } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Send, Sparkles, Info, FileText, ChevronDown, ChevronUp, Target, Clock, MessageCircleQuestion, Lightbulb, ChevronRight, PencilLine, Check, TrendingUp, X } from 'lucide-react';

// Adaptive-difficulty levels. The coach calibrates how demanding its questions are as the learner's
// reasoning strengthens; we surface that as a visible level so the learner always knows where they
// are and why it moved. Derived on the client from the mastery tier (the same signal that drives the
// coach's escalation) - a precise per-question difficulty value would be a small backend addition
// (emit `difficulty` on the done-event), flagged in the deliverables as backend work.
const LEVELS = [
  { name: 'Foundation', short: 'L1', tip: 'Starting out - grounding the core idea.' },
  { name: 'Building', short: 'L2', tip: 'Building on the basics with more depth.' },
  { name: 'Applying', short: 'L3', tip: 'Applying the idea to real situations.' },
  { name: 'Advanced', short: 'L4', tip: 'Advanced - reasoning through harder cases.' },
];
// The level tier (0-3) for a mastery percentage. Same 20/50/80 breakpoints the meter already uses,
// so the level and the bar always agree.
const tierFromPct = (pct: number): number => (pct >= 80 ? 3 : pct >= 50 ? 2 : pct >= 20 ? 1 : 0);
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

// The chat renders raw text (no markdown parser), so strip every asterisk, em/en dash and
// divider before display. Belt-and-braces with the server-side sanitiser.
function sanitizePlain(text: string): string {
  return (text || '')
    .replace(/—/g, ', ')
    .replace(/–/g, '-')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface WorkedExample {
  intro: string;
  situation: string;
  steps: { heading: string; detail: string }[];
  tryPrompt: string;
}
// A tutor turn is a worked example when its reasoning marks it so.
function isWorkedTurn(turn: { role?: string; reasoning?: string | null }): boolean {
  const r = (turn.reasoning || '').toLowerCase();
  return turn.role === 'tutor' && (r === 'worked_example' || r.includes('worked example'));
}
function parseWorked(content: string): WorkedExample | null {
  try {
    const w = JSON.parse(content);
    if (w && typeof w === 'object' && Array.isArray(w.steps)) return w as WorkedExample;
  } catch { /* legacy prose worked example */ }
  return null;
}

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
  const { data: session, refetch: refetchSession, isLoading: sessionLoading, isError: sessionError } = useGetSession(sessionId, { query: { enabled: !!sessionId, queryKey: ['session', sessionId], retry: false } });
  
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
  // Selectable answer options: what the learner has picked, and whether they chose to type instead.
  const [selected, setSelected] = useState<string[]>([]);
  const [typeOwn, setTypeOwn] = useState(false);
  // True briefly when the learner tries to send while the coach is still replying, so we can flag
  // it (shake + notice) instead of silently dropping the message.
  const [sendBlocked, setSendBlocked] = useState(false);
  // Live mastery from the last graded turn (so the bar moves immediately) + a brief "+N%" gain badge.
  const [liveMastery, setLiveMastery] = useState<number | null>(null);
  const [masteryGain, setMasteryGain] = useState<number | null>(null);
  // Adaptive-difficulty level: a transient "level up" celebration when the learner crosses into a
  // harder tier, plus the last-crossed level so the badge can explain the change.
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const prevLevelRef = useRef(0);
  // Response-quality feedback (item 4): the grade of the just-submitted answer drives a brief,
  // always-encouraging animation (green check for strong, amber lightbulb for keep-going).
  const [feedback, setFeedback] = useState<null | { grade: number; id: number }>(null);
  // Milestone celebration (item 3): fires once when mastery first crosses 50% (80% has its own banner).
  const [milestone, setMilestone] = useState<number | null>(null);
  const reachedMilestones = useRef<Set<number>>(new Set());
  const prefersReducedMotion = useReducedMotion();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Local state for turns to optimistically append user message and streaming tutor message
  const [localTurns, setLocalTurns] = useState<any[]>([]);

  useEffect(() => {
    if (session?.turns) {
      setLocalTurns(session.turns);
    }
  }, [session?.turns]);

  // A fresh question resets the selection and the "type my own" toggle.
  useEffect(() => { setSelected([]); setTypeOwn(false); }, [localTurns.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localTurns, streamingText]);

  // Error (e.g. the session 403s or is gone): show a clear state + a way out, never an endless pulse.
  if (sessionError || (!sessionLoading && !session)) return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="text-center max-w-sm space-y-3">
        <p className="text-muted-foreground">This session could not be loaded. It may have ended or you may not have access.</p>
        <button className="text-sm font-medium text-primary hover:underline" onClick={() => setLocation('/dashboard')}>Back to dashboard</button>
      </div>
    </div>
  );
  if (!session) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-8 w-32 bg-muted rounded"></div>
      </div>
    </div>
  );

  // Use the live score from the last graded turn so the bar moves the moment grading finishes,
  // before the full session refetch lands.
  const effMastery = liveMastery != null ? liveMastery : (session.masteryScore || 0);
  const masteryPercentage = Math.round(effMastery * 100);
  const isMastered = effMastery >= 0.8;

  // The mastery meter grows and intensifies as the discussion progresses, so the learner can feel
  // the needle move: width, bar height, number size and colour all scale with the score.
  const mp = masteryPercentage;
  const masteryTier = mp >= 80 ? 3 : mp >= 50 ? 2 : mp >= 20 ? 1 : 0;
  const meterWidth = 176 + Math.round((mp / 100) * 184); // 176px -> 360px as it fills
  const masteryBarColor = mp >= 80 ? 'bg-green-500' : mp >= 50 ? 'bg-primary' : mp >= 20 ? 'bg-amber-500' : 'bg-muted-foreground/60';
  const masteryBarHeight = ['h-2', 'h-2.5', 'h-3', 'h-4'][masteryTier];
  const masteryNumClass = ['text-base text-foreground', 'text-lg text-amber-600', 'text-2xl text-primary', 'text-3xl text-green-600'][masteryTier];
  const masteryTextColor = mp >= 80 ? 'text-green-600' : mp >= 50 ? 'text-primary' : mp >= 20 ? 'text-amber-600' : 'text-muted-foreground';
  const masteryCaption = mp >= 80 ? 'Mastered' : mp >= 50 ? 'Almost there' : mp >= 20 ? 'Building' : 'Getting started';
  const level = tierFromPct(mp); // 0-3
  const levelInfo = LEVELS[level];

  const currentBeat = moduleData?.beats?.find(b => b.id === session.currentBeatId);

  // The "fact pattern": the context the learner should be able to see at all times — what
  // they're catching up on (if remedial), the module's premise, and the situation for the
  // current step. Composed from the session + module + current beat.
  const factPattern = {
    focus: sanitizePlain(((session as unknown as { remedialFocus?: string | null }).remedialFocus) || '') || null,
    description: sanitizePlain(moduleData?.description || ''),
    scenario: sanitizePlain(currentBeat?.scenario || currentBeat?.narration || ''),
    bullets: ((currentBeat?.bulletPoints ?? []) as string[]).map((b) => sanitizePlain(b)),
  };
  const hasFacts = !!(factPattern.focus || factPattern.description || factPattern.scenario || factPattern.bullets.length);

  // The current (latest) coach question and its selectable answer choices, if any.
  const lastTurn = localTurns[localTurns.length - 1];
  const activeOptions: string[] = (lastTurn && lastTurn.role === 'tutor' && Array.isArray(lastTurn.options)) ? lastTurn.options : [];
  const activeMode: string = (lastTurn && lastTurn.role === 'tutor' && lastTurn.selectMode) ? lastTurn.selectMode : 'free';
  // Only show options when the learner has NOT started typing, so switching modes never hides (and
  // loses) text they were partway through writing.
  const showOptions = !isStreaming && !isMastered && activeOptions.length >= 2 && activeMode !== 'free' && !typeOwn && !inputValue.trim();

  function toggleSelect(opt: string) {
    if (activeMode === 'multi') {
      setSelected((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]));
    } else {
      setSelected([opt]);
    }
  }
  function submitSelection() {
    if (selected.length === 0) return;
    // Preserve the order the options were presented in for multi-select.
    const ordered = activeOptions.filter((o) => selected.includes(o));
    handleSend(activeMode === 'multi' ? ordered.join('; ') : ordered[0], true);
    setSelected([]);
  }

  const handleSend = async (explicit?: string, isSelection?: boolean) => {
    const userMessage = (explicit ?? inputValue).trim();
    if (!userMessage) return;
    // Coach still replying: keep the learner's text and flag it, never drop it silently.
    if (isStreaming) {
      setSendBlocked(true);
      setTimeout(() => setSendBlocked(false), 2500);
      return;
    }

    if (explicit === undefined) setInputValue('');
    setSendBlocked(false);
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
      { response: userMessage, beatId: session.currentBeatId || '', isSelection: !!isSelection },
      (token) => {
        setStreamingText(prev => prev + token);
      },
      (meta) => {
        // Move the mastery bar immediately from the graded done-event, before the refetch lands.
        if (typeof meta.masteryScore === 'number') {
          const prevPct = Math.round((session.masteryScore || 0) * 100);
          const newPct = Math.round(meta.masteryScore * 100);
          setLiveMastery(meta.masteryScore);
          if (newPct > prevPct) { setMasteryGain(newPct - prevPct); setTimeout(() => setMasteryGain(null), 2800); }
          // Level up: the learner has crossed into a harder difficulty tier. Celebrate it briefly.
          const prevTier = tierFromPct(prevPct);
          const newTier = tierFromPct(newPct);
          if (newTier > prevTier) { setLevelUp(newTier); setTimeout(() => setLevelUp(null), 3200); }
        }
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

  // Deliberate scaffolding: fetch ONE structured worked example, which then renders as its own
  // interactive card (a distinct box) in the transcript. Not streamed — it comes back as JSON.
  const handleWorkedExample = async () => {
    if (isStreaming) return;
    setShowScaffold(false);
    setIsStreaming(true);
    setStreamingText('');
    try {
      await fetch(`/api/sessions/${sessionId}/worked-example`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: '{}',
      });
    } catch (e) {
      console.error('worked-example error', e);
    } finally {
      await refetchSession();
      setIsStreaming(false);
      setStreamingText('');
    }
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
        <div className="flex items-center gap-2 sm:gap-3">
        <LevelBadge level={level} info={levelInfo} levelUp={levelUp} reducedMotion={!!prefersReducedMotion} />
        <div className="flex items-center gap-3 transition-all duration-500" style={{ width: meterWidth, maxWidth: '52vw' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mastery</span>
              <span className={cn("text-[10px] sm:text-xs font-medium transition-colors", masteryTextColor)}>{masteryCaption}</span>
            </div>
            <div className={cn("w-full overflow-hidden rounded-full bg-muted transition-all duration-500", masteryBarHeight)}>
              <div
                className={cn("h-full rounded-full transition-all duration-700 ease-out", masteryBarColor, mp >= 80 && "shadow-[0_0_14px_2px] shadow-green-500/50")}
                style={{ width: `${mp}%` }}
              />
            </div>
          </div>
          <div className="relative flex items-center">
            <span className={cn("font-bold tabular-nums leading-none transition-all duration-500", masteryNumClass)}>{mp}%</span>
            {masteryGain != null && (
              <motion.span
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: -2, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -top-4 right-0 whitespace-nowrap rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-600"
              >
                +{masteryGain}%
              </motion.span>
            )}
          </div>
        </div>
        </div>
      </header>

      {/* Guidance + context bar — sticky under the header so instructions and the fact pattern
          are reachable at all times. Each panel can be minimised or expanded during the session. */}
      {!isMastered && (
        <div className="shrink-0 sticky top-14 z-10 border-b border-border bg-muted">
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
                    <p className="text-muted-foreground">Your coach asks guiding questions. Answer in your own words and explain your reasoning; there's no single right wording, and the coach won't hand you the answer.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">What mastery looks like</p>
                    <p className="text-muted-foreground">Move the Mastery bar to 80% by reasoning clearly and applying the idea to new situations. Reach 80% and you've mastered it, and earned your credential.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="font-semibold text-foreground">How long it takes</p>
                    <p className="text-muted-foreground">About 10 to 15 minutes. Your progress saves as you go, so you can pause and pick up where you left off.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fact pattern — the situation/context, available throughout */}
          {showFacts && (
            <div className="border-t border-border bg-amber-50 dark:bg-amber-950/30">
              <div className="mx-auto max-w-3xl px-4 py-3 text-sm">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Fact pattern: the context for this session</p>
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
            {localTurns.map((turn, idx) => {
              // Worked examples render as their own distinct, interactive card.
              if (isWorkedTurn(turn)) {
                return (
                  <motion.div
                    key={turn.id || idx}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="w-full"
                  >
                    <WorkedExampleCard data={parseWorked(turn.content)} raw={turn.content} />
                  </motion.div>
                );
              }
              return (
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
                    {turn.role === 'tutor' ? sanitizePlain(turn.content) : turn.content}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Streaming active message */}
          {isStreaming && (
             <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full justify-start"
             >
              <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap bg-card border border-border shadow-sm rounded-tl-sm text-foreground relative">
                {streamingText ? sanitizePlain(streamingText) : (
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
                This one is genuinely tricky, and that's completely normal.
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
            <div className="relative overflow-hidden mt-8 mb-4 p-8 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 flex flex-col items-center text-center animate-in zoom-in-95 duration-500">
              <Confetti />
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

      {/* Input Area — selectable answer choices for most questions, with a "type my own" escape;
          free-text box when the coach asks for the learner's own words (or they choose to write). */}
      <footer className="shrink-0 bg-background border-t border-border p-4 pb-safe">
        <div className="max-w-3xl mx-auto">
          {showOptions ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {activeMode === 'multi' ? 'Pick all that apply' : 'Choose your answer'}
                </p>
                <button onClick={() => setTypeOwn(true)} className="text-xs font-medium text-primary hover:underline">
                  I'd rather write my answer
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeOptions.map((opt, i) => {
                  const on = selected.includes(opt);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleSelect(opt)}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl border-2 p-3 text-left text-sm transition",
                        on ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                      )}
                    >
                      <span className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border text-[10px]",
                        activeMode === 'multi' ? "rounded-[4px]" : "rounded-full",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
                      )}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="text-foreground">{sanitizePlain(opt)}</span>
                    </button>
                  );
                })}
              </div>
              <Button className="mt-3 w-full sm:w-auto" size="lg" disabled={selected.length === 0} onClick={submitSelection}>
                Submit answer <Send className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <motion.div
                className="relative"
                animate={sendBlocked ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
              >
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isMastered ? "Session completed." : isStreaming ? "Your coach is replying, keep typing if you like…" : "Type your response..."}
                  disabled={isMastered}
                  className={cn(
                    "w-full resize-none rounded-xl border bg-card px-4 py-4 pr-14 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[60px] max-h-[200px]",
                    sendBlocked ? "border-amber-400" : "border-input"
                  )}
                  rows={1}
                  style={{ height: 'auto' }}
                />
                <Button
                  size="icon"
                  className="absolute right-2 top-[50%] -translate-y-[50%] h-10 w-10 rounded-lg"
                  disabled={!inputValue.trim() || isStreaming || isMastered}
                  onClick={() => handleSend()}
                  title={isStreaming ? "Your coach is still replying" : "Send"}
                >
                  {isStreaming ? <span className="h-2 w-2 rounded-full bg-current animate-pulse" /> : <Send className="h-4 w-4" />}
                </Button>
              </motion.div>
              <div className="mt-2 flex items-center justify-between gap-3">
                {typeOwn && activeOptions.length >= 2 && activeMode !== 'free' && !isMastered ? (
                  <button onClick={() => { setTypeOwn(false); setInputValue(''); }} className="text-xs font-medium text-primary hover:underline">
                    Back to answer choices
                  </button>
                ) : <span />}
                {sendBlocked ? (
                  <span className="text-xs font-medium text-amber-600">Your coach is still replying. Your message is kept, send it in a moment.</span>
                ) : isStreaming ? (
                  <span className="text-xs text-muted-foreground">Your coach is replying…</span>
                ) : <span />}
              </div>
            </div>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3">
          The tutor will not provide answers, only questions to guide your reasoning.
        </p>
      </footer>
    </div>
  );
}

// Difficulty-level colours (never red). Foundation -> Advanced climbs slate -> amber -> blue -> green,
// mirroring the mastery meter so the two always read as one system.
const LEVEL_TONE = [
  'text-slate-600 bg-slate-500/10 border-slate-300 dark:text-slate-300 dark:border-slate-700',
  'text-amber-700 bg-amber-500/10 border-amber-300 dark:text-amber-300 dark:border-amber-800',
  'text-blue-700 bg-blue-500/10 border-blue-300 dark:text-blue-300 dark:border-blue-800',
  'text-green-700 bg-green-500/10 border-green-300 dark:text-green-300 dark:border-green-800',
];

/**
 * Adaptive-difficulty Level badge, shown beside the Mastery meter. Always tells the learner which
 * level of question they're being asked and why; when they cross into a harder tier a brief, upbeat
 * "Level up" chip animates out (honoured only when reduced-motion is off). Purely visual - it reads
 * the mastery-derived level, it does not change the tutoring.
 */
function LevelBadge({ level, info, levelUp, reducedMotion }: { level: number; info: { name: string; short: string; tip: string }; levelUp: number | null; reducedMotion: boolean }) {
  const celebrating = levelUp === level && !reducedMotion;
  return (
    <div className="relative shrink-0">
      <motion.div
        animate={celebrating ? { scale: [1, 1.14, 1] } : { scale: 1 }}
        transition={{ duration: 0.6 }}
        title={`Level ${level + 1} of 4 - ${info.name}. ${info.tip}`}
        aria-label={`Current level: ${info.name}, level ${level + 1} of 4`}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
          LEVEL_TONE[level],
          celebrating && 'shadow-[0_0_16px_2px] shadow-current/30',
        )}
      >
        <TrendingUp className="h-3.5 w-3.5" />
        <span className="tabular-nums">{info.short}</span>
        <span className="hidden md:inline">{info.name}</span>
      </motion.div>
      <AnimatePresence>
        {levelUp === level && (
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.85 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: -4, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 shadow-md dark:border-green-800 dark:bg-green-950/60 dark:text-green-300"
          >
            Level up - you're reasoning well
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Sound-free celebration burst shown once when a gap is closed (mastery reached). Dependency-free.
function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 26 }, (_, i) => ({
      id: i,
      x: (Math.random() * 2 - 1) * 240,
      y: 120 + Math.random() * 150,
      rot: Math.random() * 540 - 270,
      delay: Math.random() * 0.15,
      color: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'][i % 5],
    }))
  );
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: 0, x: p.x, y: p.y, rotate: p.rot }}
          transition={{ duration: 1.5, delay: p.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', top: 8, width: 8, height: 8, borderRadius: 2, background: p.color }}
        />
      ))}
    </div>
  );
}

// Interactive worked example: a distinct box that reveals the reasoning one step at a time, then
// hands back to the dialogue with a "Now you try" prompt. Falls back to a plain box for legacy
// (pre-structured) worked examples so they still render distinctly.
function WorkedExampleCard({ data, raw }: { data: WorkedExample | null; raw?: string }) {
  const [revealed, setRevealed] = useState(1);

  if (!data) {
    return (
      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <div className="mb-2 flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <Lightbulb className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wide">Worked example</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{sanitizePlain(raw || '')}</p>
      </div>
    );
  }

  const total = data.steps.length;
  const allShown = revealed >= total;

  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 sm:p-6 dark:border-indigo-900/40 dark:bg-indigo-950/15">
      <div className="mb-3 flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
        <Lightbulb className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wide">Worked example</span>
      </div>
      <p className="text-sm text-foreground">{data.intro}</p>
      <p className="mt-1 text-xs text-muted-foreground">Seeing the reasoning worked through once makes the next one easier to do yourself. Step through it, then try one below.</p>

      <div className="mt-4 rounded-xl border border-border bg-background p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">The situation</p>
        <p className="mt-1 text-sm text-foreground">{data.situation}</p>
      </div>

      <div className="mt-3 space-y-2">
        {data.steps.slice(0, revealed).map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-xl border border-indigo-200/70 bg-background p-3 dark:border-indigo-900/30"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">{i + 1}</span>
              <span className="text-sm font-semibold text-foreground">{s.heading}</span>
            </div>
            <p className="mt-1 pl-7 text-sm leading-relaxed text-muted-foreground">{s.detail}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {data.steps.map((_, i) => (
            <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors", i < revealed ? "bg-indigo-500" : "bg-indigo-200 dark:bg-indigo-900/40")} />
          ))}
        </div>
        {!allShown ? (
          <Button size="sm" onClick={() => setRevealed(r => Math.min(total, r + 1))}>
            Next step <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">All steps shown</span>
        )}
      </div>

      {allShown && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PencilLine className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide">Now you try</span>
          </div>
          <p className="text-sm text-foreground">{data.tryPrompt}</p>
          <p className="mt-2 text-xs text-muted-foreground">Type your answer in the box below to keep going.</p>
        </div>
      )}
    </div>
  );
}
