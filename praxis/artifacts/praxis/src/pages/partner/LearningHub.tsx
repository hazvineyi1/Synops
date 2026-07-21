import React, { useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { PageHeader } from '@/components/PageHeader';
import { StatCard, SectionTitle } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  BookOpen, Upload, Video, FileText, Link2, Image as ImageIcon, Package, Layers,
  Building2, Check, CheckCircle2, Clock, Trash2, Sparkles, GraduationCap, ArrowRight, Send,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  useLearningHub, addContent, uploadContent, removeContent, markReviewed, toggleAssignment,
  partnersForCourse, type ContentKind, type ContentItem, type CourseTemplate,
} from '@/lib/learningHubStore';

const KIND_ICON: Record<ContentKind, React.ElementType> = {
  video: Video, document: FileText, image: ImageIcon, link: Link2, scorm: Package,
};
const KIND_TINT: Record<ContentKind, string> = {
  video: 'bg-violet-500/10 text-violet-600', document: 'bg-blue-500/10 text-blue-600',
  image: 'bg-emerald-500/10 text-emerald-600', link: 'bg-amber-500/10 text-amber-600',
  scorm: 'bg-rose-500/10 text-rose-600',
};

function bytes(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}
function kindFromFile(type: string): ContentKind {
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('image/')) return 'image';
  if (type.includes('zip')) return 'scorm';
  return 'document';
}

