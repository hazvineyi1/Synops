import React, { useState, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  ChevronRight, CheckCircle, Clock, AlertCircle, BookOpen,
  FileText, MessageCircle, Layers, HelpCircle, X, Upload,
  ChevronDown, ChevronUp, Star,
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

// ─── Essay submission ─────────────────────────────────────────────────────────
function EssayForm({ value, onChange, minWords = 0 }: {
  value: string; onChange: (v: string) => void; minWords?: number;
}) {
  const wc = wordCount(value);
  const enough = minWords === 0 || wc >= minWords;
  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Write your response here…"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-[220px] text-sm resize-none leading-relaxed"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{wc} word{wc !== 1 ? 's' : ''}</span>
        {minWords > 0 && (
          <span className={enough ? 'text-emerald-600' : ''}>
            {enough ? '✓ Minimum met' : `${minWords - wc} more word${minWords - wc !== 1 ? 's' : ''} needed`}
          </span>
        )}
      </div>
    </div>
  );
}

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
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
        <div className={cn(
          'rounded-2xl p-6 text-center border',
          passed
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800',
        )}>
          <div className="text-5xl font-black mb-1">{score}%</div>
          <div className={cn('text-sm font-semibold', passed ? 'text-emerald-700' : 'text-rose-700')}>
            {passed ? '🎉 Passed!' : `Needs improvement — ${passingScore}% required`}
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
function FileUploadForm({ text, onTextChange }: { text: string; onTextChange: (v: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => setFileName(f.name);

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
        <input ref={ref} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {fileName ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-medium">{fileName}</span>
            <button type="button" onClick={e => { e.stopPropagation(); setFileName(null); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="text-muted-foreground">
            <Upload className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">Drop your file here or click to browse</p>
            <p className="text-xs mt-1 opacity-60">PDF, Word, images or any document</p>
          </div>
        )}
      </div>
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

// ─── Main component ───────────────────────────────────────────────────────────
export function AssignmentDetail() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  // Generic text state (essay / discussion / file notes)
  const [essay, setEssay] = useState('');
  // Structured states
  const [reflectionAnswers, setReflectionAnswers] = useState<Record<string, string>>({});
  const [caseStudyAnswers, setCaseStudyAnswers] = useState<Record<string, string>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
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
  const { data: course } = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => apiFetch<any>(`/courses/${courseId}`),
  });

  const submitMutation = useMutation({
    mutationFn: (body: string) =>
      apiFetch(`/assignments/${assignmentId}/submit`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-submission', assignmentId] }),
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
  } else {
    submissionBody = essay;
    canSubmit = essay.trim().length > 0;
  }

  // ── Icon & colour per type ─────────────────────────────────────────────────
  const TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    essay:       { icon: BookOpen,      label: 'Essay',        color: 'text-blue-600' },
    reflection:  { icon: MessageCircle, label: 'Reflection',   color: 'text-violet-600' },
    case_study:  { icon: Layers,        label: 'Case Study',   color: 'text-amber-600' },
    quiz:        { icon: HelpCircle,    label: 'Quiz',         color: 'text-rose-600' },
    discussion:  { icon: MessageCircle, label: 'Discussion',   color: 'text-emerald-600' },
    file_upload: { icon: FileText,      label: 'File Upload',  color: 'text-slate-600' },
  };
  const meta = TYPE_META[subType] ?? TYPE_META.essay;
  const MetaIcon = meta.icon;

  return (
    <div className="space-y-6 max-w-5xl">
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

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main */}
        <div className="md:col-span-2 space-y-4">
          {/* Description / instructions */}
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
          {/* Case study scenario shown in main area */}
          {subType === 'case_study' && config?.scenario && !submitted && !graded && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-4 text-sm leading-relaxed">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">Scenario</div>
              <p>{config.scenario}</p>
            </div>
          )}
        </div>

        {/* Sidebar: submission panel */}
        <div className="space-y-4">
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
                </div>
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

                {/* ── Quiz ── */}
                {subType === 'quiz' && (
                  <QuizForm
                    questions={config?.questions ?? []}
                    passingScore={config?.passingScore ?? 70}
                    value={quizAnswers}
                    onChange={setQuizAnswers}
                    submitted={quizSubmitted}
                    onSubmit={(score, passed) => { setQuizScore({ score, passed }); setQuizSubmitted(true); }}
                  />
                )}

                {/* ── Discussion ── */}
                {subType === 'discussion' && (
                  <DiscussionForm value={essay} onChange={setEssay} />
                )}

                {/* ── File upload ── */}
                {subType === 'file_upload' && (
                  <FileUploadForm text={essay} onTextChange={setEssay} />
                )}

                {/* ── Essay (default) ── */}
                {(subType === 'essay' || !['reflection','case_study','quiz','discussion','file_upload'].includes(subType)) && (
                  <EssayForm value={essay} onChange={setEssay} minWords={assignment.minWords} />
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
      </div>
    </div>
  );
}
