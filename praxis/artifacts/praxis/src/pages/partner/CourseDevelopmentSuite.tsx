import React, { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { PageHeader } from '@/components/PageHeader';
import { SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Sparkles, Target, ClipboardCheck, Video, ArrowLeft, Wand2, CheckCircle2, AlertTriangle,
  Check, X, Pencil, Play, ShieldCheck, FileText, Film, RotateCcw,
} from 'lucide-react';
import {
  BLOOM_LEVELS, bloomColor, generateObjectives, suggestAssessments, draftVideoSegments,
  type BloomLevel, type Objective, type VideoSegment,
} from '@/lib/courseDevEngine';
import { useLearningHub, addContent } from '@/lib/learningHubStore';

export function CourseDevelopmentSuite() {
  const [, navigate] = useLocation();
  const { content } = useLearningHub();
  const videos = useMemo(() => content.filter((c) => c.kind === 'video'), [content]);

  // Brief
  const [title, setTitle] = useState('Customer Service Excellence');
  const [desc, setDesc] = useState('A frontline course covering service standards, active listening, complaint handling and service recovery for retail staff.');
  const [levels, setLevels] = useState<BloomLevel[]>(['Remember', 'Understand', 'Apply', 'Evaluate']);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const toggleLevel = (l: BloomLevel) => setLevels((xs) => (xs.includes(l) ? xs.filter((x) => x !== l) : [...xs, l]));
  const genObjectives = () => setObjectives(generateObjectives(title, desc, BLOOM_LEVELS.filter((l) => levels.includes(l))));

  const { ideas, warnings } = useMemo(() => suggestAssessments(objectives.length ? objectives.map((o) => o.level) : levels), [objectives, levels]);

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate('/learning')} className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Learning Hub
        </button>
        <PageHeader title="Course Development Suite" icon={Sparkles}
          subtitle="From a course description and your uploaded materials: generate Bloom-aligned objectives, scaffold assessments, and author interactive video. Every AI draft is reviewed by you before it ships." />
      </div>

      {/* Brief */}
      <Card className="p-5 space-y-3">
        <SectionTitle>Course brief</SectionTitle>
        <div className="grid gap-3">
          <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Course title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" /></label>
          <label className="text-xs block"><span className="mb-1 block font-medium text-muted-foreground">Description &amp; context</span>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
        </div>
      </Card>

      <Tabs defaultValue="objectives">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="objectives" className="gap-1.5"><Target className="h-4 w-4" /> Objectives</TabsTrigger>
          <TabsTrigger value="assessments" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /> Assessments</TabsTrigger>
          <TabsTrigger value="video" className="gap-1.5"><Video className="h-4 w-4" /> Interactive Video</TabsTrigger>
        </TabsList>

        {/* ── Objectives ─────────────────────────────────── */}
        <TabsContent value="objectives" className="mt-4 space-y-4">
          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium">Cognitive levels (Bloom's Taxonomy)</div>
            <div className="flex flex-wrap gap-2">
              {BLOOM_LEVELS.map((l) => (
                <button key={l} onClick={() => toggleLevel(l)}
                  className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    levels.includes(l) ? cn('border-transparent', bloomColor(l)) : 'border-border bg-card text-muted-foreground hover:border-primary/40')}>
                  {l}
                </button>
              ))}
            </div>
            <Button className="gap-1.5" onClick={genObjectives} disabled={!levels.length}><Wand2 className="h-4 w-4" /> Generate objectives</Button>
          </Card>

          {objectives.length > 0 && (
            <Card className="p-5 space-y-3">
              <SectionTitle>Generated objectives</SectionTitle>
              <div className="space-y-2">
                {objectives.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={cn('capitalize', bloomColor(o.level))}>{o.level}</Badge>
                      <span className="text-xs text-muted-foreground">verb: <span className="font-mono">{o.verb}</span></span>
                      {o.measurable
                        ? <span className="ml-auto inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Measurable</span>
                        : <span className="ml-auto inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3.5 w-3.5" /> Revise</span>}
                    </div>
                    <div className="text-sm">{o.text}</div>
                    <div className="text-xs text-muted-foreground mt-1">{o.note}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Review and edit before adding to the course - these are drafts.</div>
            </Card>
          )}
        </TabsContent>

        {/* ── Assessments ────────────────────────────────── */}
        <TabsContent value="assessments" className="mt-4 space-y-4">
          {warnings.length > 0 && (
            <Card className="p-4 border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 space-y-1.5">
              <div className="text-sm font-medium text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Scaffolding checks</div>
              {warnings.map((w, i) => <div key={i} className="text-xs text-amber-800 dark:text-amber-300">• {w}</div>)}
            </Card>
          )}
          <Card className="p-5 space-y-3">
            <SectionTitle>Suggested assessments by level</SectionTitle>
            <div className="space-y-2">
              {ideas.map((idea) => (
                <div key={idea.level} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={cn('capitalize', bloomColor(idea.level))}>{idea.level}</Badge>
                    {idea.formative && <Badge variant="secondary" className="text-[10px]">Formative</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {idea.types.map((tp) => (
                      <span key={tp} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs">
                        <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" /> {tp}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {ideas.length === 0 && <div className="text-sm text-muted-foreground">Pick cognitive levels on the Objectives tab to see scaffolded assessments.</div>}
            </div>
          </Card>
        </TabsContent>

        {/* ── Interactive Video ──────────────────────────── */}
        <TabsContent value="video" className="mt-4 space-y-4">
          <InteractiveVideo videos={videos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Interactive video authoring + AI auto-audit (mirrors the mockup pipeline) ─
const PIPELINE = [
  { n: 1, t: 'Transcription', d: 'Speech-to-text builds a timestamped transcript', human: false },
  { n: 2, t: 'Topic segmentation', d: 'Split at natural idea boundaries', human: false },
  { n: 3, t: 'Draft interactions', d: 'AI proposes a question type per segment', human: false },
  { n: 4, t: 'Human review', d: 'Accept / edit / reject - nothing publishes unreviewed', human: true },
  { n: 5, t: 'Published asset', d: 'Reusable, tagged, in the content library', human: false },
];

function InteractiveVideo({ videos }: { videos: { id: string; title: string }[] }) {
  const [sourceId, setSourceId] = useState(videos[0]?.id ?? '');
  const source = videos.find((v) => v.id === sourceId);
  const [segments, setSegments] = useState<VideoSegment[] | null>(null);
  const [published, setPublished] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const run = () => { setSegments(draftVideoSegments(source?.title ?? 'Untitled')); setPublished(false); };
  const setStatus = (id: string, status: VideoSegment['status']) => setSegments((xs) => xs!.map((s) => (s.id === id ? { ...s, status } : s)));
  const saveEdit = (id: string) => { setSegments((xs) => xs!.map((s) => (s.id === id ? { ...s, prompt: draftText, status: 'approved' } : s))); setEditing(null); };

  const reviewed = segments ? segments.filter((s) => s.status !== 'draft').length : 0;
  const approved = segments ? segments.filter((s) => s.status === 'approved').length : 0;
  const allReviewed = segments ? reviewed === segments.length : false;

  const publish = () => {
    addContent({ title: `${source?.title ?? 'Video'} - interactive (${approved} interactions)`, kind: 'video', meta: `Interactive · ${approved} gated interactions`, tags: ['interactive'], addedBy: 'You', reviewed: true });
    setPublished(true);
  };

  const qColor = (q: VideoSegment['qType']) => q === 'Multiple choice' ? 'bg-emerald-600' : q === 'Free response' ? 'bg-violet-600' : 'bg-slate-500';

  return (
    <div className="space-y-4">
      {/* Pipeline */}
      <Card className="p-5">
        <SectionTitle>AI auto-audit pipeline</SectionTitle>
        <div className="mt-3 flex items-stretch gap-1 overflow-x-auto pb-1">
          {PIPELINE.map((p, i) => (
            <React.Fragment key={p.n}>
              <div className={cn('min-w-[150px] flex-1 rounded-lg border p-3', p.human ? 'border-orange-300 bg-orange-50/70 dark:bg-orange-950/20' : 'border-border bg-card')}>
                <div className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold mb-2', p.human ? 'bg-orange-200 text-orange-800' : 'bg-violet-100 text-violet-700')}>{p.n}</div>
                <div className="text-xs font-semibold flex items-center gap-1">{p.human && <ShieldCheck className="h-3.5 w-3.5 text-orange-600" />}{p.t}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{p.d}</div>
                {p.human && <Badge className="mt-1.5 bg-orange-600 text-white text-[9px]">Required gate</Badge>}
              </div>
              {i < PIPELINE.length - 1 && <div className="flex items-center text-muted-foreground px-0.5">→</div>}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Source + run */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs block flex-1 min-w-[220px]"><span className="mb-1 block font-medium text-muted-foreground">Source video (from content library)</span>
            <select value={sourceId} onChange={(e) => { setSourceId(e.target.value); setSegments(null); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {videos.length === 0 && <option value="">No videos - upload one in the Learning Hub</option>}
              {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
            </select></label>
          <Button className="gap-1.5" onClick={run} disabled={!sourceId}><Wand2 className="h-4 w-4" /> {segments ? 'Re-run auto-audit' : 'Run AI auto-audit'}</Button>
        </div>

        {segments && (
          <>
            {/* Timeline */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Segmented timeline</span>
                <span className="text-xs text-muted-foreground">{reviewed} of {segments.length} reviewed</span>
              </div>
              <div className="flex gap-1">
                {segments.map((s) => (
                  <div key={s.id} className="flex-1">
                    <div className={cn('h-8 rounded flex items-center justify-center text-[10px] font-medium text-white', qColor(s.qType))}>{s.label}</div>
                    <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                      {s.status === 'approved' && <Check className="h-3 w-3 text-emerald-600" />}
                      {s.status === 'rejected' && <X className="h-3 w-3 text-red-500" />}
                      {s.status === 'draft' && <span className="text-amber-600">?</span>}
                      {s.start}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Multiple choice</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-600" /> Free response</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Reflective pause</span>
              </div>
            </div>

            {/* Segment review cards */}
            <div className="space-y-2">
              {segments.map((s) => (
                <div key={s.id} className={cn('rounded-lg border p-3',
                  s.status === 'approved' ? 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10'
                    : s.status === 'rejected' ? 'border-red-200 bg-red-50/40 dark:bg-red-950/10 opacity-70'
                    : 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/10')}>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <span className="font-medium">{s.label}</span> · {s.start}-{s.end} ·
                    <Badge variant="secondary" className="text-[10px]">{s.qType}</Badge>
                    {s.status === 'draft' && <Badge className="bg-amber-500 text-white text-[10px] ml-auto">AI draft - needs review</Badge>}
                    {s.status === 'approved' && <Badge className="bg-emerald-600 text-white text-[10px] ml-auto">Approved</Badge>}
                    {s.status === 'rejected' && <Badge className="bg-red-500 text-white text-[10px] ml-auto">Rejected</Badge>}
                  </div>
                  {editing === s.id ? (
                    <div className="space-y-2">
                      <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                      <div className="flex gap-2">
                        <Button size="sm" className="gap-1.5" onClick={() => saveEdit(s.id)}><Check className="h-3.5 w-3.5" /> Save &amp; approve</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm">{s.prompt}</div>
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-emerald-700" onClick={() => setStatus(s.id, 'approved')}><Check className="h-3.5 w-3.5" /> Accept</Button>
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => { setEditing(s.id); setDraftText(s.prompt); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-red-600" onClick={() => setStatus(s.id, 'rejected')}><X className="h-3.5 w-3.5" /> Reject</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Publish gate */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 bg-muted/20">
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {allReviewed ? `${approved} interaction${approved === 1 ? '' : 's'} approved. Ready to publish.` : 'Review every segment to unlock publishing - the review gate is mandatory.'}
              </div>
              {published
                ? <Badge className="bg-emerald-600 text-white gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Published to library</Badge>
                : <Button className="gap-1.5" disabled={!allReviewed || approved === 0} onClick={publish}><Film className="h-4 w-4" /> Publish interactive video</Button>}
            </div>
          </>
        )}

        {!segments && videos.length > 0 && (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Play className="h-4 w-4" /> Pick a source video and run the auto-audit to draft interactions.</div>
        )}
      </Card>
    </div>
  );
}
