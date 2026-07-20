import React, { useState, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ChevronRight, CheckCircle, Clock, AlertCircle, BookOpen,
  FileText, MessageCircle, Layers, HelpCircle, X, Upload,
  ChevronDown, ChevronUp, Star, Sparkles, Trophy, Award, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function isOverdue(dueDate?: string) { return !!dueDate && new Date(dueDate) < new Date(); }

function parseMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n/g, '<br/>');
}

// ── Parse instructions as structured config ───────────────────────────────────
function parseConfig(instructions?: string): Record<string, any> | null {
  if (!instructions) return null;
  try {
    const parsed = JSON.parse(instructions);
    if (parsed && typeof parsed === 'object' && parsed.__type) return parsed;
  } catch { /* not JSON */ }
  return null;
}

// ── Word count ────────────────────────────────────────────────────────────────
function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }

// EssayForm was replaced by WrittenSubmission (defined below): a larger editor that also
// accepts a pasted or uploaded document, not just typed text.

// ─── Reflection submission ────────────────────────────────────────────────────
function ReflectionForm({ prompts, value, onChange }: {
  prompts: string[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  return (
    <div className="space-y-4">
      {/* Progress pills */}
      <div className="flex gap-2 flex-wrap">
        {prompts.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveIndex(i)}
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              i === activeIndex ? 'w-8 bg-primary' : value[i] ? 'w-4 bg-emerald-400' : 'w-4 bg-muted',
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
            <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">
              Prompt {activeIndex + 1} of {prompts.length}
            </div>
            <p className="text-sm font-medium leading-relaxed">{prompts[activeIndex]}</p>
          </div>
          <Textarea
            placeholder="Your reflection…"
            value={value[activeIndex] ?? ''}
            onChange={e => onChange({ ...value, [activeIndex]: e.target.value })}
            className="min-h-[140px] text-sm resize-none"
            autoFocus
          />
          <div className="text-xs text-muted-foreground">
            {wordCount(value[activeIndex] ?? '')} words
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Nav */}
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost" size="sm"
          disabled={activeIndex === 0}
          onClick={() => setActiveIndex(i => i - 1)}
        >
          <ChevronDown className="h-4 w-4 mr-1 rotate-90" /> Previous
        </Button>
        {activeIndex < prompts.length - 1 ? (
          <Button
            size="sm"
            disabled={!value[activeIndex]?.trim()}
            onClick={() => setActiveIndex(i => i + 1)}
          >
            Next <ChevronUp className="h-4 w-4 ml-1 rotate-90" />
          </Button>
        ) : (
          <div className="text-xs text-emerald-600 font-medium">
            {prompts.every((_, i) => value[i]?.trim()) ? '✓ All prompts answered' : 'Answer all prompts to submit'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Case study submission ────────────────────────────────────────────────────
function CaseStudyForm({ scenario, sections, value, onChange }: {
  scenario?: string;
  sections: { id: string; title: string; prompt: string }[];
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState<string>(sections[0]?.id ?? '');
  return (
    <div className="space-y-3">
      {scenario && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-sm leading-relaxed">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Scenario</div>
          <p className="text-foreground">{scenario}</p>
        </div>
      )}
      {sections.map((sec, i) => {
        const isOpen = open === sec.id;
        const filled = (value[sec.id] ?? '').trim().length > 0;
        return (
          <div key={sec.id} className={cn('rounded-xl border transition-all', isOpen ? 'border-primary/30 shadow-sm' : 'border-border')}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? '' : sec.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left gap-3"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  filled ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground',
                )}>
                  {filled ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span className="font-medium text-sm">{sec.title}</span>
              </div>
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            </button>
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-2">
                    <p className="text-xs text-muted-foreground italic">{sec.prompt}</p>
                    <Textarea
                      placeholder="Your response…"
                      value={value[sec.id] ?? ''}
                      onChange={e => onChange({ ...value, [sec.id]: e.target.value })}
                      className="min-h-[120px] text-sm resize-none"
                    />
                    <div className="text-xs text-muted-foreground">{wordCount(value[sec.id] ?? '')} words</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quiz submission ──────────────────────────────────────────────────────────
interface QuizQuestion { id: string; text: string; options: string[]; correct: number; }

function QuizForm({ questions, passingScore = 70, value, onChange, submitted, onSubmit }: {
  questions: QuizQuestion[];
  passingScore?: number;
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  submitted: boolean;
  onSubmit: (score: number, passed: boolean) => void;
}) {
  const [current, setCurrent] = useState(0);
  const q = questions[current];
  if (!q) return null;

  const answered = value[q.id] !== undefined;
  const allAnswered = questions.every(q => value[q.id] !== undefined);
  const score = submitted
    ? Math.round((questions.filter(q => value[q.id] === q.correct).length / questions.length) * 100)
    : 0;
  const passed = score >= passingScore;

  if (submitted) {
    const correctCount = questions.filter(q => value[q.id] === q.correct).length;
    const xp = correctCount * 10; // 10 XP per correct answer
    const tier = score >= 90 ? { label: 'Gold', icon: Trophy, cls: 'text-amber-500', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20', ring: 'border-amber-300 dark:border-amber-700' }
      : score >= 70 ? { label: 'Silver', icon: Award, cls: 'text-slate-400', bg: 'from-slate-50 to-slate-100 dark:from-slate-900/40 dark:to-slate-900/20', ring: 'border-slate-300 dark:border-slate-700' }
      : score >= 50 ? { label: 'Bronze', icon: Award, cls: 'text-orange-600', bg: 'from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20', ring: 'border-orange-300 dark:border-orange-800' }
      : { label: 'Keep going', icon: Zap, cls: 'text-rose-500', bg: 'from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-950/20', ring: 'border-rose-300 dark:border-rose-800' };
    const TierIcon = tier.icon;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
        <div className={cn('rounded-2xl p-6 text-center border bg-gradient-to-br', tier.bg, tier.ring)}>
          <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.1 }}>
            <TierIcon className={cn('h-12 w-12 mx-auto mb-2', tier.cls)} />
          </motion.div>
          <div className="text-4xl font-black">{score}%</div>
          <div className="text-sm font-bold mt-0.5">{tier.label} · {correctCount} of {questions.length} correct</div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-semibold">
            <Sparkles className="h-4 w-4" /> +{xp} XP earned
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {passed ? 'Passed! Submit to record your grade.' : `${passingScore}% to pass — you can review below and resubmit to improve.`}
          </div>
          <Progress value={score} className="mt-4 h-2" />
        </div>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const chosen = value[q.id];
            const correct = chosen === q.correct;
            return (
              <div key={q.id} className={cn(
                'rounded-xl border p-4 text-sm',
                correct ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20',
              )}>
                <div className="flex items-start gap-2 mb-2">
                  {correct ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />}
                  <span className="font-medium">{i + 1}. {q.text}</span>
                </div>
                <div className="ml-6 space-y-1 text-xs text-muted-foreground">
                  <div>Your answer: <span className={correct ? 'text-emerald-700' : 'text-rose-700 line-through'}>{q.options[chosen ?? -1] ?? '—'}</span></div>
                  {!correct && <div>Correct: <span className="text-emerald-700">{q.options[q.correct]}</span></div>}
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Question progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Question {current + 1} of {questions.length}</span>
        <span>{Object.keys(value).length} answered</span>
      </div>
      <Progress value={(current / questions.length) * 100} className="h-1" />

      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.22 }}
          className="rounded-2xl border border-violet-200 dark:border-violet-800 overflow-hidden"
        >
          <div className="bg-violet-50 dark:bg-violet-950/20 px-5 py-3 border-b border-violet-200 dark:border-violet-800 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">Question {current + 1}</span>
          </div>
          <div className="p-5">
            <p className="font-medium mb-5 text-sm leading-relaxed">{q.text}</p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const selected = value[q.id] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => onChange({ ...value, [q.id]: oi })}
                    className={cn(
                      'w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all text-sm',
                      selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <div className={cn(
                      'h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                      selected ? 'border-primary' : 'border-muted-foreground/30',
                    )}>
                      {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" disabled={current === 0} onClick={() => setCurrent(i => i - 1)}>← Back</Button>
        {current < questions.length - 1 ? (
          <Button size="sm" disabled={!answered} onClick={() => setCurrent(i => i + 1)}>Next →</Button>
        ) : (
          <Button
            size="sm"
            disabled={!allAnswered}
            onClick={() => {
              const s = Math.round((questions.filter(q => value[q.id] === q.correct).length / questions.length) * 100);
              onSubmit(s, s >= passingScore);
            }}
          >
            <Star className="h-4 w-4 mr-1.5" /> Submit Quiz
          </Button>
        )}
      </div>

      {/* Question dots nav */}
      <div className="flex gap-1.5 flex-wrap justify-center pt-1">
        {questions.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrent(i)}
            className={cn(
              'h-2.5 w-2.5 rounded-full transition-all',
              i === current ? 'bg-primary scale-125' : value[questions[i].id] !== undefined ? 'bg-emerald-400' : 'bg-muted',
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Shared gamified result card (tier + XP) ──────────────────────────────────
function GameResult({ correct, total, passingScore = 60 }: { correct: number; total: number; passingScore?: number }) {
  const score = Math.round((correct / Math.max(1, total)) * 100);
  const xp = correct * 10;
  const passed = score >= passingScore;
  const tier = score >= 90 ? { label: 'Gold', icon: Trophy, cls: 'text-amber-500', bg: 'from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20', ring: 'border-amber-300 dark:border-amber-700' }
    : score >= 70 ? { label: 'Silver', icon: Award, cls: 'text-slate-400', bg: 'from-slate-50 to-slate-100 dark:from-slate-900/40 dark:to-slate-900/20', ring: 'border-slate-300 dark:border-slate-700' }
    : score >= 50 ? { label: 'Bronze', icon: Award, cls: 'text-orange-600', bg: 'from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20', ring: 'border-orange-300 dark:border-orange-800' }
    : { label: 'Keep going', icon: Zap, cls: 'text-rose-500', bg: 'from-rose-50 to-rose-100 dark:from-rose-950/30 dark:to-rose-950/20', ring: 'border-rose-300 dark:border-rose-800' };
  const TierIcon = tier.icon;
  return (
    <div className={cn('rounded-2xl p-6 text-center border bg-gradient-to-br', tier.bg, tier.ring)}>
      <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', delay: 0.1 }}>
        <TierIcon className={cn('h-12 w-12 mx-auto mb-2', tier.cls)} />
      </motion.div>
      <div className="text-4xl font-black">{score}%</div>
      <div className="text-sm font-bold mt-0.5">{tier.label} · {correct} of {total} correct</div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-semibold">
        <Sparkles className="h-4 w-4" /> +{xp} XP earned
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{passed ? 'Passed! Submit to record your grade.' : `${passingScore}% to pass — you can play again to improve.`}</div>
      <Progress value={score} className="mt-4 h-2" />
    </div>
  );
}

function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr]; let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ─── Sequence puzzle: order the steps ─────────────────────────────────────────
function OrderGame({ items, correctOrder, submitted, onChange, onSubmit }: {
  items: { id: string; text: string }[]; correctOrder: string[]; submitted: boolean;
  onChange: (order: string[]) => void; onSubmit: (score: number, passed: boolean) => void;
}) {
  const [order, setOrder] = useState<string[]>(() => shuffleSeeded(items.map(i => i.id), items.length * 7 + 3));
  const byId = new Map(items.map(i => [i.id, i.text]));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[idx], next[j]] = [next[j], next[idx]]; setOrder(next); onChange(next);
  };
  const correctCount = order.filter((id, i) => id === correctOrder[i]).length;
  if (submitted) return <div className="space-y-4"><GameResult correct={correctCount} total={correctOrder.length} />
    <div className="space-y-2">{order.map((id, i) => { const ok = id === correctOrder[i]; return (
      <div key={id} className={cn('flex items-center gap-3 rounded-xl border p-3 text-sm', ok ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20')}>
        <span className="font-bold w-5">{i + 1}</span>{ok ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}<span className="flex-1">{byId.get(id)}</span></div>); })}</div></div>;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {order.map((id, i) => (
          <div key={id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <span className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
            <span className="flex-1">{byId.get(id)}</span>
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="p-0.5 disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <Button className="w-full" onClick={() => { const s = Math.round((correctCount / correctOrder.length) * 100); onSubmit(s, s >= 60); }}>Check my order</Button>
    </div>
  );
}

// ─── Match-up: pair left to right ─────────────────────────────────────────────
function MatchGame({ pairs, submitted, onChange, onSubmit }: {
  pairs: { left: string; right: string }[]; submitted: boolean;
  onChange: (matches: Record<string, string>) => void; onSubmit: (score: number, passed: boolean) => void;
}) {
  const rights = useMemo(() => shuffleSeeded(pairs.map(p => p.right), pairs.length * 5 + 2), [pairs]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const pick = (left: string, right: string) => { const next = { ...matches, [left]: right }; setMatches(next); onChange(next); };
  const correctCount = pairs.filter(p => matches[p.left] === p.right).length;
  const allPicked = pairs.every(p => matches[p.left]);
  if (submitted) return <div className="space-y-4"><GameResult correct={correctCount} total={pairs.length} />
    <div className="space-y-2">{pairs.map(p => { const ok = matches[p.left] === p.right; return (
      <div key={p.left} className={cn('rounded-xl border p-3 text-sm', ok ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50/50 dark:bg-rose-950/20')}>
        <div className="flex items-center gap-2 font-medium">{ok ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}{p.left}</div>
        <div className="ml-6 text-xs text-muted-foreground mt-0.5">You matched: {matches[p.left] ?? '—'}{!ok && <> · Correct: <span className="text-emerald-700">{p.right}</span></>}</div></div>); })}</div></div>;
  return (
    <div className="space-y-3">
      {pairs.map(p => (
        <div key={p.left} className="rounded-xl border border-border bg-card p-3">
          <div className="text-sm font-semibold mb-2">{p.left}</div>
          <select value={matches[p.left] ?? ''} onChange={e => pick(p.left, e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Choose the matching example…</option>
            {rights.map((r, i) => <option key={i} value={r}>{r}</option>)}
          </select>
        </div>
      ))}
      <Button className="w-full" disabled={!allPicked} onClick={() => { const s = Math.round((correctCount / pairs.length) * 100); onSubmit(s, s >= 60); }}>Check my matches</Button>
    </div>
  );
}

// ─── Jeopardy board: pick a tile, answer, bank points ─────────────────────────
function JeopardyGame({ categories, submitted, onChange, onSubmit }: {
  categories: { name: string; tiles: { id: string; value: number; question: string; options: string[]; correct: number }[] }[];
  submitted: boolean; onChange: (answers: Record<string, number>) => void; onSubmit: (score: number, passed: boolean) => void;
}) {
  const tiles = categories.flatMap(c => c.tiles);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const answer = (tileId: string, opt: number) => { const next = { ...answers, [tileId]: opt }; setAnswers(next); onChange(next); setActive(null); };
  const correctCount = tiles.filter(t => answers[t.id] === t.correct).length;
  const allDone = tiles.every(t => answers[t.id] !== undefined);
  const activeTile = tiles.find(t => t.id === active);
  if (submitted) return <GameResult correct={correctCount} total={tiles.length} />;
  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(0,1fr))` }}>
        {categories.map(c => (
          <div key={c.name} className="space-y-2">
            <div className="text-center text-xs font-bold uppercase tracking-wide text-primary py-1">{c.name}</div>
            {c.tiles.map(t => {
              const done = answers[t.id] !== undefined; const ok = answers[t.id] === t.correct;
              return (
                <button key={t.id} type="button" onClick={() => !done && setActive(t.id)} disabled={done}
                  className={cn('w-full rounded-lg py-3 text-lg font-black transition-colors', done ? (ok ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-indigo-600 text-white hover:bg-indigo-700')}>
                  {done ? (ok ? '✓' : '✗') : t.value}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {activeTile && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
          <div className="text-sm font-semibold mb-3">{activeTile.value} — {activeTile.question}</div>
          <div className="space-y-2">
            {activeTile.options.map((o, oi) => (
              <button key={oi} type="button" onClick={() => answer(activeTile.id, oi)} className="w-full text-left text-sm rounded-lg border border-border hover:bg-muted/50 p-3">{o}</button>
            ))}
          </div>
        </motion.div>
      )}
      <Button className="w-full" disabled={!allDone} onClick={() => { const s = Math.round((correctCount / tiles.length) * 100); onSubmit(s, s >= 60); }}>{allDone ? 'Finish the board' : `Answer all ${tiles.length} tiles`}</Button>
    </div>
  );
}

// ─── Discussion submission ────────────────────────────────────────────────────
function DiscussionForm({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const wc = wordCount(value);
  return (
    <div className="space-y-2">
      <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
        <strong>Discussion tip:</strong> Reference specific examples, connect ideas from the module, and consider multiple perspectives.
      </div>
      <Textarea
        placeholder="Share your thoughts and engage with the material…"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-[180px] text-sm resize-none leading-relaxed"
      />
      <div className="text-xs text-muted-foreground">{wc} words</div>
    </div>
  );
}

// ─── File upload submission ───────────────────────────────────────────────────
/**
 * This form used to be decorative: it displayed the chosen file's name and never read it,
 * so a learner who attached a document and clicked Submit sent an empty submission and had
 * no way to tell. It now reads the file and hands the bytes to the parent.
 *
 * Documents are parsed to text server-side (there is no object storage), so the accepted
 * types are the ones we can actually read. Images are deliberately no longer advertised --
 * promising a photo upload we cannot read was the source of the original problem.
 */
const ACCEPTED = '.pdf,.docx,.txt,.md,.rtf,.html,.odt,.pptx';
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Read a chosen document to a base64 payload the server can parse.
 * Shared by every submission type that accepts an attachment. Throws a human-readable
 * message on an unreadable type or an oversized file; chunked because
 * String.fromCharCode(...bytes) blows the call stack on a real document.
 */
async function readFileToBase64(f: File): Promise<{ filename: string; dataBase64: string }> {
  const ext = (f.name.split('.').pop() ?? '').toLowerCase();
  if (!ACCEPTED.includes(`.${ext}`)) throw new Error(`We can't read .${ext} files. Try PDF, Word, or a text file.`);
  if (f.size > MAX_BYTES) throw new Error('That file is larger than 15MB. Try exporting a smaller version.');
  const bytes = new Uint8Array(await f.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { filename: f.name, dataBase64: btoa(binary) };
}

/**
 * A compact "attach a document instead" row. Lets a written submission (essay, etc.) carry
 * an uploaded file without the big drop-zone dominating the form — the primary path stays
 * typing/pasting into the editor, the attachment is the alternative.
 */
function AttachFile({ file, onFileChange }: {
  file: { filename: string; dataBase64: string } | null;
  onFileChange: (f: { filename: string; dataBase64: string } | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const handle = async (f: File) => {
    setError(null); setReading(true);
    try { onFileChange(await readFileToBase64(f)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file.'); }
    finally { setReading(false); }
  };
  return (
    <div className="space-y-1.5">
      <input ref={ref} type="file" accept={ACCEPTED} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium truncate flex-1">{file.filename}</span>
          <button type="button" onClick={() => { onFileChange(null); if (ref.current) ref.current.value = ''; }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={reading}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Upload className="h-4 w-4" />
          {reading ? 'Reading your file…' : 'Attach a document instead (PDF, Word, or text)'}
        </button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * The written-submission editor for essays and open responses. A large editor is the point:
 * the previous layout crammed this into a one-third sidebar column where a long essay was
 * unreadable as you wrote it. Type, paste, or attach a document — all three are first-class.
 */
function WrittenSubmission({ value, onChange, file, onFileChange, minWords, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  file: { filename: string; dataBase64: string } | null;
  onFileChange: (f: { filename: string; dataBase64: string } | null) => void;
  minWords?: number;
  placeholder?: string;
}) {
  const wc = wordCount(value);
  const short = minWords ? wc < minWords : false;
  return (
    <div className="space-y-2.5">
      <Textarea
        placeholder={placeholder ?? 'Write or paste your response here…'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-[340px] text-sm leading-relaxed resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn('text-muted-foreground', short && 'text-amber-600')}>
          {wc} words{minWords ? ` · ${minWords} word minimum` : ''}
        </span>
        <span className="text-muted-foreground">Type, paste, or attach a document below.</span>
      </div>
      <AttachFile file={file} onFileChange={onFileChange} />
    </div>
  );
}

function FileUploadForm({ text, onTextChange, file, onFileChange }: {
  text: string;
  onTextChange: (v: string) => void;
  file: { filename: string; dataBase64: string } | null;
  onFileChange: (f: { filename: string; dataBase64: string } | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const fileName = file?.filename ?? null;

  const handleFile = async (f: File) => {
    setError(null); setReading(true);
    try { onFileChange(await readFileToBase64(f)); }
    catch (e) { setError(e instanceof Error ? e.message : "We couldn't read that file. Try saving it again."); }
    finally { setReading(false); }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => ref.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
        )}
      >
        <input ref={ref} type="file" accept={ACCEPTED} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
        {reading ? (
          <p className="text-sm text-muted-foreground">Reading your file…</p>
        ) : fileName ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium">{fileName}</span>
            <button type="button" onClick={e => { e.stopPropagation(); onFileChange(null); if (ref.current) ref.current.value = ''; }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="text-muted-foreground">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Drop your file here or click to browse</p>
            <p className="text-xs mt-1 opacity-60">PDF, Word, or a text document · up to 15MB</p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <div className="text-xs text-muted-foreground text-center">— or add written notes below —</div>
      <Textarea
        placeholder="Optional: add any written notes or context…"
        value={text}
        onChange={e => onTextChange(e.target.value)}
        className="min-h-[100px] text-sm resize-none"
      />
    </div>
  );
}

// ─── Staff grading panel ──────────────────────────────────────────────────────
/**
 * Marking for staff.
 *
 * This existed only as a backend route: nothing in the app has ever called
 * GET /assignments/:id/submissions or the grade endpoint, so assignments could be submitted
 * but never marked. That is also what makes the AI draft matter here -- a facilitator opens
 * this, reads a considered assessment of the work, adjusts it, and confirms.
 *
 * Confirming records the STAFF MEMBER as the grader. The draft is a starting point; the
 * mark is theirs.
 */
const STAFF_ROLES = ['coach', 'org_admin', 'partner_admin', 'super_admin'];

function StaffGradingPanel({ assignmentId, pointsPossible }: { assignmentId: string; pointsPossible: number }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState('');
  const [draftFeedback, setDraftFeedback] = useState('');

  const { data: subs } = useQuery({
    queryKey: ['assignment-submissions', assignmentId],
    queryFn: () => apiFetch<any[]>(`/assignments/${assignmentId}/submissions`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assignment-submissions', assignmentId] });
    setOpenId(null);
  };
  const confirmAi = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/assignment-submissions/${id}/confirm-ai-grade`, {
        method: 'POST',
        body: JSON.stringify({ score: draftScore === '' ? undefined : Number(draftScore), feedback: draftFeedback || undefined }),
      }),
    onSuccess: invalidate,
  });
  const gradeManually = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/assignment-submissions/${id}/grade`, {
        method: 'PATCH',
        body: JSON.stringify({ score: draftScore === '' ? null : Number(draftScore), feedback: draftFeedback || null }),
      }),
    onSuccess: invalidate,
  });

  const open = (s: any) => {
    setOpenId(s.id);
    // Pre-fill from the draft so confirming is one click, and editing is editing rather
    // than retyping.
    setDraftScore(s.score ?? s.aiScore ?? '');
    setDraftFeedback(s.feedback ?? s.aiFeedback ?? '');
  };

  const list = subs ?? [];
  const ungraded = list.filter(s => s.status !== 'graded');

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheckIcon />
          Submissions to mark ({ungraded.length} of {list.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Nobody has submitted this yet.</p>}
        {list.map(s => {
          const name = s.user ? `${s.user.firstName ?? ''} ${s.user.lastName ?? ''}`.trim() || s.user.email : 'Learner';
          const isOpen = openId === s.id;
          const text = [s.body, s.parsedText].filter(Boolean).join('\n\n');
          return (
            <div key={s.id} className="border border-border rounded-lg">
              <button className="w-full text-left p-3 flex items-center justify-between gap-3" onClick={() => (isOpen ? setOpenId(null) : open(s))}>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.status === 'graded'
                      ? `Graded · ${s.score ?? '--'} / ${pointsPossible}`
                      : s.aiGradedAt
                        ? `Awaiting your mark · draft ready${s.aiScore ? ` (${s.aiScore})` : ''}`
                        : 'Awaiting your mark'}
                    {s.sourceFilename ? ` · ${s.sourceFilename}` : ''}
                  </div>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                  {text && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Submission</div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto bg-muted/40 rounded-lg p-3">{text}</p>
                    </div>
                  )}
                  {Array.isArray(s.aiRubricAssessment) && s.aiRubricAssessment.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Draft rubric</div>
                      {s.aiRubricAssessment.map((c: any) => (
                        <div key={c.criterion} className="text-xs mb-1">
                          <span className="font-medium">{c.criterion}</span>
                          <span className="text-muted-foreground"> — {c.points} / {c.maxPoints}</span>
                          {c.note && <p className="text-muted-foreground leading-relaxed">{c.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={pointsPossible} value={draftScore}
                      onChange={e => setDraftScore(e.target.value)}
                      className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
                      placeholder="Score"
                    />
                    <span className="text-sm text-muted-foreground">/ {pointsPossible}</span>
                  </div>
                  <Textarea
                    value={draftFeedback}
                    onChange={e => setDraftFeedback(e.target.value)}
                    placeholder="Feedback to the learner"
                    className="min-h-[120px] text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => (s.aiGradedAt ? confirmAi.mutate(s.id) : gradeManually.mutate(s.id))}
                      disabled={confirmAi.isPending || gradeManually.isPending}
                    >
                      {confirmAi.isPending || gradeManually.isPending ? 'Saving…' : 'Release grade'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Cancel</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Releasing notifies the learner and updates the gradebook. You are recorded as the grader.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const FileCheckIcon = () => <CheckCircle className="h-4 w-4 text-primary" />;

// ─── Main component ───────────────────────────────────────────────────────────
export function AssignmentDetail() {
  const { courseId: routeCourseId, assignmentId } = useParams<{ courseId?: string; assignmentId: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const isStaff = !!me && STAFF_ROLES.includes(me.role);

  // Generic text state (essay / discussion / file notes)
  const [essay, setEssay] = useState('');
  const [upload, setUpload] = useState<{ filename: string; dataBase64: string } | null>(null);
  // Structured states
  const [reflectionAnswers, setReflectionAnswers] = useState<Record<string, string>>({});
  const [caseStudyAnswers, setCaseStudyAnswers] = useState<Record<string, string>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  // Game states (order / match / jeopardy) share a submitted flag + score.
  const [orderState, setOrderState] = useState<string[]>([]);
  const [matchState, setMatchState] = useState<Record<string, string>>({});
  const [jeopardyState, setJeopardyState] = useState<Record<string, number>>({});
  const [gameSubmitted, setGameSubmitted] = useState(false);
  const [gameScore, setGameScore] = useState<{ score: number; passed: boolean } | null>(null);
  const onGameSubmit = (score: number, passed: boolean) => { setGameScore({ score, passed }); setGameSubmitted(true); };
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState<{ score: number; passed: boolean } | null>(null);

  const { data: assignment, isLoading } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => apiFetch<any>(`/assignments/${assignmentId}`),
  });
  const { data: submission } = useQuery({
    queryKey: ['my-submission', assignmentId],
    queryFn: () => apiFetch<any | null>(`/assignments/${assignmentId}/my-submission`),
  });
  // Course id may come from the route, or (for a bare /assignments/:id link) from the assignment.
  const courseId = routeCourseId ?? assignment?.courseId ?? '';
  const { data: course } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiFetch<any>(`/courses/${courseId}`),
    enabled: !!courseId,
  });

  const submitMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ body, filename: upload?.filename, dataBase64: upload?.dataBase64 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
      // The AI draft is written after the response returns, so a single refetch would show
      // "no feedback yet" and stay that way. Poll briefly instead of making the learner reload.
      let tries = 0;
      const t = setInterval(() => {
        tries += 1;
        qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] });
        if (tries >= 8) clearInterval(t);
      }, 4000);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-72" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }
  if (!assignment) return <div className="text-muted-foreground">Assignment not found.</div>;

  const config = parseConfig(assignment.instructions);
  const subType: string = config?.__type ?? assignment.submissionType ?? 'essay';
  const overdue = isOverdue(assignment.dueDate);
  const graded = submission?.status === 'graded';
  const submitted = !!submission && submission.status !== 'graded';

  // ── Build submission body & validate ───────────────────────────────────────
  let submissionBody = '';
  let canSubmit = false;

  if (subType === 'reflection') {
    const prompts: string[] = config?.prompts ?? [];
    const allFilled = prompts.length > 0 && prompts.every((_: any, i: number) => reflectionAnswers[i]?.trim());
    submissionBody = JSON.stringify({ type: 'reflection', answers: reflectionAnswers });
    canSubmit = allFilled;
  } else if (subType === 'case_study') {
    const sections: any[] = config?.sections ?? [];
    const allFilled = sections.length > 0 && sections.every((s: any) => caseStudyAnswers[s.id]?.trim());
    submissionBody = JSON.stringify({ type: 'case_study', sections: caseStudyAnswers });
    canSubmit = allFilled;
  } else if (subType === 'quiz') {
    submissionBody = JSON.stringify({ type: 'quiz', answers: quizAnswers, ...quizScore });
    canSubmit = quizSubmitted;
  } else if (subType === 'order') {
    submissionBody = JSON.stringify({ type: 'order', order: orderState, ...gameScore });
    canSubmit = gameSubmitted;
  } else if (subType === 'match') {
    submissionBody = JSON.stringify({ type: 'match', matches: matchState, ...gameScore });
    canSubmit = gameSubmitted;
  } else if (subType === 'jeopardy') {
    submissionBody = JSON.stringify({ type: 'jeopardy', answers: jeopardyState, ...gameScore });
    canSubmit = gameSubmitted;
  } else {
    // essay, discussion, file_upload and any generic type: a typed/pasted response OR an
    // attached document both count. Requiring the text box blocked the learner who uploaded
    // exactly what the assignment asked for.
    submissionBody = essay;
    canSubmit = !!upload || essay.trim().length > 0;
  }

  // ── Icon & colour per type ─────────────────────────────────────────────────
  const TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    essay:       { icon: BookOpen,      label: 'Essay',        color: 'text-blue-600' },
    reflection:  { icon: MessageCircle, label: 'Reflection',   color: 'text-violet-600' },
    case_study:  { icon: Layers,        label: 'Case Study',   color: 'text-amber-600' },
    quiz:        { icon: HelpCircle,    label: 'Quiz',         color: 'text-rose-600' },
    order:       { icon: Layers,        label: 'Sequence Puzzle', color: 'text-cyan-600' },
    match:       { icon: Layers,        label: 'Match-Up',     color: 'text-fuchsia-600' },
    jeopardy:    { icon: Trophy,        label: 'Jeopardy',     color: 'text-indigo-600' },
    discussion:  { icon: MessageCircle, label: 'Discussion',   color: 'text-emerald-600' },
    file_upload: { icon: FileText,      label: 'File Upload',  color: 'text-slate-600' },
  };
  const meta = TYPE_META[subType] ?? TYPE_META.essay;
  const MetaIcon = meta.icon;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <button onClick={() => navigate('/courses')} className="hover:text-foreground transition-colors">Courses</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <button onClick={() => navigate(`/courses/${courseId}?tab=assignments`)} className="hover:text-foreground transition-colors">{course?.title ?? 'Course'}</button>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{assignment.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0', 'bg-primary/10')}>
          <MetaIcon className={cn('h-6 w-6', meta.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{assignment.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="outline" className="gap-1.5">
              <MetaIcon className={cn('h-3 w-3', meta.color)} /> {meta.label}
            </Badge>
            <Badge variant="outline">{assignment.pointsPossible} pts</Badge>
            {assignment.dueDate && (
              <Badge variant={overdue ? 'destructive' : 'outline'} className="gap-1">
                {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                {overdue ? 'Overdue · ' : 'Due '}{formatDate(assignment.dueDate)}
              </Badge>
            )}
            {graded && <Badge className="bg-emerald-600">Graded</Badge>}
            {submitted && <Badge variant="secondary">Submitted · Awaiting grade</Badge>}
          </div>
        </div>
      </div>

      {/*
        Single-column flow. The task (description + instructions, both short) sits at the top;
        the submission editor gets the full width below it. The previous three-column grid
        squeezed the submission into a one-third sidebar -- fine for a filename, unusable for
        writing an essay -- while the two-thirds task column sat mostly empty.
      */}
      <div className="space-y-5">
          {/* Task: description + instructions, compact and side by side on wide screens */}
          {(assignment.description || (assignment.instructions && !config)) && (
            <div className="grid gap-4 md:grid-cols-2">
              {assignment.description && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
                  <CardContent><p className="text-sm text-muted-foreground leading-relaxed">{assignment.description}</p></CardContent>
                </Card>
              )}
              {assignment.instructions && !config && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Instructions</CardTitle></CardHeader>
                  <CardContent>
                    <div
                      className="prose prose-sm max-w-none text-foreground text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(assignment.instructions) }}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          {/* Case study scenario */}
          {subType === 'case_study' && config?.scenario && !submitted && !graded && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-sm leading-relaxed">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Scenario</div>
              <p>{config.scenario}</p>
            </div>
          )}

          {/* Graded */}
          {graded && (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <CardTitle className="text-base">Graded</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-4xl font-black">
                  {submission.score}
                  <span className="text-xl font-normal text-muted-foreground"> / {assignment.pointsPossible}</span>
                </div>
                {submission.letterGrade && (
                  <Badge variant="outline" className="text-lg px-3 py-1">{submission.letterGrade}</Badge>
                )}
                {submission.feedback && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Feedback</div>
                    <p className="text-sm leading-relaxed bg-muted/50 rounded-lg p-3">{submission.feedback}</p>
                  </div>
                )}
                {submission.body && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Your Submission</div>
                    <p className="text-xs text-muted-foreground line-clamp-4">
                      {(() => { try { return JSON.stringify(JSON.parse(submission.body), null, 2); } catch { return submission.body; } })()}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Awaiting grade */}
          {submitted && !graded && (
            <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="py-5 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="font-medium">Submitted</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{formatDate(submission.submittedAt)} · Awaiting grade</div>
                  {submission.sourceFilename && (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" />{submission.sourceFilename}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/*
            Early feedback while the work is still awaiting a real grade.
            Labelled unambiguously as automated and NOT a mark -- the score is deliberately
            not shown, because a learner who sees "62/100" will read it as their grade no
            matter what the caption says, and their facilitator has not looked at it yet.
            What is worth having immediately is the substance of the response.
          */}
          {submitted && !graded && submission.aiFeedback && (
            <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Early feedback
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Automated, and not your grade. Your facilitator marks this work — use this to start improving now.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{submission.aiFeedback}</p>
                {Array.isArray(submission.aiRubricAssessment) && submission.aiRubricAssessment.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {submission.aiRubricAssessment.map((c: any) => (
                      <div key={c.criterion} className="text-xs">
                        <div className="flex items-center justify-between font-medium">
                          <span>{c.criterion}</span>
                          <span className="text-muted-foreground">{c.points} / {c.maxPoints}</span>
                        </div>
                        {c.note && <p className="text-muted-foreground mt-0.5 leading-relaxed">{c.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Submission form */}
          {!submission && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MetaIcon className={cn('h-4 w-4', meta.color)} />
                  {meta.label} Submission
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* ── Reflection ── */}
                {subType === 'reflection' && (
                  <ReflectionForm
                    prompts={config?.prompts ?? ['What was your main takeaway?', 'How will you apply this at work?', 'What questions do you still have?']}
                    value={reflectionAnswers}
                    onChange={setReflectionAnswers}
                  />
                )}

                {/* ── Case study ── */}
                {subType === 'case_study' && (
                  <CaseStudyForm
                    sections={config?.sections ?? [
                      { id: 'situation', title: 'Situation Analysis', prompt: 'What are the key issues or challenges in this scenario?' },
                      { id: 'actions', title: 'Recommended Actions', prompt: 'What would you do, and why?' },
                      { id: 'reflection', title: 'Personal Reflection', prompt: 'How does this connect to your own work context?' },
                    ]}
                    value={caseStudyAnswers}
                    onChange={setCaseStudyAnswers}
                  />
                )}

                {/* ── Quiz (auto-graded, completed in the module) ── */}
                {subType === 'quiz' && (
                  <>
                    {config?.intro && <p className="text-sm text-muted-foreground leading-relaxed">{config.intro}</p>}
                    <QuizForm
                      questions={config?.questions ?? []}
                      passingScore={config?.passingScore ?? 70}
                      value={quizAnswers}
                      onChange={setQuizAnswers}
                      submitted={quizSubmitted}
                      onSubmit={(score, passed) => { setQuizScore({ score, passed }); setQuizSubmitted(true); }}
                    />
                    {config?.allowUpload && (
                      <div className="mt-2 rounded-lg border border-dashed border-border p-3">
                        <div className="text-xs font-medium text-foreground">Optional: attach supporting work</div>
                        <p className="text-xs text-muted-foreground mt-0.5 mb-2">Not required - your score comes from the questions above. Attach a file only if your coach asked for one.</p>
                        <input type="file" accept=".pdf,.doc,.docx,.txt" className="text-xs"
                          onChange={async (e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            const b64 = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.readAsDataURL(f); });
                            setUpload({ filename: f.name, dataBase64: b64 });
                          }} />
                        {upload && <div className="text-xs text-foreground mt-1">Attached: {upload.filename}</div>}
                      </div>
                    )}
                  </>
                )}

                {/* ── Sequence puzzle ── */}
                {subType === 'order' && (
                  <>
                    {config?.intro && <p className="text-sm text-muted-foreground leading-relaxed">{config.intro}</p>}
                    <OrderGame items={config?.items ?? []} correctOrder={config?.order ?? []} submitted={gameSubmitted} onChange={setOrderState} onSubmit={onGameSubmit} />
                  </>
                )}

                {/* ── Match-up ── */}
                {subType === 'match' && (
                  <>
                    {config?.intro && <p className="text-sm text-muted-foreground leading-relaxed">{config.intro}</p>}
                    <MatchGame pairs={config?.pairs ?? []} submitted={gameSubmitted} onChange={setMatchState} onSubmit={onGameSubmit} />
                  </>
                )}

                {/* ── Jeopardy ── */}
                {subType === 'jeopardy' && (
                  <>
                    {config?.intro && <p className="text-sm text-muted-foreground leading-relaxed">{config.intro}</p>}
                    <JeopardyGame categories={config?.categories ?? []} submitted={gameSubmitted} onChange={setJeopardyState} onSubmit={onGameSubmit} />
                  </>
                )}

                {/* ── Discussion ── */}
                {subType === 'discussion' && (
                  <DiscussionForm value={essay} onChange={setEssay} />
                )}

                {/* ── File upload ── */}
                {subType === 'file_upload' && (
                  <FileUploadForm text={essay} onTextChange={setEssay} file={upload} onFileChange={setUpload} />
                )}

                {/* ── Essay (default) — type, paste, or attach a document ── */}
                {(subType === 'essay' || !['reflection','case_study','quiz','order','match','jeopardy','discussion','file_upload'].includes(subType)) && (
                  <WrittenSubmission value={essay} onChange={setEssay} file={upload} onFileChange={setUpload} minWords={assignment.minWords} />
                )}

                {/* Submit button — not shown for quiz (handled inside QuizForm) */}
                {subType !== 'quiz' && (
                  <Button
                    className="w-full"
                    onClick={() => submitMutation.mutate(submissionBody)}
                    disabled={submitMutation.isPending || !canSubmit}
                  >
                    {submitMutation.isPending ? 'Submitting…' : 'Submit Assignment'}
                  </Button>
                )}

                {/* Quiz submit after quiz completed */}
                {subType === 'quiz' && quizSubmitted && (
                  <Button
                    className="w-full"
                    onClick={() => submitMutation.mutate(submissionBody)}
                    disabled={submitMutation.isPending}
                  >
                    {submitMutation.isPending ? 'Saving…' : 'Save Result'}
                  </Button>
                )}

                {submitMutation.isError && (
                  <p className="text-xs text-red-500">{String((submitMutation.error as Error).message)}</p>
                )}
              </CardContent>
            </Card>
          )}
      </div>

      {isStaff && <StaffGradingPanel assignmentId={assignmentId!} pointsPossible={Number(assignment.pointsPossible)} />}
    </div>
  );
}
