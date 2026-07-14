import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation, useSearch } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, ChevronRight, CheckCircle, BookOpen, List,
  MessageSquare, LayoutGrid, BarChart2, Play, HelpCircle,
  X, Menu, Trophy, Clock, PlayCircle, GraduationCap, FileText, Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuizOption { id: string; text: string; }
interface Quiz {
  question: string;
  options: QuizOption[];
  correctId: string;
  explanation: string;
}

interface InteractiveItem { id: string; text: string; correctPosition?: number; }
interface InteractivePair { id: string; left: string; right: string; }
interface Interactive {
  type: 'drag_order' | 'match_pairs' | 'fill_blank';
  prompt: string;
  items?: InteractiveItem[];
  pairs?: InteractivePair[];
  template?: string;
  wordBank?: string[];
  answers?: string[];
}

interface Beat {
  id: string;
  type: string;
  title: string;
  order: number;
  narration: string;
  bulletPoints?: string[] | null;
  scenario?: string | null;
  visualData?: { quiz?: Quiz; interactive?: Interactive; subtype?: string; columns?: [string, string] } | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
}

interface ModuleDetail {
  id: string;
  title: string;
  description?: string;
  courseId: string;
  estimatedMinutes: number;
  beatCount: number;
  status: string;
  lessonType?: string;
  beats: Beat[];
}

interface CourseSummary { id: string; title: string; }

// ─── Beat metadata ────────────────────────────────────────────────────────────

const BEAT_META: Record<string, { icon: React.ElementType; label: string; accent: string }> = {
  title_card: { icon: BookOpen,     label: 'Introduction',  accent: 'text-primary' },
  points:     { icon: List,         label: 'Key Points',    accent: 'text-emerald-600' },
  scenario:   { icon: MessageSquare,label: 'Scenario',      accent: 'text-amber-600' },
  compare:    { icon: LayoutGrid,   label: 'Compare',       accent: 'text-violet-600' },
  diagram:    { icon: BarChart2,    label: 'Diagram',       accent: 'text-cyan-600' },
  close:      { icon: CheckCircle,  label: 'Summary',       accent: 'text-emerald-600' },
  video:      { icon: Play,         label: 'Video',         accent: 'text-blue-600' },
};

function getBeatMeta(beat: Beat) {
  if (beat.visualData?.quiz) {
    return { icon: HelpCircle, label: 'Check for Understanding', accent: 'text-violet-600' };
  }
  return BEAT_META[beat.type] ?? { icon: BookOpen, label: beat.type, accent: 'text-muted-foreground' };
}

// ─── Individual beat renderers ─────────────────────────────────────────────────

