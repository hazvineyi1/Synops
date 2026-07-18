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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGetMe } from '@workspace/api-client-react';
import { ObjectivesEditor } from '@/components/ObjectivesEditor';
import { activitiesApi } from '@/lib/activitiesApi';
import {
  ChevronLeft, ChevronRight, CheckCircle, BookOpen, List,
  MessageSquare, LayoutGrid, BarChart2, Play, HelpCircle,
  X, Menu, Trophy, Clock, PlayCircle, GraduationCap, FileText, Zap,
  Users, Layers, Target, Compass, Info, Save, Settings, Sparkles, Link2,
  Pause, Square, Headphones,
} from 'lucide-react';
import { useReadAloud } from '@/lib/speech';

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
  /** Authored word-for-word transcript. Absent means we only have narration/notes. */
  transcript?: string | null;
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
  objectives?: string[];
  modality?: 'async' | 'sync' | 'hybrid';
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
                Section complete
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                You've worked through all {beats.length} pages. Continue to the next learning experience.
              </p>
              <Button onClick={() => navigate(`/courses/${courseId}/modules/${moduleId}`)}>
                Continue <ChevronRight className="h-4 w-4 ml-1" />
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

interface HubModule { id: string; courseId: string; title: string; order: number; status: string }
interface HubAssignment {
  id: string; title: string; description?: string; moduleId?: string | null;
  dueDate?: string | null; pointsPossible?: number | string; submissionType?: string;
  /** Has THIS learner submitted? Server-computed for the caller only. */
  mySubmitted?: boolean;
}
/** `iHaveReplied` is caller-scoped; replyCount is a global total and cannot stand in for it. */
interface HubDiscussion { id: string; title: string; replyCount?: number; iHaveReplied?: boolean }
interface HubCourse { id: string; title: string; description?: string }

type HubTab = 'overview' | 'structure' | 'video' | 'readings' | 'complete' | 'participate' | 'assignments' | 'workshop';

const READING_TYPES = ['title_card', 'points', 'scenario', 'compare', 'close'];