export function LearningHub() {
  const [, navigate] = useLocation();
  const { content, templates } = useLearningHub();
  const { data: partners = [] } = useQuery({ queryKey: ['partners'], queryFn: () => apiFetch<{ id: string; name: string }[]>('/partners') });
  const fileRef = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashMsg = (m: string) => { setFlash(m); window.setTimeout(() => setFlash(null), 3500); };

  // Add-by-URL (video or link)
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlTitle, setUrlTitle] = useState('');
  const [urlValue, setUrlValue] = useState('');
  const [urlKind, setUrlKind] = useState<ContentKind>('link');

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    for (const f of arr) {
      try { await uploadContent(f); flashMsg(`Uploaded "${f.name}" to the content library.`); }
      catch (e) { flashMsg(e instanceof Error ? e.message : 'Upload failed.'); }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const addUrl = async () => {
    if (!urlTitle.trim() || !urlValue.trim()) return;
    try {
      await addContent({ title: urlTitle.trim(), kind: urlKind, meta: urlValue.trim(), url: urlValue.trim(), tags: [], addedBy: 'You', reviewed: urlKind !== 'video' });
      setUrlTitle(''); setUrlValue(''); setUrlOpen(false);
      flashMsg('Added to the content library.');
    } catch (e) { flashMsg(e instanceof Error ? e.message : 'Could not add that.'); }
  };

  const videos = content.filter((c) => c.kind === 'video').length;
  const needsReview = content.filter((c) => !c.reviewed).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Learning Hub" icon={BookOpen}
        subtitle="Platform content home. Upload videos and materials, manage reusable course and lesson templates, and assign courses to partners." />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Package} label="Content items" value={content.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Video} label="Videos" value={videos} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={Layers} label="Course templates" value={templates.length} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Clock} label="Awaiting review" value={needsReview} tint={needsReview ? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'} />
      </div>

      <Tabs defaultValue="library">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="library">Content Library</TabsTrigger>
          <TabsTrigger value="templates">Courses &amp; Templates</TabsTrigger>
          <TabsTrigger value="assign">Assign to Partners</TabsTrigger>
        </TabsList>

        {/* ── Content Library ─────────────────────────────── */}
        <TabsContent value="library" className="mt-4 space-y-4">
          {/* Upload zone */}
          <Card
            className="border-dashed p-6 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <div className="flex flex-col items-center gap-2">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Upload className="h-6 w-6" /></span>
              <div className="text-sm font-medium">Upload videos, documents, images or SCORM packages</div>
              <div className="text-xs text-muted-foreground">Drag files here, or choose from your device. Videos are queued for the review gate before publishing.</div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Choose files</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setUrlKind('video'); setUrlOpen((v) => !v); }}><Video className="h-4 w-4" /> Add video URL</Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setUrlKind('link'); setUrlOpen((v) => !v); }}><Link2 className="h-4 w-4" /> Add link</Button>
              </div>
              {urlOpen && (
                <div className="mt-3 w-full max-w-lg space-y-2 text-left">
                  <input value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} placeholder="Title"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  <div className="flex gap-2">
                    <input value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder={urlKind === 'video' ? 'Video URL (e.g. Vimeo / YouTube / storage)' : 'URL'}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
                    <Button size="sm" className="gap-1.5" onClick={addUrl}><Check className="h-4 w-4" /> Add</Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Library list */}
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="text-left p-3">Item</th><th className="text-left p-3">Type</th><th className="text-left p-3">Details</th><th className="text-left p-3">Added</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {content.map((c) => {
                  const Icon = KIND_ICON[c.kind];
                  return (
                    <tr key={c.id} className="hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', KIND_TINT[c.kind])}><Icon className="h-4 w-4" /></span>
                          <span className="font-medium">{c.title}</span>
                        </div>
                      </td>
                      <td className="p-3 capitalize text-muted-foreground">{c.kind}</td>
                      <td className="p-3 text-muted-foreground">{c.meta}</td>
                      <td className="p-3 text-muted-foreground">{new Date(c.addedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                      <td className="p-3">
                        {c.reviewed
                          ? <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="h-3 w-3" /> Reviewed</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 gap-1"><Clock className="h-3 w-3" /> Needs review</Badge>}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        {!c.reviewed && <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => { markReviewed(c.id); flashMsg('Marked as reviewed.'); }}><Check className="h-3.5 w-3.5" /> Approve</Button>}
                        <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-red-600" onClick={() => removeContent(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ── Courses & Templates ─────────────────────────── */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">Reusable templates are the starting point for every partner course. Open the Course Development Suite to generate objectives and assessments from a description and your uploaded materials.</div>
          </Card>
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} t={t} assignedCount={partnersForCourse(t.id).length} onAssign={() => navigate('/learning?tab=assign')} />
            ))}
          </div>
        </TabsContent>

        {/* ── Assign to Partners ──────────────────────────── */}
        <TabsContent value="assign" className="mt-4 space-y-4">
          <Card className="p-4 flex items-start gap-3 text-sm border-dashed">
            <Building2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-muted-foreground">Tick a partner to grant them a course. Assigned courses appear in that partner's catalog for their organisations to deliver.</div>
          </Card>
          <div className="space-y-3">
            {templates.filter((t) => t.kind === 'course').map((t) => {
              const assigned = partnersForCourse(t.id);
              return (
                <Card key={t.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0"><GraduationCap className="h-5 w-5" /></span>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{t.title}</div>
                        <div className="text-xs text-muted-foreground">{t.level} · {t.modules} modules · {t.standard}</div>
                      </div>
                    </div>
                    <Badge variant="secondary">{assigned.length} of {partners.length} partners</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {partners.map((p) => {
                      const on = assigned.includes(p.id);
                      return (
                        <button key={p.id} onClick={() => toggleAssignment(t.id, p.id)}
                          className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            on ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'border-border bg-card text-muted-foreground hover:border-primary/40')}>
                          {on ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Bridge to the Course Development Suite (Phase 3) */}
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
          <div>
            <div className="text-sm font-semibold">Course Development Suite</div>
            <div className="text-xs text-muted-foreground">Generate learning objectives, assessments and interactive video from a description and your materials.</div>
          </div>
        </div>
        <Button className="gap-1.5" onClick={() => navigate('/learning/develop')}>Open suite <ArrowRight className="h-4 w-4" /></Button>
      </Card>
    </div>
  );
}

function TemplateCard({ t, assignedCount, onAssign }: { t: CourseTemplate; assignedCount: number; onAssign: () => void }) {
  const kindBadge = t.kind === 'course' ? 'bg-indigo-100 text-indigo-700' : t.kind === 'lesson' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700';
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold"><Layers className="h-4 w-4 text-primary" /> {t.title}</span>
        <Badge className={cn('capitalize', kindBadge)}>{t.kind}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t.description}</p>
      <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-muted-foreground">
        <span>Level: {t.level}</span>
        <span>Modality: {t.modality}</span>
        <span>{t.modules} modules · {t.hours}h</span>
        <span>{assignedCount} partner{assignedCount === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">Aligned: {t.standard}</div>
      {t.kind === 'course' && (
        <Button size="sm" variant="outline" className="mt-3 w-full gap-1.5" onClick={onAssign}><Building2 className="h-3.5 w-3.5" /> Assign to partners</Button>
      )}
    </div>
  );
}