function TitleCardBeat({ beat }: { beat: Beat }) {
  return (
    <div className="min-h-[65vh] flex flex-col items-center justify-center px-8 py-20 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
      <motion.div
        className="max-w-2xl w-full"
        initial={{ opacity: 0, y: 36 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <Badge variant="secondary" className="mb-6 text-xs uppercase tracking-wider px-3 py-1">
          Introduction
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8 leading-tight">
          {beat.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
          {beat.narration}
        </p>
      </motion.div>
    </div>
  );
}

function PointsBeat({ beat }: { beat: Beat }) {
  const points = beat.bulletPoints ?? [];
  return (
    <div className="px-8 py-12 max-w-3xl mx-auto">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-lg text-muted-foreground mb-10 leading-relaxed"
      >
        {beat.narration}
      </motion.p>
      <div className="space-y-3">
        {points.map((pt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.09, duration: 0.35, ease: 'easeOut' }}
          >
            <div className="flex gap-4 items-start p-4 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted/60 transition-colors">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 font-bold text-sm">
                {i + 1}
              </div>
              <p className="text-base pt-0.5 leading-relaxed">{pt}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function ScenarioBeat({ beat }: { beat: Beat }) {
  return (
    <div className="px-8 py-12 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 overflow-hidden shadow-sm">
          <div className="bg-amber-500/10 px-6 py-4 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <span className="font-semibold text-amber-700 dark:text-amber-400">Your Scenario</span>
          </div>
          <div className="p-6 space-y-6">
            <p className="text-base text-muted-foreground leading-relaxed">{beat.narration}</p>
            {beat.scenario && (
              <blockquote className="border-l-4 border-amber-400 pl-5 py-1 italic text-foreground text-base leading-relaxed">
                {beat.scenario}
              </blockquote>
            )}
            <div className="bg-background/80 rounded-xl p-4 border border-border/40">
              <span className="font-semibold text-foreground text-sm">Reflect: </span>
              <span className="text-muted-foreground text-sm">
                What would you do in this situation? Consider both the immediate response and the
                longer-term impact on the relationship.
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function CompareBeat({ beat }: { beat: Beat }) {
  const bullets = beat.bulletPoints ?? [];
  const mid = Math.ceil(bullets.length / 2);
  const leftItems = bullets.slice(0, mid);
  const rightItems = bullets.slice(mid);

  // Try to get column labels from "A vs B" title pattern
  const vsMatch = beat.title.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  const [leftLabel, rightLabel] = vsMatch
    ? [vsMatch[1].trim(), vsMatch[2].trim()]
    : ['Before', 'After'];

  const stripPrefix = (s: string) =>
    s.replace(/^(Reactive|Proactive|Formal|Informal|Before|After):\s*/i, '');

  return (
    <div className="px-8 py-12 max-w-4xl mx-auto">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-muted-foreground mb-10 leading-relaxed text-base"
      >
        {beat.narration}
      </motion.p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <motion.div
          initial={{ opacity: 0, x: -36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.42 }}
        >
          <div className="rounded-xl border border-rose-200 dark:border-rose-800 overflow-hidden h-full">
            <div className="bg-rose-50 dark:bg-rose-950/30 px-5 py-3 flex items-center gap-2 border-b border-rose-200 dark:border-rose-800">
              <X className="h-4 w-4 text-rose-500" />
              <span className="font-semibold text-rose-700 dark:text-rose-400 text-sm">{leftLabel}</span>
            </div>
            <div className="p-4 space-y-3">
              {leftItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <X className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">{stripPrefix(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.42 }}
        >
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden h-full">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 px-5 py-3 flex items-center gap-2 border-b border-emerald-200 dark:border-emerald-800">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">{rightLabel}</span>
            </div>
            <div className="p-4 space-y-3">
              {rightItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <CheckCircle className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm leading-relaxed">{stripPrefix(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function CloseBeat({ beat }: { beat: Beat }) {
  const points = beat.bulletPoints ?? [];
  return (
    <div className="px-8 py-12 max-w-3xl mx-auto">
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
      >
        <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center mx-auto mb-5">
          <Trophy className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold mb-3">{beat.title}</h2>
        <p className="text-muted-foreground leading-relaxed max-w-lg mx-auto">{beat.narration}</p>
      </motion.div>
      {points.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-4">
            Key Takeaways
          </h3>
          {points.map((pt, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.08 }}
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border/50">
                <CheckCircle className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm leading-relaxed">{pt}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function VideoBeat({ beat }: { beat: Beat }) {
  return (
    <div className="px-8 py-12 max-w-3xl mx-auto">
      <p className="text-muted-foreground mb-6 leading-relaxed">{beat.narration}</p>
      {beat.videoUrl ? (
        <div className="aspect-video rounded-xl overflow-hidden bg-black border border-border shadow-md">
          <video src={beat.videoUrl} controls className="w-full h-full" />
        </div>
      ) : (
        <div className="aspect-video rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/20">
          <div className="text-center text-muted-foreground">
            <Play className="h-12 w-12 mx-auto mb-3 opacity-25" />
            <p className="text-sm font-medium">Video content coming soon</p>
            <p className="text-xs mt-1 opacity-60">Upload a video in the Studio editor</p>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizBeat({ beat }: { beat: Beat }) {
  const quiz = beat.visualData!.quiz!;
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const isCorrect = submitted && selected === quiz.correctId;

  return (
    <div className="px-8 py-12 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden shadow-sm">
          <div className="bg-violet-50 dark:bg-violet-950/20 px-6 py-4 border-b border-violet-200 dark:border-violet-800 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <span className="font-semibold text-violet-700 dark:text-violet-400">Check for Understanding</span>
          </div>
          <div className="p-6">
            <p className="text-base font-medium mb-7 leading-relaxed">{quiz.question}</p>
            <div className="space-y-3">
              {quiz.options.map((opt) => {
                const isOptionCorrect = submitted && opt.id === quiz.correctId;
                const isOptionWrong = submitted && opt.id === selected && opt.id !== quiz.correctId;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={submitted}
                    onClick={() => setSelected(opt.id)}
                    className={cn(
                      'w-full text-left flex items-center gap-3 p-4 rounded-xl border transition-all text-sm',
                      !submitted && selected === opt.id && 'border-primary bg-primary/10',
                      !submitted && selected !== opt.id && 'border-border hover:bg-muted/50',
                      isOptionCorrect && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
                      isOptionWrong && 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
                    )}
                  >
                    <div className={cn(
                      'h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                      selected === opt.id ? 'border-primary' : 'border-muted-foreground/40',
                    )}>
                      {selected === opt.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <span className="flex-1">{opt.text}</span>
                    {isOptionCorrect && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                    {isOptionWrong && <X className="h-4 w-4 text-rose-500 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
            {!submitted ? (
              <Button
                className="mt-6"
                disabled={!selected}
                onClick={() => setSubmitted(true)}
              >
                Submit Answer
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'mt-6 p-4 rounded-xl border',
                  isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800',
                )}
              >
                <div className={cn(
                  'flex items-center gap-2 font-semibold mb-2',
                  isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                )}>
                  {isCorrect
                    ? <CheckCircle className="h-5 w-5" />
                    : <X className="h-5 w-5" />}
                  {isCorrect ? 'Correct! Well done.' : "Not quite — here's why:"}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{quiz.explanation}</p>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Interactive beats ─────────────────────────────────────────────────────────

function DragOrderActivity({ ia }: { ia: Interactive }) {
  const [order, setOrder] = useState<InteractiveItem[]>(() =>
    [...(ia.items ?? [])].sort(() => Math.random() - 0.5),
  );
  const [checked, setChecked] = useState(false);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setOrder(next);
  };

  const allCorrect = order.every((item, i) => item.correctPosition === i + 1);

  return (
    <div className="px-6 py-10 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden shadow-sm">
          <div className="bg-violet-50 dark:bg-violet-950/20 px-5 py-3.5 border-b border-violet-200 dark:border-violet-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">Sort in the correct order</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm font-medium leading-relaxed text-muted-foreground">{ia.prompt}</p>
            <div className="space-y-2">
              {order.map((item, i) => {
                const correct = checked && item.correctPosition === i + 1;
                const wrong = checked && item.correctPosition !== i + 1;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors',
                      correct && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
                      wrong && 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
                      !checked && 'border-border bg-muted/30',
                    )}
                  >
                    <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0 text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium">{item.text}</span>
                    {!checked && (
                      <div className="flex flex-col gap-0.5">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                          className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors">
                          <ChevronLeft className="h-3 w-3 rotate-90" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1}
                          className="p-1 rounded hover:bg-muted disabled:opacity-20 transition-colors">
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </button>
                      </div>
                    )}
                    {correct && <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                    {wrong && <X className="h-4 w-4 text-rose-500 flex-shrink-0" />}
                  </motion.div>
                );
              })}
            </div>
            {!checked ? (
              <Button className="mt-2" onClick={() => setChecked(true)}>Check Order</Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-xl border p-4 text-sm font-medium',
                  allCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-700',
                )}
              >
                {allCorrect
                  ? '✓ Perfect order! Well done.'
                  : 'Not quite — review the highlighted items and try to recall the correct sequence.'}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function MatchPairsActivity({ ia }: { ia: Interactive }) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const rights = useState(() => [...(ia.pairs ?? [])].sort(() => Math.random() - 0.5))[0];

  const selectLeft = (id: string) => {
    if (checked) return;
    setSelectedLeft(prev => prev === id ? null : id);
  };
  const selectRight = (rightId: string) => {
    if (checked || !selectedLeft) return;
    setMatches(prev => {
      const next = { ...prev };
      // Remove any existing match to this right
      Object.keys(next).forEach(k => { if (next[k] === rightId) delete next[k]; });
      next[selectedLeft] = rightId;
      return next;
    });
    setSelectedLeft(null);
  };

  const colorFor = (leftId: string) => {
    const colors = ['bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40',
      'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40',
      'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40',
      'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40',
      'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40'];
    const idx = (ia.pairs ?? []).findIndex(p => p.id === leftId);
    return colors[idx % colors.length];
  };

  const isAllCorrect = (ia.pairs ?? []).every(p => matches[p.id] === p.id);

  return (
    <div className="px-6 py-10 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden shadow-sm">
          <div className="bg-violet-50 dark:bg-violet-950/20 px-5 py-3.5 border-b border-violet-200 dark:border-violet-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">Match the pairs</span>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm text-muted-foreground">{ia.prompt}</p>
            {!selectedLeft && !checked && (
              <p className="text-xs text-muted-foreground/70 italic">Tap a concept on the left, then tap its match on the right.</p>
            )}
            {selectedLeft && !checked && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-xs text-primary font-medium">
                Now tap the matching definition on the right ›
              </motion.p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {/* Left: concepts */}
              <div className="space-y-2">
                {(ia.pairs ?? []).map(p => {
                  const matched = !!matches[p.id];
                  const isSelected = selectedLeft === p.id;
                  const correctMatch = checked && matches[p.id] === p.id;
                  const wrongMatch = checked && matches[p.id] !== p.id;
                  return (
                    <button key={p.id} type="button"
                      onClick={() => selectLeft(p.id)}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 text-sm font-medium transition-all',
                        isSelected && 'ring-2 ring-primary border-primary bg-primary/10',
                        matched && !isSelected && !checked && colorFor(p.id),
                        correctMatch && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
                        wrongMatch && 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
                        !matched && !isSelected && 'border-border hover:bg-muted/50',
                      )}>
                      {p.left}
                    </button>
                  );
                })}
              </div>
              {/* Right: definitions */}
              <div className="space-y-2">
                {rights.map(p => {
                  const matchedBy = Object.keys(matches).find(k => matches[k] === p.id);
                  const isMatchedLeft = !!matchedBy;
                  const correctMatch = checked && matchedBy === p.id;
                  const wrongMatch = checked && matchedBy && matchedBy !== p.id;
                  return (
                    <button key={p.id} type="button"
                      onClick={() => selectRight(p.id)}
                      disabled={checked}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 text-sm transition-all',
                        isMatchedLeft && !checked && colorFor(matchedBy!),
                        correctMatch && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
                        wrongMatch && 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
                        !isMatchedLeft && 'border-border hover:bg-muted/50',
                        selectedLeft && !isMatchedLeft && 'ring-1 ring-primary/30 hover:bg-primary/5',
                      )}>
                      {p.right}
                    </button>
                  );
                })}
              </div>
            </div>

            {!checked ? (
              <Button
                className="mt-2"
                disabled={(ia.pairs ?? []).some(p => !matches[p.id])}
                onClick={() => setChecked(true)}
              >
                Check Matches
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-xl border p-4 text-sm font-medium',
                  isAllCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-700',
                )}
              >
                {isAllCorrect ? '✓ All pairs matched correctly!' : 'Some pairs are off — review the highlighted items.'}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FillBlankActivity({ ia }: { ia: Interactive }) {
  const blanks = ia.answers ?? [];
  const [filled, setFilled] = useState<(string | null)[]>(blanks.map(() => null));
  const [bank, setBank] = useState<string[]>(() => [...(ia.wordBank ?? [])].sort(() => Math.random() - 0.5));
  const [checked, setChecked] = useState(false);

  const parts = (ia.template ?? '').split('___');

  const placeWord = (word: string) => {
    if (checked) return;
    const nextEmpty = filled.indexOf(null);
    if (nextEmpty === -1) return;
    setFilled(prev => prev.map((v, i) => i === nextEmpty ? word : v));
    setBank(prev => prev.filter(w => w !== word));
  };

  const removeWord = (blankIdx: number) => {
    if (checked) return;
    const word = filled[blankIdx];
    if (!word) return;
    setFilled(prev => prev.map((v, i) => i === blankIdx ? null : v));
    setBank(prev => [...prev, word]);
  };

  const allCorrect = filled.every((w, i) => w?.toLowerCase() === blanks[i]?.toLowerCase());

  return (
    <div className="px-6 py-10 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden shadow-sm">
          <div className="bg-violet-50 dark:bg-violet-950/20 px-5 py-3.5 border-b border-violet-200 dark:border-violet-800 flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-600" />
            <span className="font-semibold text-sm text-violet-700 dark:text-violet-300">Fill in the blanks</span>
          </div>
          <div className="p-5 space-y-5">
            <p className="text-xs text-muted-foreground">{ia.prompt}</p>
            {/* Template with blanks */}
            <div className="text-base leading-loose font-medium">
              {parts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < blanks.length && (
                    <button
                      type="button"
                      onClick={() => removeWord(i)}
                      className={cn(
                        'inline-flex items-center px-3 py-0.5 mx-1 rounded-lg border-2 border-dashed min-w-[80px] text-center justify-center text-sm transition-all',
                        filled[i] && !checked && 'border-primary bg-primary/10 text-primary font-semibold',
                        !filled[i] && 'border-muted-foreground/30 text-muted-foreground/50',
                        checked && filled[i]?.toLowerCase() === blanks[i]?.toLowerCase() && 'border-emerald-400 bg-emerald-50 text-emerald-700',
                        checked && filled[i]?.toLowerCase() !== blanks[i]?.toLowerCase() && 'border-rose-400 bg-rose-50 text-rose-700',
                      )}
                    >
                      {filled[i] ?? '  '}
                    </button>
                  )}
                </span>
              ))}
            </div>

            {/* Word bank */}
            {!checked && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Word bank</p>
                <div className="flex flex-wrap gap-2">
                  {bank.map(word => (
                    <motion.button
                      key={word}
                      type="button"
                      layout
                      onClick={() => placeWord(word)}
                      whileTap={{ scale: 0.93 }}
                      className="px-3 py-1.5 rounded-full border border-border bg-card text-sm font-medium hover:bg-primary/10 hover:border-primary/50 transition-colors"
                    >
                      {word}
                    </motion.button>
                  ))}
                  {bank.length === 0 && <span className="text-xs text-muted-foreground italic">All words placed — tap a blank to return it.</span>}
                </div>
              </div>
            )}

            {!checked ? (
              <Button
                disabled={filled.some(f => f === null)}
                onClick={() => setChecked(true)}
              >
                Check Answers
              </Button>
            ) : (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-xl border p-4 text-sm font-medium',
                  allCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-700',
                )}
              >
                {allCorrect ? '✓ All blanks correct! Great recall.' : (
                  <>Not all correct. Correct answers: {blanks.map((b, i) => (
                    <span key={i} className={cn(
                      'mx-1 px-2 rounded font-semibold',
                      filled[i]?.toLowerCase() === b?.toLowerCase() ? 'text-emerald-700' : 'bg-amber-100 text-amber-800',
                    )}>{b}</span>
                  ))}</>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function InteractiveBeat({ beat }: { beat: Beat }) {
  const ia = beat.visualData!.interactive!;
  if (ia.type === 'drag_order')  return <DragOrderActivity ia={ia} />;
  if (ia.type === 'match_pairs') return <MatchPairsActivity ia={ia} />;
  if (ia.type === 'fill_blank')  return <FillBlankActivity ia={ia} />;
  return (
    <div className="px-8 py-12 text-center text-muted-foreground text-sm">
      Unknown interactive type: {ia.type}
    </div>
  );
}

// ─── Beat router ──────────────────────────────────────────────────────────────

function BeatRenderer({ beat }: { beat: Beat }) {
  if (beat.visualData?.interactive) return <InteractiveBeat key={beat.id} beat={beat} />;
  if (beat.visualData?.quiz) return <QuizBeat key={beat.id} beat={beat} />;
  switch (beat.type) {
    case 'title_card': return <TitleCardBeat beat={beat} />;
    case 'points':     return <PointsBeat beat={beat} />;
    case 'scenario':   return <ScenarioBeat beat={beat} />;
    case 'compare':    return <CompareBeat beat={beat} />;
    case 'close':      return <CloseBeat beat={beat} />;
    case 'video':      return <VideoBeat beat={beat} />;
    default:           return <PointsBeat beat={beat} />;
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ModuleViewer() {
  const [, params] = useRoute<{ courseId: string; moduleId: string }>(
    '/courses/:courseId/modules/:moduleId',
  );
  const [, navigate] = useLocation();
  const search = useSearch();
  const modeParam = new URLSearchParams(search).get('mode');
  const { courseId, moduleId } = params ?? {};

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: mod, isLoading } = useQuery({
    queryKey: ['module-detail', moduleId],
    queryFn: () => apiFetch<ModuleDetail>(`/modules/${moduleId}`),
    enabled: !!moduleId,
  });

  const { data: course } = useQuery({
    queryKey: ['course-summary', courseId],
    queryFn: () => apiFetch<CourseSummary>(`/courses/${courseId}`),
    enabled: !!courseId,
  });

  // Persisted progress. Previously "completed" lived only in React state, so it was
  // wiped on every refresh and a learner's progress was fiction. Seed from the server.
  const { data: serverProgress } = useQuery({
    queryKey: ['module-progress', moduleId],
    queryFn: () => apiFetch<{ viewedBeatIds: string[] }>(`/progress/module/${moduleId}`),
    enabled: !!moduleId,
  });

  useEffect(() => {
    if (serverProgress?.viewedBeatIds?.length) {
      setCompletedIds(prev => new Set([...prev, ...serverProgress.viewedBeatIds]));
    }
  }, [serverProgress]);

  const markBeatViewed = useMutation({
    mutationFn: (vars: { beatId: string; secondsSpent: number }) =>
      apiFetch('/progress/beat', { method: 'POST', body: JSON.stringify(vars) }),
    onSuccess: () => {
      // Course-level completion (and possibly enrolment completion) just changed.
      queryClient.invalidateQueries({ queryKey: ['course-progress', courseId] });
      queryClient.invalidateQueries({ queryKey: ['my-progress'] });
    },
  });

  const allBeats = mod?.beats ?? [];

  // ── Viewer-mode derived state (computed before any early returns) ──────────
  const mode = modeParam ?? '';
  const isSlides = mode === 'slides';
  const beats = mode === 'quiz'
    ? allBeats.filter(b => !!b.visualData?.quiz)
    : mode === 'interactive'
      ? allBeats.filter(b => !!b.visualData?.interactive)
      : allBeats;
  const currentBeat = beats[currentIndex];
  const completedCount = completedIds.size;
  const pct = beats.length > 0 ? (completedCount / beats.length) * 100 : 0;

  // Scroll to top whenever beat changes — must be before any early returns
  useEffect(() => {
    if (modeParam) mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentIndex, modeParam]);

  // Record the beat as viewed, and bank the dwell time when the learner leaves it.
  //
  // We mark on ARRIVAL, not on "Next". The old code only marked a beat complete when
  // you clicked Next, which meant the LAST beat of a module was never marked -- so a
  // learner could finish a module and still be stuck below 100%, and the enrolment
  // could never complete. Marking on arrival fixes that; the endpoint is idempotent
  // so re-viewing costs nothing.
  const currentBeatId = currentBeat?.id;
  useEffect(() => {
    if (!currentBeatId || !modeParam) return;

    markBeatViewed.mutate({ beatId: currentBeatId, secondsSpent: 0 });
    setCompletedIds(prev => new Set([...prev, currentBeatId]));

    const enteredAt = Date.now();
    return () => {
      const seconds = Math.round((Date.now() - enteredAt) / 1000);
      // Ignore instant fly-bys; the API clamps the upper bound so an abandoned tab
      // can't inflate training hours.
      if (seconds > 2) {
        markBeatViewed.mutate({ beatId: currentBeatId, secondsSpent: seconds });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBeatId, modeParam]);

  // ── Hub mode: no ?mode= param → show the activity picker ─────────────────
  if (!modeParam) {
    return (
      <ModuleHubView
        mod={mod}
        allBeats={allBeats}
        course={course}
        courseId={courseId ?? ''}
        moduleId={moduleId ?? ''}
        navigate={navigate}
        isLoading={isLoading}
      />
    );
  }

  function markCurrentComplete() {
    if (currentBeat) setCompletedIds(prev => new Set([...prev, currentBeat.id]));
  }

  function goNext() {
    if (currentIndex < beats.length - 1) {
      markCurrentComplete();
      setDirection(1);
      setCurrentIndex(i => i + 1);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(i => i - 1);
    }
  }

  function jumpTo(idx: number) {
    setDirection(idx > currentIndex ? 1 : -1);
    setCurrentIndex(idx);
    setSidebarOpen(false);
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <div className="h-14 border-b border-border flex items-center px-4 gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden lg:flex flex-col w-64 border-r border-border p-3 gap-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
          <div className="flex-1 p-8 max-w-3xl">
            <Skeleton className="h-8 w-48 mb-6" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!mod) return null;

  const isAllDone = completedCount === beats.length && beats.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-14 border-b border-border flex-shrink-0 bg-card/95 backdrop-blur z-30">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => navigate(`/courses/${courseId}/modules/${moduleId}`)}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline truncate max-w-[140px]">{mod?.title ?? 'Module'}</span>
        </Button>
        <span className="text-muted-foreground/40 hidden sm:inline">/</span>
        <h1 className="font-semibold text-sm truncate flex-1 hidden sm:block">{mod.title}</h1>
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <div className="hidden sm:flex items-center gap-2">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{mod.estimatedMinutes}min</span>
          </div>
          <Progress value={pct} className="w-20 h-1.5 hidden sm:block" />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {completedCount}/{beats.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(o => !o)}
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── SIDEBAR / TOC ─────────────────────────────────────────────────── */}
        <aside className={cn(
          'w-64 border-r border-border flex flex-col shrink-0 bg-card overflow-hidden',
          'fixed top-14 bottom-0 left-0 z-50 transition-transform duration-200',
          'lg:relative lg:top-auto lg:bottom-auto lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <div className="px-4 py-3 border-b border-border shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Course Content
            </p>
            <div className="flex items-center gap-2">
              <Progress value={pct} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedCount}/{beats.length}
              </span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2">
            {beats.map((beat, idx) => {
              const meta = getBeatMeta(beat);
              const Icon = meta.icon;
              const isActive = idx === currentIndex;
              const isDone = completedIds.has(beat.id);

              return (
                <button
                  key={beat.id}
                  type="button"
                  onClick={() => jumpTo(idx)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors mb-0.5',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/50 text-foreground',
                  )}
                >
                  <Icon className={cn(
                    'h-4 w-4 mt-0.5 shrink-0',
                    isActive ? 'text-primary' : meta.accent,
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                      {meta.label}
                    </div>
                    <div className={cn('text-xs font-medium leading-snug', isActive && 'text-primary')}>
                      {beat.title}
                    </div>
                  </div>
                  {isDone && (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
        <main ref={mainRef} className={cn(
          'flex-1 overflow-y-auto',
          isSlides && 'bg-slate-950 text-white',
        )}>

          {/* Video lesson: prominent player before beat content */}
          {mode === 'video' && (
            <div className="px-6 pt-6 pb-2">
              {allBeats.some(b => b.videoUrl) ? (
                <div className="aspect-video rounded-xl overflow-hidden bg-black shadow-lg border border-border">
                  <video
                    src={allBeats.find(b => b.videoUrl)!.videoUrl!}
                    controls
                    className="w-full h-full"
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/20">
                  <div className="text-center text-muted-foreground">
                    <Play className="h-12 w-12 mx-auto mb-3 opacity-25" />
                    <p className="text-sm font-medium">Video content coming soon</p>
                    <p className="text-xs mt-1 opacity-60">Upload a video in the Studio editor</p>
                  </div>
                </div>
              )}
              {beats.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 mb-1 uppercase tracking-wider font-semibold">
                  Supplementary Notes
                </p>
              )}
            </div>
          )}

          {/* Quiz: empty state if no quiz beats */}
          {mode === 'quiz' && beats.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <HelpCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">No quiz questions added yet.</p>
              <p className="text-xs opacity-60">Add "Check for Understanding" beats in the Studio editor.</p>
            </div>
          )}

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentBeat?.id ?? currentIndex}
              custom={direction}
              variants={{
                enter:  (d: number) => ({ opacity: 0, x: d > 0 ?  48 : -48 }),
                center: { opacity: 1, x: 0 },
                exit:   (d: number) => ({ opacity: 0, x: d > 0 ? -48 :  48 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.26, ease: 'easeInOut' }}
              className={isSlides ? 'min-h-[60vh] flex flex-col justify-center' : undefined}
            >
              {currentBeat ? (
                <BeatRenderer beat={currentBeat} />
              ) : mode !== 'quiz' ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  No content available for this module yet.
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* Module complete banner */}
          {isAllDone && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-8 mb-10 p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center"
            >
              <Trophy className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                Module Complete!
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                You've worked through all {beats.length} pages in this module.
              </p>
              <Button variant="outline" onClick={() => navigate(`/courses/${courseId}`)}>
                Back to Course
              </Button>
            </motion.div>
          )}

          {/* Spacer for bottom nav */}
          <div className="h-20" />
        </main>
      </div>

      {/* ── BOTTOM NAV ──────────────────────────────────────────────────────── */}
      <footer className="flex items-center justify-between px-6 py-3 border-t border-border shrink-0 bg-card/95 backdrop-blur z-30">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>

        <span className="text-xs text-muted-foreground tabular-nums">
          {currentIndex + 1} of {beats.length}
        </span>

        <div className="flex items-center gap-2">
          {currentBeat && !completedIds.has(currentBeat.id) && currentIndex === beats.length - 1 && (
            <Button size="sm" variant="outline" onClick={markCurrentComplete} className="gap-1.5">
              <CheckCircle className="h-4 w-4" /> Mark Complete
            </Button>
          )}
          <Button
            size="sm"
            onClick={goNext}
            disabled={currentIndex === beats.length - 1}
            className="gap-1.5"
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

// ─── Module Hub ───────────────────────────────────────────────────────────────

interface ActivityDef {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
  border: string;
  available: boolean;
  loading?: boolean;
  onClick: () => void;
}

function ActivityCard({ act }: { act: ActivityDef }) {
  const Icon = act.icon;
  return (
    <button
      type="button"
      disabled={!act.available || act.loading}
      onClick={act.onClick}
      className={cn(
        'relative text-left w-full rounded-2xl border p-5 transition-all duration-200 group',
        act.border,
        act.available && !act.loading
          ? cn('hover:shadow-lg hover:-translate-y-0.5 cursor-pointer bg-gradient-to-br', act.gradient)
          : 'opacity-50 cursor-not-allowed bg-muted/20',
      )}
    >
      {/* Icon */}
      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center mb-4', act.iconBg)}>
        {act.loading
          ? <div className="h-5 w-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
          : <Icon className={cn('h-6 w-6', act.iconColor)} />}
      </div>

      <div className="font-semibold text-sm mb-0.5 text-foreground">{act.title}</div>
      <div className="text-xs text-muted-foreground mb-3">{act.subtitle}</div>
      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">{act.description}</p>

      {/* Top-right indicator */}
      {!act.available && (
        <div className="absolute top-3 right-3">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Soon</Badge>
        </div>
      )}
      {act.available && !act.loading && (
        <ChevronRight className="absolute top-4 right-4 h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      )}
    </button>
  );
}

function ModuleHubView({
  mod, allBeats, course, courseId, moduleId, navigate, isLoading,
}: {
  mod: ModuleDetail | undefined;
  allBeats: Beat[];
  course: CourseSummary | undefined;
  courseId: string;
  moduleId: string;
  navigate: (to: string) => void;
  isLoading: boolean;
}) {
  const hasVideo        = allBeats.some(b => b.type === 'video' || !!b.videoUrl);
  const hasReading      = allBeats.some(b => ['title_card','points','scenario','compare','close'].includes(b.type));
  const hasQuiz         = allBeats.some(b => !!b.visualData?.quiz);
  const hasInteractive  = allBeats.some(b => !!b.visualData?.interactive);
  const hasContent      = allBeats.length > 0;
  const interactiveCount = allBeats.filter(b => !!b.visualData?.interactive).length;
  const quizCount  = allBeats.filter(b => !!b.visualData?.quiz).length;
  const readCount  = allBeats.filter(b => !b.visualData?.quiz).length;

  const startSession = useMutation({
    mutationFn: () => apiFetch<{ id: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ moduleId }),
    }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });

  const activities: ActivityDef[] = [
    {
      id: 'video',
      icon: PlayCircle,
      title: 'Video & Animation',
      subtitle: hasVideo ? 'Watch' : 'No video yet',
      description: 'Learn through visual content and animations.',
      gradient: 'from-blue-500/10 to-blue-600/5',
      iconBg: 'bg-blue-100 dark:bg-blue-900/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      border: 'border-blue-200 dark:border-blue-800',
      available: hasVideo,
      onClick: () => navigate(`/courses/${courseId}/modules/${moduleId}?mode=video`),
    },
    {
      id: 'reading',
      icon: BookOpen,
      title: 'Reading',
      subtitle: hasReading ? `${readCount} page${readCount !== 1 ? 's' : ''}` : 'No content yet',
      description: 'Work through structured pages at your own pace.',
      gradient: 'from-emerald-500/10 to-emerald-600/5',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
      available: hasReading,
      onClick: () => navigate(`/courses/${courseId}/modules/${moduleId}?mode=reading`),
    },
    {
      id: 'interactive',
      icon: Zap,
      title: 'Interactive',
      subtitle: hasInteractive ? `${interactiveCount} activit${interactiveCount !== 1 ? 'ies' : 'y'}` : 'No activities yet',
      description: 'Drag-to-order, match pairs, and fill-in-the-blank exercises.',
      gradient: 'from-violet-500/10 to-violet-600/5',
      iconBg: 'bg-violet-100 dark:bg-violet-900/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
      border: 'border-violet-200 dark:border-violet-800',
      available: hasInteractive,
      onClick: () => navigate(`/courses/${courseId}/modules/${moduleId}?mode=interactive`),
    },
    {
      id: 'quiz',
      icon: HelpCircle,
      title: 'Check for Understanding',
      subtitle: hasQuiz ? `${quizCount} question${quizCount !== 1 ? 's' : ''}` : 'No questions yet',
      description: 'Quick knowledge checks to test your recall.',
      gradient: 'from-amber-500/10 to-amber-600/5',
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
      available: hasQuiz,
      onClick: () => navigate(`/courses/${courseId}/modules/${moduleId}?mode=quiz`),
    },
    {
      id: 'test',
      icon: GraduationCap,
      title: 'Final Test',
      subtitle: hasContent ? 'Socratic AI dialogue' : 'No content yet',
      description: 'Demonstrate mastery through guided AI questioning.',
      gradient: 'from-rose-500/10 to-rose-600/5',
      iconBg: 'bg-rose-100 dark:bg-rose-900/40',
      iconColor: 'text-rose-600 dark:text-rose-400',
      border: 'border-rose-200 dark:border-rose-800',
      available: hasContent,
      loading: startSession.isPending,
      onClick: () => startSession.mutate(),
    },
    {
      id: 'assignment',
      icon: FileText,
      title: 'Assignment',
      subtitle: 'Submit your work',
      description: 'Apply your learning with a practical task.',
      gradient: 'from-slate-500/10 to-slate-600/5',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-700',
      available: true,
      onClick: () => navigate(`/courses/${courseId}?tab=assignments`),
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-[68px] border-b border-border" />
        <div className="max-w-4xl mx-auto px-6 py-10">
          <Skeleton className="h-5 w-32 mb-3" />
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96 mb-10" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-44 rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky top bar */}
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-[68px] flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground shrink-0"
            onClick={() => navigate(`/courses/${courseId}`)}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{course?.title ?? 'Course'}</span>
          </Button>
          <span className="text-muted-foreground/30 hidden sm:inline">/</span>
          <h1 className="font-semibold text-sm flex-1 truncate hidden sm:block">{mod?.title}</h1>
          {mod?.estimatedMinutes && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto shrink-0">
              <Clock className="h-3.5 w-3.5" />
              {mod.estimatedMinutes} min total
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {course?.title}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">{mod?.title}</h2>
          {mod?.description && (
            <p className="text-muted-foreground max-w-xl leading-relaxed">{mod.description}</p>
          )}
        </div>
      </div>

      {/* Activity grid */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm font-medium text-muted-foreground mb-5">
          How would you like to engage with this module?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map((act, i) => (
            <motion.div
              key={act.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.055, duration: 0.3 }}
            >
              <ActivityCard act={act} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