// Delivery modality shown as a badge so a learner always knows whether a module is
// self-paced, a live class, or a mix.
const MODALITY_META: Record<string, { label: string; sub: string; icon: React.ElementType; cls: string }> = {
  async:  { label: 'Self-paced', sub: 'Asynchronous',      icon: Clock,  cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-300/50' },
  sync:   { label: 'Live class', sub: 'Synchronous',       icon: Users,  cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-300/50' },
  hybrid: { label: 'Hybrid',     sub: 'Live + self-paced', icon: Layers, cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-300/50' },
};

// Per-tab colour identity. Each tab has its own coloured rectangular border; the active
// tab fills with its colour so it is obviously the section being worked in.
const TAB_COLOR: Record<HubTab, { border: string; text: string; activeBg: string }> = {
  overview:    { border: 'border-indigo-300 dark:border-indigo-800',   text: 'text-indigo-700 dark:text-indigo-300',   activeBg: 'bg-indigo-600' },
  structure:   { border: 'border-slate-300 dark:border-slate-700',     text: 'text-slate-700 dark:text-slate-300',     activeBg: 'bg-slate-600' },
  video:       { border: 'border-blue-300 dark:border-blue-800',       text: 'text-blue-700 dark:text-blue-300',       activeBg: 'bg-blue-600' },
  readings:    { border: 'border-emerald-300 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', activeBg: 'bg-emerald-600' },
  complete:    { border: 'border-violet-300 dark:border-violet-800',   text: 'text-violet-700 dark:text-violet-300',   activeBg: 'bg-violet-600' },
  participate: { border: 'border-sky-300 dark:border-sky-800',         text: 'text-sky-700 dark:text-sky-300',         activeBg: 'bg-sky-600' },
  assignments: { border: 'border-amber-300 dark:border-amber-800',     text: 'text-amber-700 dark:text-amber-300',     activeBg: 'bg-amber-600' },
  workshop:    { border: 'border-rose-300 dark:border-rose-800',       text: 'text-rose-700 dark:text-rose-300',       activeBg: 'bg-rose-600' },
};

function EmptyState({ icon: Icon, title, note }: { icon: React.ElementType; title: string; note?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/10 py-14 px-6 text-center">
      <Icon className="h-9 w-9 mx-auto mb-3 text-muted-foreground/40" />
      <p className="font-medium text-foreground">{title}</p>
      {note && <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">{note}</p>}
    </div>
  );
}

function Instruction({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-primary/5 border border-primary/15 px-4 py-3 text-sm text-foreground/80 leading-relaxed">
      <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-serif font-semibold text-foreground">{title}</h3>
      {sub && <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  );
}

// Instructor-only authoring panel for a module's learning objectives + delivery modality.
// Self-contained draft + dirty tracking; keyed by the saved values so it resets on save.
function ModuleSettingsEditor({ initialObjectives, initialModality, saving, onSave }: {
  initialObjectives: string[];
  initialModality: 'async' | 'sync' | 'hybrid';
  saving: boolean;
  onSave: (patch: { objectives: string[]; modality: 'async' | 'sync' | 'hybrid' }) => void;
}) {
  const [obj, setObj] = useState<string[]>(initialObjectives.length ? initialObjectives : ['']);
  const [modality, setModality] = useState<'async' | 'sync' | 'hybrid'>(initialModality);
  const clean = obj.map((s) => s.trim()).filter(Boolean);
  const dirty = JSON.stringify(clean) !== JSON.stringify(initialObjectives) || modality !== initialModality;

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="font-serif font-semibold">Module settings</h3>
        <Badge variant="outline" className="text-[10px] ml-1">Instructor</Badge>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Learning objectives</p>
        <ObjectivesEditor value={obj} onChange={setObj} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Delivery modality</p>
        <div className="max-w-xs">
          <Select value={modality} onValueChange={(v) => setModality(v as 'async' | 'sync' | 'hybrid')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="async">Self-paced (asynchronous)</SelectItem>
              <SelectItem value="sync">Live class (synchronous)</SelectItem>
              <SelectItem value="hybrid">Hybrid (live + self-paced)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!dirty || saving} onClick={() => onSave({ objectives: clean, modality })}>
          <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save module settings'}
        </Button>
      </div>
    </div>
  );
}

interface ModuleReadingRow {
  id: string; moduleId: string; title: string; kind: string;
  sourceUrl: string | null; filename: string | null; chars: number;
  hasContent: boolean; order: number; createdAt: string;
}

const READING_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.tsv,.rtf,.html,.htm,.pptx,.xlsx,.xls";

/** data:...;base64,XXXX -> XXXX (mirrors the Coach materials uploader). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * The mastery gate.
 *
 * Locked until everything the learner can finish unaided is finished. When it is locked it
 * always says exactly what is outstanding and links straight to it -- a disabled button with
 * no explanation is the thing that makes people email support.
 *
 * `waiting` items are listed but never lock the button: they depend on someone else (a
 * workshop that has not run yet, attendance a facilitator has not recorded) and holding a
 * credential hostage to another person's admin is not a gate, it is a trap.
 */
function MasteryCard({ unlocked, blocking, waiting, pending, onStart, onGo }: {
  unlocked: boolean;
  blocking: { id: HubTab; label: string }[];
  waiting: { id: HubTab; label: string }[];
  pending: boolean;
  onStart: () => void;
  onGo: (t: HubTab) => void;
}) {
  return (
    <div className={cn('rounded-xl border p-4',
      unlocked ? 'border-rose-200 dark:border-rose-800 bg-rose-500/5' : 'border-border bg-muted/30')}>
      <div className="flex items-center gap-3 mb-3">
        <span className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0',
          unlocked ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600' : 'bg-muted text-muted-foreground')}>
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm">Demonstrate mastery</div>
          <div className="text-xs text-muted-foreground">
            {unlocked
              ? 'A guided Socratic session. Earns your credential when you reach mastery.'
              : 'Available once you have worked through the sections below.'}
          </div>
        </div>
      </div>

      {!unlocked && blocking.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {blocking.map((b) => (
            <li key={b.id}>
              <button onClick={() => onGo(b.id)}
                className="w-full flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors">
                <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                <span className="flex-1 min-w-0 truncate">Still to do: {b.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {waiting.length > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">
          Also outstanding, but not holding you up:{' '}
          {waiting.map((w) => w.label).join(', ')}.
        </p>
      )}

      <Button className="w-full" disabled={!unlocked || pending} onClick={onStart}>
        {pending ? 'Starting...' : unlocked ? 'Start session' : 'Locked until the above is done'}
      </Button>
    </div>
  );
}

/**
 * Shown when a section has nothing in it.
 *
 * An empty section is a dead end unless it says where to go instead, so this always ends
 * with the actual next step: the next unfinished deliverable, or mastery, or the next
 * module, or the course being finished.
 */
function NothingHere({ icon: Icon, title, next }: {
  icon: React.ElementType;
  title: string;
  next: { label: string; onClick: () => void; note: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 mb-5">{next.note}</p>
      <Button onClick={next.onClick} className="gap-1.5">
        {next.label} <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface WorkshopRow {
  id: string;
  title: string;
  sessionType: string;
  scheduledAt: string;
  durationMinutes: number;
  location?: string | null;
  joinUrl?: string | null;
  notes?: string | null;
  myAttendance?: { status: string; coachingHours?: string | null } | null;
}

const ATTENDANCE_LABEL: Record<string, { label: string; cls: string }> = {
  present: { label: 'You attended', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  late:    { label: 'Marked late', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  excused: { label: 'Excused', cls: 'bg-sky-500/10 text-sky-600 border-sky-500/30' },
  absent:  { label: 'Marked absent', cls: 'bg-rose-500/10 text-rose-600 border-rose-500/30' },
};

/**
 * Live workshops for this module.
 *
 * Reads the EXISTING delivery_sessions store (the same one behind Sessions and My sessions
 * and the funder coaching-hour totals) filtered to this module -- not a parallel workshop
 * table, so attendance recorded here still counts everywhere it already counted.
 */
function WorkshopSection({ moduleId, isInstructor, next }: {
  moduleId: string;
  isInstructor: boolean;
  next: { label: string; onClick: () => void; note: string };
}) {
  const qc = useQueryClient();
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['module-workshops', moduleId],
    queryFn: () => apiFetch<WorkshopRow[]>(`/modules/${moduleId}/delivery-sessions`),
    enabled: !!moduleId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '', sessionType: 'workshop', scheduledAt: '', durationMinutes: 60, location: '', joinUrl: '',
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiFetch(`/modules/${moduleId}/delivery-sessions`, {
      method: 'POST',
      body: JSON.stringify({
        title: form.title,
        sessionType: form.sessionType,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: Number(form.durationMinutes) || 60,
        location: form.location || null,
        joinUrl: form.joinUrl || null,
      }),
    }),
    onSuccess: () => {
      setOpen(false); setError(null);
      setForm({ title: '', sessionType: 'workshop', scheduledAt: '', durationMinutes: 60, location: '', joinUrl: '' });
      qc.invalidateQueries({ queryKey: ['module-workshops', moduleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not schedule that workshop.'),
  });

  const now = Date.now();
  const list = sessions ?? [];

  return (
    <div className="space-y-4">
      <SectionHead title="Workshop" sub="Live, facilitated sessions for this module." />

      {isLoading && <Skeleton className="h-24" />}

      {!isLoading && list.length === 0 && (
        isInstructor
          ? <EmptyState icon={Users} title="No workshop scheduled for this module"
              note="Schedule one below and it will appear here and on your learners' calendars." />
          : <NothingHere icon={Users} title="No workshop scheduled for this module" next={next} />
      )}

      {list.map((s) => {
        const when = new Date(s.scheduledAt);
        const past = when.getTime() + s.durationMinutes * 60_000 < now;
        const att = s.myAttendance ? ATTENDANCE_LABEL[s.myAttendance.status] : null;
        return (
          <div key={s.id} className={cn('rounded-2xl border bg-card p-5 space-y-3', past ? 'border-border opacity-80' : 'border-rose-200 dark:border-rose-900')}>
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{s.title}</div>
                <div className="text-sm text-muted-foreground capitalize">
                  {s.sessionType.replace(/_/g, ' ')} · {s.durationMinutes} min
                  {past ? ' · finished' : ''}
                </div>
              </div>
              {att && (
                <Badge variant="outline" className={cn('shrink-0 text-[11px]', att.cls)}>{att.label}</Badge>
              )}
            </div>

            <div className="text-sm">
              <span className="font-medium">
                {when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <span className="text-muted-foreground">
                {' '}at {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {s.location && <div className="text-sm text-muted-foreground">Venue: {s.location}</div>}

            {s.joinUrl && !past && (
              <a href={s.joinUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <Link2 className="h-4 w-4" /> Join the session
              </a>
            )}
            {s.notes && <p className="text-sm text-foreground/80 whitespace-pre-line">{s.notes}</p>}
          </div>
        );
      })}

      {isInstructor && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <h3 className="font-serif font-semibold text-sm">Schedule a workshop</h3>
            <Badge variant="outline" className="text-[10px] ml-1">Instructor</Badge>
          </div>

          {!open ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Add a session</Button>
          ) : (
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Session title"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">Date and time</label>
                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Duration (minutes)</label>
                  <input
                    type="number"
                    min={15}
                    value={form.durationMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="max-w-xs">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={form.sessionType} onValueChange={(v) => setForm((f) => ({ ...f, sessionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workshop">Workshop</SelectItem>
                    <SelectItem value="in_person">In person</SelectItem>
                    <SelectItem value="virtual">Virtual</SelectItem>
                    <SelectItem value="mentoring">Mentoring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Venue (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={form.joinUrl}
                onChange={(e) => setForm((f) => ({ ...f, joinUrl: e.target.value }))}
                placeholder="Joining link for a virtual session (optional)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <p className="text-xs text-muted-foreground">
                Attendance is recorded on the Sessions page and counts towards coaching hours.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
                <Button size="sm" disabled={!form.title || !form.scheduledAt || create.isPending} onClick={() => create.mutate()}>
                  <Save className="h-4 w-4 mr-2" /> {create.isPending ? 'Scheduling...' : 'Schedule'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Staff-only transcript editor for a video beat. Transcripts are authored, never generated:
 * a machine paraphrase presented as a transcript is worse than none, because a learner
 * relying on it instead of the audio has no way to know it is approximate.
 */
function TranscriptEditor({ beatId, initial, moduleId }: { beatId: string; initial: string; moduleId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);

  const save = useMutation({
    mutationFn: () => apiFetch(`/beats/${beatId}`, { method: 'PATCH', body: JSON.stringify({ transcript: text }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['module-detail', moduleId] }); setOpen(false); },
  });

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={() => setOpen(true)}>
        <Settings className="h-3.5 w-3.5" /> {initial ? 'Edit transcript' : 'Add transcript'}
        <Badge variant="outline" className="text-[10px] ml-1">Instructor</Badge>
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Video transcript</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Paste the word-for-word transcript of this video."
        className="w-full rounded-lg border border-border bg-background p-3 text-sm leading-relaxed"
      />
      <p className="text-xs text-muted-foreground">
        Paste what the video actually says. Learners who rely on this instead of the audio need it to match.
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => { setText(initial); setOpen(false); }}>Cancel</Button>
        <Button size="sm" disabled={save.isPending || text === initial} onClick={() => save.mutate()}>
          <Save className="h-4 w-4 mr-2" /> {save.isPending ? 'Saving...' : 'Save transcript'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Listen-to-this-reading controls.
 *
 * Uses the browser's own speech engine (no service, no cost, nothing stored). We show the
 * sentence being read rather than highlighting inside the text, because the speech engine
 * needs whitespace-normalised chunks and the reading itself keeps its paragraph breaks.
 */
function ReadAloudBar({ text }: { text: string }) {
  const { start, pause, resume, stop, status, index, chunks, supported } = useReadAloud();

  if (!supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Read-aloud is not available in this browser. Chrome, Edge and Safari support it.
      </p>
    );
  }

  const current = index >= 0 ? chunks[index] : null;
  const pct = chunks.length && index >= 0 ? Math.round(((index + 1) / chunks.length) * 100) : 0;

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Headphones className="h-4 w-4 text-emerald-600 shrink-0" />
        {status === 'idle' ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => start(text)}>
            <Play className="h-3.5 w-3.5" /> Listen
          </Button>
        ) : (
          <>
            {status === 'playing' ? (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={pause}>
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={resume}>
                <Play className="h-3.5 w-3.5" /> Resume
              </Button>
            )}
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={stop}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
            <span className="text-xs text-muted-foreground">{pct}%</span>
          </>
        )}
        {status === 'idle' && (
          <span className="text-xs text-muted-foreground">Have this reading read to you.</span>
        )}
      </div>
      {current && (
        <p className="mt-2 text-xs italic text-emerald-700/90 dark:text-emerald-400/90">{current}</p>
      )}
    </div>
  );
}

/**
 * Uploaded module readings: staff attach a document/link, learners read the parsed text
 * inline or open the link. We store parsed text (no binary storage in this stack), so a
 * document becomes a readable article rather than a download.
 */
function ReadingsSection({ moduleId, isInstructor }: { moduleId: string; isInstructor: boolean }) {
  const qc = useQueryClient();
  const { data: readings } = useQuery({
    queryKey: ['module-readings', moduleId],
    queryFn: () => apiFetch<ModuleReadingRow[]>(`/modules/${moduleId}/readings`),
    enabled: !!moduleId,
  });

  const [readerId, setReaderId] = useState<string | null>(null);
  const { data: reader, isLoading: readerLoading } = useQuery({
    queryKey: ['reading', readerId],
    queryFn: () => apiFetch<ModuleReadingRow & { content: string }>(`/readings/${readerId}`),
    enabled: !!readerId,
  });

  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/modules/${moduleId}/readings`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { setLinkUrl(''); setError(null); qc.invalidateQueries({ queryKey: ['module-readings', moduleId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add that reading.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/readings/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-readings', moduleId] }),
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 15 * 1024 * 1024) { setError('That file is too large (15MB maximum).'); return; }
    setBusy(true);
    try {
      const dataBase64 = await fileToBase64(file);
      await add.mutateAsync({ filename: file.name, dataBase64 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally { setBusy(false); }
  };

  // Inline reader for a parsed document.
  if (readerId) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setReaderId(null)} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" /> Back to readings
        </Button>
        {readerLoading ? <Skeleton className="h-64" /> : (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-serif font-semibold mb-1">{reader?.title}</h3>
            {reader?.sourceUrl && (
              <a href={reader.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                Open the original in a new window
              </a>
            )}
            {reader?.content ? <div className="mt-3"><ReadAloudBar text={reader.content} /></div> : null}
            <p className="mt-4 text-sm leading-relaxed text-foreground/85 whitespace-pre-line">{reader?.content}</p>
            {(reader?.chars ?? 0) >= 200000 && (
              <p className="mt-4 text-xs text-amber-600">This document was long and has been truncated.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(readings ?? []).map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <span className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
            {r.kind === 'link' ? <Link2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{r.title}</div>
            <div className="text-xs text-muted-foreground">
              {r.kind === 'link' ? 'Link' : (r.filename ?? 'Document')}
              {r.hasContent ? ` · ${Math.max(1, Math.round(r.chars / 1500))} min read` : ''}
            </div>
          </div>
          {r.kind === 'link' && r.sourceUrl && (
            <a href={r.sourceUrl} target="_blank" rel="noreferrer"
              className="text-xs font-medium text-primary hover:underline shrink-0">Open</a>
          )}
          {r.hasContent && (
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => setReaderId(r.id)}>Read</Button>
          )}
          {isInstructor && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-500 shrink-0"
              onClick={() => remove.mutate(r.id)} aria-label="Remove reading">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}

      {isInstructor && (
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <span className="font-serif font-semibold text-sm">Add a reading</span>
            <Badge variant="outline" className="text-[10px] ml-1">Instructor</Badge>
          </div>
          <div className="flex gap-2">
            {(['file', 'link'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                className={cn('rounded-full px-3 py-1 text-xs font-medium capitalize',
                  mode === m ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {m === 'file' ? 'Upload document' : 'Paste a link'}
              </button>
            ))}
          </div>
          {mode === 'file' ? (
            <label className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
              <input type="file" accept={READING_ACCEPT} className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])} />
              {busy || add.isPending ? 'Reading the document…' : 'Choose a PDF, Word, PowerPoint, Excel or text file (15MB max)'}
            </label>
          ) : (
            <div className="flex gap-2">
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com/article"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <Button size="sm" disabled={!linkUrl.trim() || add.isPending}
                onClick={() => add.mutate({ url: linkUrl.trim() })}>Add</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Documents are parsed so learners can read them here. Links open in a new window.
          </p>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
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
  const [tab, setTab] = useState<HubTab>('overview');

  // Same query key as WorkshopSection, so React Query serves both from one fetch.
  const { data: moduleWorkshops } = useQuery({
    queryKey: ['module-workshops', moduleId],
    queryFn: () => apiFetch<WorkshopRow[]>(`/modules/${moduleId}/delivery-sessions`),
    enabled: !!moduleId,
  });

  const { data: courseModules } = useQuery({
    queryKey: ['modules', courseId],
    queryFn: () => apiFetch<HubModule[]>(`/courses/${courseId}/modules`),
    enabled: !!courseId,
  });
  const { data: courseFull } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiFetch<HubCourse>(`/courses/${courseId}`),
    enabled: !!courseId,
  });
  const { data: assignments } = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => apiFetch<HubAssignment[]>(`/courses/${courseId}/assignments`),
    enabled: !!courseId,
  });
  const { data: discussions } = useQuery({
    queryKey: ['discussions', courseId],
    queryFn: () => apiFetch<HubDiscussion[]>(`/courses/${courseId}/discussions`),
    enabled: !!courseId,
  });
  // Per-module completion across the course, to drive Next-module / course-complete nav.
  const { data: courseProg } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn: () => apiFetch<{ modules: { moduleId: string; complete: boolean; certified?: boolean; percent: number }[] }>(`/progress/course/${courseId}`),
    enabled: !!courseId,
  });
  // Standalone activities assigned to (homed in) this module -- surfaced in the Complete tab.
  const { data: moduleActivities } = useQuery({
    queryKey: ['module-activities', moduleId],
    queryFn: () => activitiesApi.list({ moduleId }),
    enabled: !!moduleId,
  });
  // Uploaded readings (documents/links) attached to this module. Shares its cache key with
  // ReadingsSection, so this is one request, not two.
  const { data: moduleReadings } = useQuery({
    queryKey: ['module-readings', moduleId],
    queryFn: () => apiFetch<ModuleReadingRow[]>(`/modules/${moduleId}/readings`),
    enabled: !!moduleId,
  });
  // Which beats this learner has actually viewed. The hub never fetched this before, so it
  // could only ever see what EXISTS in the module, never what was done -- which is why the
  // mastery button used to be available immediately.
  const { data: beatProgress } = useQuery({
    queryKey: ['module-progress', moduleId],
    queryFn: () => apiFetch<{ viewedBeatIds: string[] }>(`/progress/module/${moduleId}`),
    enabled: !!moduleId,
  });

  const startSession = useMutation({
    mutationFn: () => apiFetch<{ id: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ moduleId }),
    }),
    onSuccess: (s) => navigate(`/learn/${s.id}`),
  });

  // Instructor authoring: role gate + persist module objectives/modality.
  const { data: me } = useGetMe();
  const isInstructor = ['coach', 'org_admin', 'partner_admin', 'super_admin'].includes(me?.role ?? '');
  const qc = useQueryClient();
  const saveModule = useMutation({
    mutationFn: (patch: { objectives: string[]; modality: 'async' | 'sync' | 'hybrid' }) =>
      apiFetch(`/modules/${moduleId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['module-detail', moduleId] }),
  });

  const videoBeats        = allBeats.filter(b => b.type === 'video' || !!b.videoUrl);
  const readingBeats      = allBeats.filter(b => READING_TYPES.includes(b.type) && !b.visualData?.quiz && !b.visualData?.interactive);
  const interactiveBeats  = allBeats.filter(b => !!b.visualData?.interactive);
  const quizBeats         = allBeats.filter(b => !!b.visualData?.quiz);
  const moduleAssignments = (assignments ?? []).filter(a => a.moduleId === moduleId);
  const activityCount     = moduleActivities?.length ?? 0;
  const practiceCount     = interactiveBeats.length + quizBeats.length + activityCount;
  // Readings = in-module reading beats PLUS uploaded documents/links. Both must count, or
  // a module with only uploaded readings would drop out of the flow and show an empty tab.
  const readingCount      = readingBeats.length + (moduleReadings?.length ?? 0);

  const modality = (mod?.modality ?? 'async') as string;
  const mm = MODALITY_META[modality] ?? MODALITY_META.async;
  // Explicit objectives if the ID set them; otherwise fall back to the module's closing
  // key takeaways so the Overview is never empty when there is real content.
  const objectives = (mod?.objectives && mod.objectives.length > 0)
    ? mod.objectives
    : (allBeats.find(b => b.type === 'close')?.bulletPoints ?? []);

  const open = (mode: string) => navigate(`/courses/${courseId}/modules/${moduleId}?mode=${mode}`);

  const TABS: { id: HubTab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'overview',    label: 'Overview',    icon: Compass },
    { id: 'structure',   label: 'Structure',   icon: List },
    { id: 'video',       label: 'Video',       icon: PlayCircle,    count: videoBeats.length },
    { id: 'readings',    label: 'Readings',    icon: BookOpen,      count: readingCount },
    { id: 'complete',    label: 'Complete',    icon: Zap,           count: practiceCount },
    { id: 'participate', label: 'Participate', icon: MessageSquare, count: discussions?.length ?? 0 },
    { id: 'assignments', label: 'Assignments', icon: FileText,      count: moduleAssignments.length },
    { id: 'workshop',    label: 'Workshop',    icon: Users,         count: moduleWorkshops?.length ?? 0 },
  ];

  // ── What this learner has actually completed ───────────────────────────────
  // Every rule below is backed by a real per-learner record. Where no such record exists
  // we say so rather than guessing -- a gate built on a guess either blocks people who
  // finished or waves through people who did not.
  const viewed = new Set(beatProgress?.viewedBeatIds ?? []);
  const allViewed = (list: Beat[]) => list.length > 0 && list.every((b) => viewed.has(b.id));

  const videoDone    = allViewed(videoBeats);
  // Uploaded documents and links have no per-learner read receipt, so they cannot be part
  // of the gate. A module whose readings are ONLY uploaded files therefore has nothing
  // trackable to satisfy -- without this branch that module would lock mastery forever,
  // because allViewed([]) is false and there would be no beat the learner could ever view.
  const readingsDone = readingBeats.length === 0 ? true : allViewed(readingBeats);
  const practiceDone =
    (interactiveBeats.length + quizBeats.length === 0 || allViewed([...interactiveBeats, ...quizBeats])) &&
    (moduleActivities ?? []).every((a) => !!(a as { mySubmitted?: boolean }).mySubmitted) &&
    practiceCount > 0;
  const assignmentsDone = moduleAssignments.length > 0 && moduleAssignments.every((a) => !!a.mySubmitted);
  const workshopsDone   = (moduleWorkshops?.length ?? 0) > 0
    && (moduleWorkshops ?? []).every((w) => w.myAttendance?.status === 'present' || w.myAttendance?.status === 'late' || w.myAttendance?.status === 'excused');
  const discussionsDone = (discussions?.length ?? 0) > 0 && (discussions ?? []).every((d) => !!d.iHaveReplied);

  /** Per-tab state the rail and the panels both read from. */
  const tabState: Record<HubTab, { has: boolean; done: boolean }> = {
    overview:    { has: true, done: true },
    structure:   { has: true, done: true },
    video:       { has: videoBeats.length > 0,             done: videoDone },
    readings:    { has: readingCount > 0,                  done: readingsDone },
    complete:    { has: practiceCount > 0,                 done: practiceDone },
    participate: { has: (discussions?.length ?? 0) > 0,    done: discussionsDone },
    assignments: { has: moduleAssignments.length > 0,      done: assignmentsDone },
    workshop:    { has: (moduleWorkshops?.length ?? 0) > 0, done: workshopsDone },
  };

  // ── Guided linear progression ──────────────────────────────────────────────
  // Every deliverable that exists, in the order the module should be worked through.
  const DELIVERABLES: { id: HubTab; label: string }[] = [
    { id: 'video', label: 'Video' },
    { id: 'readings', label: 'Readings' },
    { id: 'complete', label: 'Activities' },
    { id: 'participate', label: 'Discussion' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'workshop', label: 'Workshop' },
  ];
  const flow = DELIVERABLES.filter((d) => tabState[d.id].has);

  /**
   * What still stands between the learner and mastery.
   *
   * Split deliberately. `blocking` are things the learner can finish on their own, so it is
   * fair to hold mastery back until they are done. `waiting` are things they cannot complete
   * unaided -- a workshop that has not happened yet, or attendance a facilitator has not
   * recorded -- so those are shown but never used to lock the button. Locking on those would
   * strand a learner behind someone else's admin.
   *
   * Discussions are course-wide, not module-scoped, so a thread belonging to another module
   * must not block this one. Shown, never blocking, until discussions carry a moduleId.
   */
  const blocking = flow.filter((d) =>
    (d.id === 'video' || d.id === 'readings' || d.id === 'complete' || d.id === 'assignments')
    && !tabState[d.id].done);
  const waiting = flow.filter((d) =>
    (d.id === 'workshop' || d.id === 'participate') && !tabState[d.id].done);
  const masteryUnlocked = allBeats.length > 0 && blocking.length === 0;

  // Where the course sits: this module, the next module, and completion state.
  const orderedMods = (courseModules ?? []).slice().sort((a, b) => a.order - b.order);
  const curModIdx = orderedMods.findIndex((m) => m.id === moduleId);
  const nextMod = curModIdx >= 0 ? orderedMods[curModIdx + 1] : undefined;
  const progByMod = new Map((courseProg?.modules ?? []).map((m) => [m.moduleId, m] as const));
  // A module counts as "done" when its content is complete OR mastery was demonstrated.
  const modDone = (id: string) => { const p = progByMod.get(id); return !!(p?.complete || p?.certified); };
  const moduleComplete = modDone(moduleId);
  const allModulesComplete = orderedMods.length > 0 && orderedMods.every((m) => modDone(m.id));

  /**
   * The next thing to actually do: the first deliverable that exists and is not finished,
   * skipping the one being viewed. Driven by completion, not by which tab happens to be
   * open -- the old version prompted "Demonstrate mastery" simply because you had clicked
   * a tab outside the flow, whether or not you had done anything.
   */
  const nextUndone = flow.find((d) => d.id !== tab && !tabState[d.id].done)
    ?? flow.find((d) => !tabState[d.id].done);

  let continueLabel = 'Demonstrate mastery';
  let continueAction: () => void = () => startSession.mutate();
  let continueIsMastery = true;
  if (nextUndone) {
    continueIsMastery = false;
    continueLabel = `${tab === 'overview' ? 'Start' : 'Next'}: ${nextUndone.label}`;
    continueAction = () => setTab(nextUndone.id);
  }

  /**
   * The forward step an empty section should point at, so a section with nothing in it
   * still tells the learner where to go rather than leaving them at a dead end.
   */
  const nextStep: { label: string; onClick: () => void; note: string } =
    nextUndone
      ? {
          label: `Go to ${nextUndone.label}`,
          onClick: () => setTab(nextUndone.id),
          note: `There is nothing to do in this section. Next up in this module: ${nextUndone.label}.`,
        }
      : masteryUnlocked && !moduleComplete
        ? {
            label: 'Demonstrate mastery',
            onClick: () => startSession.mutate(),
            note: 'Nothing to do here, and you have worked through everything else in this module.',
          }
        : nextMod
          ? {
              label: 'Next module',
              onClick: () => navigate(`/courses/${courseId}/modules/${nextMod.id}`),
              note: `Nothing to do in this section. Up next: ${nextMod.title}.`,
            }
          : allModulesComplete
            ? {
                label: 'Back to the course',
                onClick: () => navigate(`/courses/${courseId}`),
                note: 'Nothing to do here, and you have completed every module on this course.',
              }
            : {
                label: 'Back to the course',
                onClick: () => navigate(`/courses/${courseId}`),
                note: 'There is nothing in this section for this module.',
              };

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
            <span className="hidden sm:inline truncate max-w-[160px]">{course?.title ?? courseFull?.title ?? 'Course'}</span>
          </Button>
          <span className="text-muted-foreground/30 hidden sm:inline">/</span>
          <h1 className="font-semibold text-sm flex-1 truncate hidden sm:block">{mod?.title}</h1>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ml-auto shrink-0', mm.cls)}>
            <mm.icon className="h-3.5 w-3.5" /> {mm.label}
          </span>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {course?.title ?? courseFull?.title}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{mod?.title}</h2>
          {mod?.description && (
            <p className="text-muted-foreground max-w-2xl leading-relaxed">{mod.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {mod?.estimatedMinutes ?? 0} min</span>
            <span className="inline-flex items-center gap-1.5"><mm.icon className="h-3.5 w-3.5" /> {mm.label} · {mm.sub}</span>
          </div>
        </div>
      </div>

      {/* Two-column body: progression rail on the left, the selected section on the right.
          The rail is ordered the way the module should be worked through, so its top-to-
          bottom order is itself the instruction. On mobile it collapses to a scrolling row
          above the content, because a fixed side rail on a phone eats the reading width. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-6 lg:gap-8">

        <nav aria-label="Module sections"
          className="lg:w-60 lg:shrink-0 lg:sticky lg:top-[84px] lg:self-start">
          <ol className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
            {TABS.map((t) => {
              const active = tab === t.id;
              const c = TAB_COLOR[t.id];
              const st = tabState[t.id];
              const isDeliverable = t.id !== 'overview' && t.id !== 'structure';
              // Empty sections stay in the rail so the shape of the module is honest, but
              // they are muted and carry no count. They remain clickable: opening one is
              // how the learner is told where to go instead.
              const muted = isDeliverable && !st.has;
              const done = isDeliverable && st.has && st.done;
              return (
                <li key={t.id} className="shrink-0 lg:shrink">
                  <button
                    onClick={() => setTab(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-md border-2 px-3 py-2.5 text-sm font-medium transition-colors text-left',
                      active
                        ? cn(c.activeBg, 'border-transparent text-white shadow-sm')
                        : muted
                          ? 'border-dashed border-border bg-transparent text-muted-foreground/70 hover:bg-muted/30'
                          : cn(c.border, c.text, 'bg-card hover:bg-muted/40'),
                    )}
                  >
                    <t.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{t.label}</span>
                    {done && (
                      <CheckCircle className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-emerald-500')} />
                    )}
                    {!done && typeof t.count === 'number' && t.count > 0 && (
                      <span className={cn('rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                        active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground')}>{t.count}</span>
                    )}
                  </button>
                </li>
              );
            })}

            {/* Mastery is the end of the rail, and only becomes available once everything
                the learner can finish on their own is finished. */}
            <li className="shrink-0 lg:shrink lg:pt-2 lg:mt-2 lg:border-t lg:border-border">
              <button
                onClick={() => masteryUnlocked && startSession.mutate()}
                disabled={!masteryUnlocked || startSession.isPending}
                title={masteryUnlocked ? undefined : 'Finish the sections above first'}
                className={cn(
                  'w-full flex items-center gap-2.5 rounded-md border-2 px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  masteryUnlocked
                    ? 'border-transparent bg-rose-600 text-white shadow-sm hover:bg-rose-700'
                    : 'border-dashed border-border bg-transparent text-muted-foreground/70 cursor-not-allowed',
                )}
              >
                <GraduationCap className="h-4 w-4 shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  {startSession.isPending ? 'Starting...' : 'Demonstrate mastery'}
                </span>
              </button>
            </li>
          </ol>
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {isInstructor && (
              <ModuleSettingsEditor
                key={JSON.stringify([mod?.objectives ?? [], mod?.modality ?? 'async'])}
                initialObjectives={mod?.objectives ?? []}
                initialModality={(mod?.modality ?? 'async') as 'async' | 'sync' | 'hybrid'}
                saving={saveModule.isPending}
                onSave={(patch) => saveModule.mutate(patch)}
              />
            )}
            <div>
              <SectionHead title="What you'll be able to do" sub="The learning objectives for this module." />
              {objectives.length > 0 ? (
                <ul className="space-y-2.5">
                  {objectives.map((o, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                      <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-sm leading-relaxed">{o}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Target} title="Learning objectives haven't been added yet"
                  note="Your instructional designer can add clear, measurable objectives for this module in the Studio editor." />
              )}
            </div>

            <div>
              <SectionHead title="What's inside" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Video',       n: videoBeats.length,   icon: PlayCircle, go: () => setTab('video') },
                  { label: 'Readings',    n: readingCount, icon: BookOpen,   go: () => setTab('readings') },
                  { label: 'Activities',  n: practiceCount,       icon: Zap,        go: () => setTab('complete') },
                  { label: 'Assignments', n: moduleAssignments.length, icon: FileText, go: () => setTab('assignments') },
                ].map((s) => (
                  <button key={s.label} onClick={s.go}
                    className="rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition-shadow">
                    <s.icon className="h-5 w-5 text-muted-foreground mb-2" />
                    <div className="text-xl font-serif font-bold leading-none">{s.n}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* One forward action. Mastery is deliberately NOT offered here as a parallel
                choice: it is the end of the module, not an alternative to doing it, so it
                only appears once the work is actually done. */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <Button className="flex-1 h-12" onClick={continueAction}
                disabled={continueIsMastery && (!masteryUnlocked || startSession.isPending)}>
                {continueIsMastery
                  ? <><GraduationCap className="h-4 w-4 mr-2" /> Demonstrate mastery</>
                  : <><Play className="h-4 w-4 mr-2" /> {continueLabel}</>}
              </Button>
            </div>
          </div>
        )}

        {/* STRUCTURE */}
        {tab === 'structure' && (
          <div className="space-y-8">
            <div>
              <SectionHead title="Course structure" sub="Where this module sits, and how to move through the course." />
              <div className="space-y-1.5">
                {(courseModules ?? []).slice().sort((a, b) => a.order - b.order).map((m, i) => {
                  const isCurrent = m.id === moduleId;
                  return (
                    <button key={m.id} onClick={() => navigate(`/courses/${courseId}/modules/${m.id}`)}
                      className={cn('w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors',
                        isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40')}>
                      <span className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                        isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex-1 text-sm font-medium truncate">{m.title}</span>
                      {isCurrent
                        ? <Badge variant="outline" className="text-[10px] shrink-0">You are here</Badge>
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    </button>
                  );
                })}
                {(!courseModules || courseModules.length === 0) && (
                  <EmptyState icon={List} title="No module list available yet" />
                )}
              </div>
            </div>

            <div>
              <SectionHead title="What's expected of you" sub="Participation, integrity, and support for this course." />
              <div className="space-y-2.5 text-sm text-foreground/80">
                <div className="rounded-xl border border-border bg-card p-4 leading-relaxed">
                  <p className="font-medium text-foreground mb-1">Participation</p>
                  Engage with each section, complete the activities, and demonstrate mastery when you're ready. Your progress saves as you go.
                </div>
                <div className="rounded-xl border border-border bg-card p-4 leading-relaxed">
                  <p className="font-medium text-foreground mb-1">Academic integrity</p>
                  Submit your own work. Coaching and discussion are encouraged; copying others' answers is not.
                </div>
                <div className="rounded-xl border border-border bg-card p-4 leading-relaxed">
                  <p className="font-medium text-foreground mb-1">Support &amp; accessibility</p>
                  Captions, transcripts, and read-aloud options are provided where available. If you need an accommodation, contact your facilitator.
                </div>
              </div>
            </div>

            {courseFull?.description && (
              <div>
                <SectionHead title="Syllabus" />
                <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground leading-relaxed">
                  {courseFull.description}
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIDEO */}
        {tab === 'video' && (
          videoBeats.length > 0 ? (
            <div className="space-y-8">
              {videoBeats.map((b) => {
                // Only an authored transcript may be called a transcript. Narration plus
                // bullet points is the script the beat was built from -- useful to read
                // along with, but not a record of what the video says, so it is labelled
                // as notes. Claiming otherwise is an accessibility problem, not a wording one.
                const realTranscript = (b.transcript ?? '').trim();
                const notes = [b.narration, ...(b.bulletPoints ?? [])].filter(Boolean).join('\n\n');
                const body = realTranscript || notes;
                return (
                  <div key={b.id} className="space-y-3">
                    <SectionHead title={b.title || 'Video lesson'} sub={b.narration || undefined} />
                    <Instruction>
                      Watch the full video. If the player shows a CC control you can turn captions on.
                      {realTranscript
                        ? ' A transcript is provided below so you can follow along or read instead.'
                        : ' The lesson notes below cover the same material if you prefer to read.'}
                    </Instruction>
                    {b.videoUrl ? (
                      <div className="aspect-video rounded-xl overflow-hidden bg-black border border-border shadow-sm">
                        <video src={b.videoUrl} controls className="w-full h-full" />
                      </div>
                    ) : (
                      <EmptyState icon={PlayCircle} title="Video file not uploaded yet"
                        note="This lesson is marked as a video but no file is attached yet. It can be added in the Studio editor." />
                    )}
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {realTranscript ? 'Transcript' : 'Lesson notes'}
                      </p>
                      {body ? (
                        <>
                          <ReadAloudBar text={body} />
                          <p className="mt-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{body}</p>
                          {!realTranscript && (
                            <p className="mt-3 text-xs text-muted-foreground">
                              These are the lesson notes, not a word-for-word transcript of the video.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No transcript or notes have been added for this video yet.
                        </p>
                      )}
                      {isInstructor && (
                        <TranscriptEditor beatId={b.id} initial={realTranscript} moduleId={moduleId} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <NothingHere icon={PlayCircle} title="No video for this module" next={nextStep} />
          )
        )}

        {/* READINGS — in-module reading beats plus uploaded documents/links */}
        {tab === 'readings' && (
          <div className="space-y-4">
            {readingCount > 0 && (
              <Instruction>Work through the readings at your own pace. Your progress is tracked automatically.</Instruction>
            )}

            {readingBeats.length > 0 && (
              <>
                <div className="space-y-2">
                  {readingBeats.map((b, i) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                      <span className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium truncate">{b.title}</span>
                      {b.audioUrl && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 shrink-0"><Play className="h-3 w-3" /> audio</span>}
                    </div>
                  ))}
                </div>
                <Button className="w-full h-11" onClick={() => open('reading')}>
                  <BookOpen className="h-4 w-4 mr-2" /> Open readings
                </Button>
              </>
            )}

            {/* Uploaded documents / links (+ the staff uploader). */}
            <ReadingsSection moduleId={moduleId} isInstructor={isInstructor} />

            {readingCount === 0 && !isInstructor && (
              <NothingHere icon={BookOpen} title="No readings for this module" next={nextStep} />
            )}
          </div>
        )}

        {/* COMPLETE — interactive practice + mastery */}
        {tab === 'complete' && (
          <div className="space-y-4">
            {practiceCount > 0 ? (
              <>
                <Instruction>Complete each activity below. These give you immediate feedback and help the ideas stick before you demonstrate mastery.</Instruction>
                {interactiveBeats.length > 0 && (
                  <button onClick={() => open('interactive')}
                    className="w-full flex items-center gap-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-500/5 p-4 text-left hover:shadow-sm transition-shadow">
                    <span className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 flex items-center justify-center shrink-0"><Zap className="h-5 w-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">Interactive activities</div>
                      <div className="text-xs text-muted-foreground">{interactiveBeats.length} exercise{interactiveBeats.length !== 1 ? 's' : ''} · drag-order, match pairs, fill-in-the-blank</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                )}
                {quizBeats.length > 0 && (
                  <button onClick={() => open('quiz')}
                    className="w-full flex items-center gap-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-500/5 p-4 text-left hover:shadow-sm transition-shadow">
                    <span className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 flex items-center justify-center shrink-0"><HelpCircle className="h-5 w-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">Check for understanding</div>
                      <div className="text-xs text-muted-foreground">{quizBeats.length} question{quizBeats.length !== 1 ? 's' : ''}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                )}
                {/* Standalone activities assigned to this module (played full-screen). */}
                {(moduleActivities ?? []).map((a) => (
                  <button key={a.id} onClick={() => navigate(`/activities/${a.id}/play`)}
                    className="w-full flex items-center gap-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-500/5 p-4 text-left hover:shadow-sm transition-shadow">
                    <span className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center shrink-0"><Sparkles className="h-5 w-5" /></span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{a.title}</div>
                      <div className="text-xs text-muted-foreground capitalize">{(a.kind || 'activity').replace(/_/g, ' ')}{a.difficulty ? ` · ${a.difficulty}` : ''}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </>
            ) : (
              <NothingHere icon={Zap} title="No interactive activities for this module" next={nextStep} />
            )}

            <MasteryCard
              unlocked={masteryUnlocked}
              blocking={blocking}
              waiting={waiting}
              pending={startSession.isPending}
              onStart={() => startSession.mutate()}
              onGo={setTab}
            />
          </div>
        )}

        {/* PARTICIPATE */}
        {tab === 'participate' && (
          <div className="space-y-4">
            <SectionHead title="Join the discussion" sub="Learning is social. Share your thinking and respond to others." />
            <Instruction>Be respectful and constructive. Add value with each post, reference the material, and disagree with ideas, not people.</Instruction>
            {(discussions && discussions.length > 0) ? (
              <div className="space-y-2">
                {discussions.map((d) => (
                  <button key={d.id} onClick={() => navigate(`/courses/${courseId}/discussions/${d.id}`)}
                    className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/40 transition-colors">
                    <MessageSquare className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="flex-1 text-sm font-medium truncate">{d.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{d.replyCount ?? 0} repl{(d.replyCount ?? 0) === 1 ? 'y' : 'ies'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <NothingHere icon={MessageSquare} title="No discussions open yet" next={nextStep} />
            )}
          </div>
        )}

        {/* ASSIGNMENTS */}
        {tab === 'assignments' && (
          <div className="space-y-4">
            <SectionHead title="Assignments" sub="Submit your work. Grades and feedback flow into your gradebook." />
            {moduleAssignments.length > 0 ? (
              <>
                <Instruction>Open an assignment to read the full brief, then type your response or upload a file. You'll see your grade and feedback here once it's marked.</Instruction>
                <div className="space-y-2">
                  {moduleAssignments.map((a) => (
                    <button key={a.id} onClick={() => navigate(`/courses/${courseId}/assignments/${a.id}`)}
                      className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/40 transition-colors">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        {a.dueDate && <div className="text-xs text-muted-foreground">Due {new Date(a.dueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</div>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{a.pointsPossible ?? 0} pts</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <NothingHere icon={FileText} title="No assignments for this module" next={nextStep} />
            )}
          </div>
        )}

        {/* WORKSHOP */}
        {tab === 'workshop' && (
          <WorkshopSection moduleId={moduleId} isInstructor={isInstructor} next={nextStep} />
        )}

        </div>
      </div>

      {/* Continue bar: a clear forward path -- through the module's learning experiences,
          then on to the next module, and finally a course-completion celebration. */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-12">
        {allModulesComplete ? (
          <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <Trophy className="h-7 w-7" />
            </div>
            <p className="font-serif font-bold text-xl text-emerald-800 dark:text-emerald-300">Course complete. Congratulations!</p>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
              You've worked through every module in {course?.title ?? 'this course'}. Your credentials are on your Credentials page.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-5">
              <Button onClick={() => navigate('/credentials')}>View credentials</Button>
              <Button variant="outline" onClick={() => navigate(`/courses/${courseId}`)}>Back to course</Button>
            </div>
          </div>
        ) : moduleComplete ? (
          <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle className="h-6 w-6" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">Module complete</p>
              <p className="text-sm text-muted-foreground">{nextMod ? `Up next: ${nextMod.title}` : 'That was the final module in this course.'}</p>
            </div>
            {nextMod ? (
              <Button className="shrink-0" onClick={() => navigate(`/courses/${courseId}/modules/${nextMod.id}`)}>
                Next module <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button variant="outline" className="shrink-0" onClick={() => navigate(`/courses/${courseId}`)}>Back to course</Button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Keep going</p>
              <p className="text-sm text-muted-foreground">
                {continueIsMastery
                  ? "You've been through the material. Demonstrate mastery to complete this module."
                  : 'Work through each learning experience in order.'}
              </p>
            </div>
            <Button
              className="shrink-0"
              disabled={continueIsMastery && (!masteryUnlocked || startSession.isPending)}
              onClick={continueAction}
            >
              {continueIsMastery && <GraduationCap className="h-4 w-4 mr-2" />}
              {continueLabel}
              {!continueIsMastery && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}
