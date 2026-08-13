import React, { useState, useEffect } from 'react';
import { useParams, useSearch, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, API } from '@/lib/api';
import { BLOOM_LEVELS, bloomColor, generateObjectives, type BloomLevel } from '@/lib/courseDevEngine';
import { courseLevelLabel } from '@/lib/courseLevel';
import { personaByEmail } from '@/lib/k12Personas';
import { useGetMe } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  BookOpen, ClipboardList, MessageSquare, Megaphone, BarChart2,
  Calendar, FileText, Users, UsersRound, Plus, ChevronRight, ChevronLeft, ChevronDown, Pin,
  CheckCircle, Clock, AlertCircle, AlertTriangle, XCircle, Play, Target, Save, Pencil, PenTool, Trash2, Layers, Image as ImageIcon, Upload, Lightbulb,
  Bold, Italic, Underline, List, ListOrdered, Link2,
  Strikethrough, AlignLeft, AlignCenter, AlignRight, Eraser, Circle, Square, Star, Check
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ObjectivesEditor } from '@/components/ObjectivesEditor';
import { InteractiveVideoPlayer } from '@/components/InteractiveVideoPlayer';
import { ActivityPlayer } from '@/components/ActivityPlayer';
import { activitiesApi } from '@/lib/activitiesApi';
import { renderActivity, type InteractionType, type ActivitySpec } from '@/lib/activityTemplates';

/**
 * Shared shell for the small instructor "create X" forms on this page.
 *
 * These four controls (announcement, page, learner, group) all shipped as buttons with no
 * onClick -- they looked like features and did nothing. One shell keeps them consistent and
 * makes the next one cheap.
 */
function CreatePanel({ icon: Icon, title, open, onOpen, onCancel, onSubmit, submitLabel, busy, disabled, error, children }: {
  icon: React.ElementType;
  title: string;
  open: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  if (!open) {
    return (
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-2" onClick={onOpen}>
          <Plus className="h-4 w-4" /> {title}
        </Button>
      </div>
    );
  }
  return (
    <Card className="mb-4 border-dashed border-primary/30">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{title}</span>
        </div>
        {children}
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" disabled={disabled || busy} onClick={onSubmit}>
            {busy ? 'Saving...' : submitLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const fieldCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm';

/** Post an announcement. Notifies every enrolled learner, so it is staff-gated server-side. */
function NewAnnouncement({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '', pinned: false });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/announcements`, { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => { setOpen(false); setError(null); setF({ title: '', body: '', pinned: false });
      qc.invalidateQueries({ queryKey: ['announcements', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not post that announcement.'),
  });
  return (
    <CreatePanel icon={Megaphone} title="New Announcement" open={open}
      onOpen={() => setOpen(true)} onCancel={() => { setOpen(false); setError(null); }}
      onSubmit={() => m.mutate()} submitLabel="Post announcement" busy={m.isPending}
      disabled={!f.title.trim() || !f.body.trim()} error={error}>
      <input className={fieldCls} placeholder="Announcement title" value={f.title}
        onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
      <Textarea rows={4} className="text-sm resize-none" placeholder="What do your learners need to know?"
        value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.pinned} onChange={(e) => setF((p) => ({ ...p, pinned: e.target.checked }))} />
        Pin to the top
      </label>
      <p className="text-xs text-muted-foreground">Every enrolled learner is notified.</p>
    </CreatePanel>
  );
}

/** Create a course page. Slug is derived server-side from the title. */
function NewPage({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '', published: true });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/pages`, { method: 'POST', body: JSON.stringify(f) }),
    onSuccess: () => { setOpen(false); setError(null); setF({ title: '', body: '', published: true });
      qc.invalidateQueries({ queryKey: ['pages', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create that page.'),
  });
  return (
    <CreatePanel icon={FileText} title="New Page" open={open}
      onOpen={() => setOpen(true)} onCancel={() => { setOpen(false); setError(null); }}
      onSubmit={() => m.mutate()} submitLabel="Create page" busy={m.isPending}
      disabled={!f.title.trim()} error={error}>
      <input className={fieldCls} placeholder="Page title" value={f.title}
        onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
      <Textarea rows={6} className="text-sm resize-none" placeholder="Page content"
        value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.published} onChange={(e) => setF((p) => ({ ...p, published: e.target.checked }))} />
        Publish immediately
      </label>
    </CreatePanel>
  );
}

/** Create an assignment (deliverable) on this course. Staff-gated server-side. */
function NewAssignment({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', description: '', instructions: '', submissionType: 'text', pointsPossible: '100', dueDate: '', published: true });
  const [error, setError] = useState<string | null>(null);
  const reset = () => setF({ title: '', description: '', instructions: '', submissionType: 'text', pointsPossible: '100', dueDate: '', published: true });
  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({
        title: f.title.trim(),
        description: f.description.trim() || undefined,
        instructions: f.instructions.trim() || undefined,
        submissionType: f.submissionType,
        pointsPossible: Number(f.pointsPossible) || 0,
        dueDate: f.dueDate || undefined,
        published: f.published,
      }),
    }),
    onSuccess: () => { setOpen(false); setError(null); reset(); qc.invalidateQueries({ queryKey: ['assignments', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create that assignment.'),
  });
  return (
    <CreatePanel icon={ClipboardList} title="New Assignment" open={open}
      onOpen={() => setOpen(true)} onCancel={() => { setOpen(false); setError(null); }}
      onSubmit={() => m.mutate()} submitLabel="Create assignment" busy={m.isPending}
      disabled={!f.title.trim()} error={error}>
      <input className={fieldCls} placeholder="Assignment title" value={f.title}
        onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} />
      <Textarea rows={2} className="text-sm resize-none" placeholder="Short description"
        value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
      <Textarea rows={4} className="text-sm resize-none" placeholder="Instructions for learners"
        value={f.instructions} onChange={(e) => setF((p) => ({ ...p, instructions: e.target.value }))} />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs"><span className="mb-1 block text-muted-foreground">Submission</span>
          <select className={fieldCls} value={f.submissionType} onChange={(e) => setF((p) => ({ ...p, submissionType: e.target.value }))}>
            <option value="text">Text</option><option value="file">File</option><option value="url">Link</option>
          </select></label>
        <label className="text-xs"><span className="mb-1 block text-muted-foreground">Points</span>
          <input className={fieldCls} inputMode="numeric" value={f.pointsPossible}
            onChange={(e) => setF((p) => ({ ...p, pointsPossible: e.target.value.replace(/[^0-9]/g, '') }))} /></label>
        <label className="text-xs"><span className="mb-1 block text-muted-foreground">Due date</span>
          <input type="date" className={fieldCls} value={f.dueDate}
            onChange={(e) => setF((p) => ({ ...p, dueDate: e.target.value }))} /></label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.published} onChange={(e) => setF((p) => ({ ...p, published: e.target.checked }))} />
        Publish to learners immediately
      </label>
    </CreatePanel>
  );
}

/** Instructor row for an assignment: inline edit + delete against the real endpoints. */
function InstructorAssignmentCard({ courseId, a, onOpen }: { courseId: string; a: Assignment; onOpen: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: a.title, description: a.description ?? '', pointsPossible: String(a.pointsPossible), dueDate: a.dueDate ? a.dueDate.slice(0, 10) : '', published: a.published });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => apiFetch(`/assignments/${a.id}`, { method: 'PATCH', body: JSON.stringify({
      title: f.title.trim(), description: f.description.trim() || undefined,
      pointsPossible: Number(f.pointsPossible) || 0, dueDate: f.dueDate || undefined, published: f.published,
    }) }),
    onSuccess: () => { setEditing(false); setError(null); qc.invalidateQueries({ queryKey: ['assignments', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not save.'),
  });
  const del = useMutation({
    mutationFn: () => apiFetch(`/assignments/${a.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', courseId] }),
  });

  if (editing) {
    return (
      <Card className="border-dashed border-primary/30">
        <CardContent className="pt-5 space-y-3">
          <input className={fieldCls} value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="Title" />
          <Textarea rows={2} className="text-sm resize-none" value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">Points</span>
              <input className={fieldCls} inputMode="numeric" value={f.pointsPossible} onChange={(e) => setF((p) => ({ ...p, pointsPossible: e.target.value.replace(/[^0-9]/g, '') }))} /></label>
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">Due date</span>
              <input type="date" className={fieldCls} value={f.dueDate} onChange={(e) => setF((p) => ({ ...p, dueDate: e.target.value }))} /></label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.published} onChange={(e) => setF((p) => ({ ...p, published: e.target.checked }))} /> Published
          </label>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>
            <Button size="sm" disabled={save.isPending || !f.title.trim()} onClick={() => save.mutate()}>{save.isPending ? 'Saving...' : 'Save changes'}</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <button className="flex-1 min-w-0 text-left" onClick={onOpen}>
          <div className="font-medium text-foreground flex items-center gap-2">{a.title}{!a.published && <Badge variant="outline" className="text-[10px]">Draft</Badge>}</div>
          {a.description && <div className="text-sm text-muted-foreground truncate">{a.description}</div>}
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-muted-foreground">{a.pointsPossible} pts</span>
          {a.dueDate && <Badge variant={isOverdue(a.dueDate) ? 'destructive' : 'outline'} className="text-xs">{isOverdue(a.dueDate) ? 'OVERDUE' : formatDate(a.dueDate)}</Badge>}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-600" title="Delete"
            onClick={() => { if (window.confirm(`Delete "${a.title}"? This cannot be undone.`)) del.mutate(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Enrol a learner from the organisation onto this course.
 *
 * Picks from org members rather than accepting a raw id, and hides anyone already on the
 * roster so the obvious mistake (enrolling the same person twice) cannot be made from here.
 */
function AddLearner({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Candidates come from the COURSE's organisation, resolved server-side, with the
  // already-enrolled filtered out there too.
  const { data: candidates, isLoading } = useQuery({
    queryKey: ['enrolment-candidates', courseId],
    queryFn: () => apiFetch<{ id: string; firstName?: string; lastName?: string; role?: string }[]>(`/courses/${courseId}/enrolment-candidates`),
    enabled: open,
  });

  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/roster`, { method: 'POST', body: JSON.stringify({ userId, role: 'student' }) }),
    onSuccess: () => { setOpen(false); setError(null); setUserId('');
      qc.invalidateQueries({ queryKey: ['roster', courseId] });
      // Also refresh the candidate list, or enrolling two people in a row would still
      // offer the first one on the second attempt.
      qc.invalidateQueries({ queryKey: ['enrolment-candidates', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not enrol that learner.'),
  });

  return (
    <CreatePanel icon={Users} title="Add Learner" open={open}
      onOpen={() => setOpen(true)} onCancel={() => { setOpen(false); setError(null); }}
      onSubmit={() => m.mutate()} submitLabel="Enrol learner" busy={m.isPending}
      disabled={!userId} error={error}>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading members...</p>
      ) : (candidates ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Everyone in this course's organisation is already enrolled.
        </p>
      ) : (
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="text-sm"><SelectValue placeholder="Choose someone to enrol" /></SelectTrigger>
          <SelectContent>
            {(candidates ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.id}{u.role ? `, ${u.role}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </CreatePanel>
  );
}

/** Create a project/study group. This route was already staff-gated server-side. */
function NewGroup({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', description: '', maxMembers: 5 });
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/groups`, {
      method: 'POST',
      body: JSON.stringify({ name: f.name, description: f.description || null, maxMembers: Number(f.maxMembers) || null }),
    }),
    onSuccess: () => { setOpen(false); setError(null); setF({ name: '', description: '', maxMembers: 5 });
      qc.invalidateQueries({ queryKey: ['groups', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create that group.'),
  });
  return (
    <CreatePanel icon={UsersRound} title="New Group" open={open}
      onOpen={() => setOpen(true)} onCancel={() => { setOpen(false); setError(null); }}
      onSubmit={() => m.mutate()} submitLabel="Create group" busy={m.isPending}
      disabled={!f.name.trim()} error={error}>
      <input className={fieldCls} placeholder="Group name" value={f.name}
        onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))} />
      <input className={fieldCls} placeholder="What is this group for? (optional)" value={f.description}
        onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
      <div className="max-w-[180px]">
        <label className="text-xs text-muted-foreground">Maximum members</label>
        <input type="number" min={2} className={fieldCls} value={f.maxMembers}
          onChange={(e) => setF((p) => ({ ...p, maxMembers: Number(e.target.value) }))} />
      </div>
    </CreatePanel>
  );
}

/**
 * Create a discussion.
 *
 * The backend has supported this for a long time but no UI ever called it -- the New
 * Discussion button had no handler -- so AI facilitation and the participation rules were
 * unreachable except by hand-crafting an API call. This is that missing surface.
 *
 * Defaults match the standard ask (opening post 100-150 words, then four more of 50+),
 * but they are editable because a short reflection thread and a debate thread should not
 * carry the same bar.
 */
function NewDiscussion({ courseId, modules }: { courseId: string; modules: { id: string; title: string; order: number }[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: '', body: '', moduleId: 'course', language: 'en', aiFacilitated: true,
    minInitialWords: 100, maxInitialWords: 150, minReplyWords: 50, requiredInteractions: 5,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/discussions`, {
      method: 'POST',
      body: JSON.stringify({
        title: f.title,
        body: f.body,
        moduleId: f.moduleId === 'course' ? null : f.moduleId,
        language: f.language,
        aiFacilitated: f.aiFacilitated,
        requireInitialPost: true,
        minInitialWords: Number(f.minInitialWords),
        maxInitialWords: Number(f.maxInitialWords),
        minReplyWords: Number(f.minReplyWords),
        requiredInteractions: Number(f.requiredInteractions),
      }),
    }),
    onSuccess: () => {
      setOpen(false); setError(null);
      setF((p) => ({ ...p, title: '', body: '' }));
      qc.invalidateQueries({ queryKey: ['discussions', courseId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not create that discussion.'),
  });

  if (!open) {
    return (
      <div className="flex justify-end mb-4">
        <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Discussion
        </Button>
      </div>
    );
  }

  const ordered = modules.slice().sort((a, b) => a.order - b.order);
  return (
    <Card className="mb-4 border-dashed border-primary/30">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">New discussion</span>
        </div>

        <input
          value={f.title}
          onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))}
          placeholder="Discussion title"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div>
          <Textarea
            value={f.body}
            onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))}
            rows={4}
            placeholder="The prompt. Ask something that has more than one defensible answer -- a question with a single right answer produces five identical posts."
            className="text-sm resize-none"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Scope</label>
            <Select value={f.moduleId} onValueChange={(v) => setF((p) => ({ ...p, moduleId: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="course">Whole course</SelectItem>
                {ordered.map((m) => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Language</label>
            <Select value={f.language} onValueChange={(v) => setF((p) => ({ ...p, language: v }))}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zu">isiZulu</SelectItem>
                <SelectItem value="xh">isiXhosa</SelectItem>
                <SelectItem value="af">Afrikaans</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={f.aiFacilitated}
            onChange={(e) => setF((p) => ({ ...p, aiFacilitated: e.target.checked }))}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium">AI facilitation</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              After each learner contribution the facilitator asks one prodding question built on what
              was actually written. It never answers or resolves the debate.
            </span>
          </span>
        </label>

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Participation requirement</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ['Opening min', 'minInitialWords'],
              ['Opening max', 'maxInitialWords'],
              ['Reply min', 'minReplyWords'],
              ['Contributions', 'requiredInteractions'],
            ] as const).map(([label, key]) => (
              <div key={key}>
                <label className="text-xs text-muted-foreground">{label}</label>
                <input
                  type="number" min={1}
                  value={f[key]}
                  onChange={(e) => setF((p) => ({ ...p, [key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Enforced when a learner posts, not just shown in the composer.
          </p>
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          <Button size="sm" disabled={!f.title.trim() || !f.body.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating...' : 'Create discussion'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Types ---
interface Course { id: string; title: string; description: string; status: string; competencyTags: string[]; nqfLevel?: number; objectives?: string[]; thumbnailUrl?: string; catalogDescription?: string; }
interface Module { id: string; courseId: string; title: string; description?: string; order: number; status: string; lessonType?: string; estimatedMinutes: number; beatCount: number; beats?: Beat[]; }
interface Beat { id: string; type: string; title: string; order: number; videoUrl?: string; narration?: string | null; bulletPoints?: string[] | null; scenario?: string | null; }
interface Assignment { id: string; title: string; description?: string; dueDate?: string; pointsPossible: number; published: boolean; }
interface Discussion { id: string; title: string; body: string; isPinned?: boolean; replyCount: number; createdAt: string; author?: { firstName: string; lastName: string; }; }
interface Announcement { id: string; title: string; body: string; pinned?: boolean; createdAt: string; author?: { firstName: string; lastName: string; }; }
interface GradeEntry { assignmentId: string; assignmentTitle: string; dueDate?: string; pointsPossible: number; score: number | null; letterGrade?: string; missing: boolean; late: boolean; }
interface RosterEntry { enrolmentId: string; user: { id: string; firstName: string; lastName: string; email: string | null; role?: string; }; enrolmentStatus: string; }
interface Group { id: string; name: string; description?: string; members: { userId: string; role: string; user: { firstName: string; lastName: string; }; }[]; }
interface Page { id: string; title: string; slug: string; body: string; published: boolean; updatedAt: string; frontPage?: boolean; author?: { firstName: string; lastName: string; }; }
interface Event { id: string; title: string; type: string; startDate: string; color?: string; linkedAssignmentId?: string; }
interface Enrolment { id: string; status: string; }
interface ModuleProgress { moduleId: string; title: string; order: number; viewedBeats: number; totalBeats: number; percent: number; complete: boolean; certified?: boolean; }
interface CourseProgress { courseId: string; viewedBeats: number; totalBeats: number; percent: number; certified?: boolean; modules: ModuleProgress[]; }

interface CourseActivity { id: string; title: string; kind: string; published: boolean; courseId?: string | null; moduleId?: string | null; bloomsLevel?: string | null; difficulty?: string | null; html?: string; embedUrl?: string | null; }

/** Deterministic string hash (djb2), so a given course title always yields the same banner. */
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * A calm, themed gradient derived from the course title, used when no banner image is set.
 * Two HSL hues + an angle come from the title hash, with a couple of soft radial highlights
 * layered on top so the placeholder banner has some depth instead of a flat wash.
 */
function bannerGradientStyle(title: string): React.CSSProperties {
  const h = hashString(title || 'course');
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 3) % 60)) % 360;
  const angle = (h >> 5) % 360;
  const base = `linear-gradient(${angle}deg, hsl(${hue1} 55% 42%), hsl(${hue2} 60% 34%))`;
  const dot1 = `radial-gradient(circle at ${20 + (h % 30)}% 30%, hsl(${hue1} 70% 70% / 0.35), transparent 45%)`;
  const dot2 = `radial-gradient(circle at ${70 + ((h >> 7) % 20)}% 75%, hsl(${hue2} 70% 70% / 0.30), transparent 50%)`;
  return { backgroundImage: `${dot1}, ${dot2}, ${base}` };
}

/** In-course Interactives: list activities linked to this course, attach existing ones, or author new. */
function CourseActivitiesTab({ courseId, isInstructor }: { courseId: string; isInstructor: boolean }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const { data: attached, isLoading } = useQuery({ queryKey: ['course-activities', courseId], queryFn: () => apiFetch<CourseActivity[]>(`/activities?courseId=${courseId}`) });
  const { data: allActs } = useQuery({ queryKey: ['all-activities'], queryFn: () => apiFetch<CourseActivity[]>(`/activities`), enabled: attachOpen });

  const attach = useMutation({
    mutationFn: (id: string) => apiFetch(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify({ courseId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-activities', courseId] }); qc.invalidateQueries({ queryKey: ['all-activities'] }); },
  });
  const detach = useMutation({
    mutationFn: (id: string) => apiFetch(`/activities/${id}`, { method: 'PATCH', body: JSON.stringify({ courseId: null, moduleId: null }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-activities', courseId] }),
  });
  const candidates = (allActs || []).filter((a) => a.courseId !== courseId);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const markComplete = (id: string) => setCompleted((s) => { const n = new Set(s); n.add(id); return n; });

  return (
    <div className="space-y-3">
      {isInstructor && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAttachOpen((v) => !v)}><Plus className="h-4 w-4" /> Attach existing</Button>
          <Button size="sm" className="gap-1.5" onClick={() => navigate(`/activities?courseId=${courseId}`)}><Play className="h-4 w-4" /> New interactive</Button>
        </div>
      )}

      {isInstructor && attachOpen && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-5 space-y-2">
            <div className="text-sm font-semibold">Attach an existing activity to this course</div>
            {candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground">No unattached activities available. Create one with "New interactive".</div>
            ) : (
              <div className="max-h-64 overflow-auto divide-y divide-border">
                {candidates.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{a.title}</div><div className="text-xs text-muted-foreground capitalize">{a.kind}{a.courseId ? ' · linked to another course' : ' · library'}</div></div>
                    <Button size="sm" variant="outline" disabled={attach.isPending} onClick={() => attach.mutate(a.id)}>Attach</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {attached?.length === 0 && !isLoading && (
        <div className="text-center text-muted-foreground py-12">No interactives on this course yet.{isInstructor && ' Attach an existing one or create a new interactive.'}</div>
      )}
      {attached?.map((a) => {
        const isDone = completed.has(a.id);
        return (
          <Card key={a.id}>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium text-foreground flex flex-wrap items-center gap-2">
                    {a.title}
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1"><CheckCircle className="h-3 w-3" /> Attached</Badge>
                    {isDone && <Badge className="bg-blue-100 text-blue-700 text-[10px] gap-1"><CheckCircle className="h-3 w-3" /> Completed</Badge>}
                    {!a.published && <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize flex flex-wrap gap-2 mt-0.5">
                    <span>{a.kind}</span>
                    {a.bloomsLevel && <span className="text-purple-600">{a.bloomsLevel}</span>}
                    {a.difficulty && <span>{a.difficulty}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/activities/${a.id}/play`)}><Play className="h-3.5 w-3.5 mr-1.5" /> Full screen</Button>
                  {isInstructor && (
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-red-600" title="Remove from course"
                      onClick={() => { if (window.confirm(`Remove "${a.title}" from this course? The activity itself is not deleted.`)) detach.mutate(a.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {/* Embedded and ready to use: the interactive activity runs right here in the course. */}
              <div className="rounded-lg border border-border overflow-hidden">
                <ActivityPlayer html={a.html ?? ''} embedUrl={a.embedUrl ?? null} onSubmit={() => markComplete(a.id)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface CourseCase { itemId: string; caseId: string; title: string; status?: string | null; }
interface LibraryCase { id: string; title: string; status?: string; }

/** In-course Case studies: list cases attached to this course (via gradebook), attach or author. */
function CourseCasesTab({ courseId, isInstructor }: { courseId: string; isInstructor: boolean }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [attachOpen, setAttachOpen] = useState(false);
  const { data: attached, isLoading } = useQuery({ queryKey: ['course-cases', courseId], queryFn: () => apiFetch<CourseCase[]>(`/courses/${courseId}/cases`) });
  const { data: allCases } = useQuery({ queryKey: ['all-cases'], queryFn: () => apiFetch<LibraryCase[]>(`/cases`), enabled: attachOpen });

  const attach = useMutation({
    mutationFn: (caseId: string) => apiFetch(`/courses/${courseId}/gradebook-items`, { method: 'POST', body: JSON.stringify({ sourceType: 'case', sourceId: caseId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-cases', courseId] }),
  });
  const detach = useMutation({
    mutationFn: (itemId: string) => apiFetch(`/gradebook-items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-cases', courseId] }),
  });
  const attachedIds = new Set((attached || []).map((a) => a.caseId));
  const candidates = (allCases || []).filter((c) => !attachedIds.has(c.id));

  return (
    <div className="space-y-3">
      {isInstructor && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAttachOpen((v) => !v)}><Plus className="h-4 w-4" /> Attach existing</Button>
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/cases')}><FileText className="h-4 w-4" /> New case study</Button>
        </div>
      )}

      {isInstructor && attachOpen && (
        <Card className="border-dashed border-primary/30">
          <CardContent className="pt-5 space-y-2">
            <div className="text-sm font-semibold">Attach an existing case study to this course</div>
            {candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground">No unattached case studies available. Author one with "New case study".</div>
            ) : (
              <div className="max-h-64 overflow-auto divide-y divide-border">
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0"><div className="text-sm font-medium truncate">{c.title}</div>{c.status && <div className="text-xs text-muted-foreground capitalize">{c.status}</div>}</div>
                    <Button size="sm" variant="outline" disabled={attach.isPending} onClick={() => attach.mutate(c.id)}>Attach</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {attached?.length === 0 && !isLoading && (
        <div className="text-center text-muted-foreground py-12">No case studies on this course yet.{isInstructor && ' Attach an existing one or author a new case study.'}</div>
      )}
      {attached?.map((c) => {
        const isDraft = c.status && c.status !== 'published';
        return (
          <Card key={c.itemId} className="overflow-hidden">
            <div className="flex items-center gap-2 bg-amber-500/10 px-5 py-2.5 border-b border-amber-200/60">
              <MessageSquare className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-sm">{c.title}</span>
              <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1 ml-1"><CheckCircle className="h-3 w-3" /> Attached</Badge>
              {isDraft && <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>}
              {isInstructor && (
                <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground hover:text-red-600 h-7" title="Remove from course"
                  onClick={() => { if (window.confirm(`Remove "${c.title}" from this course? The case itself is not deleted.`)) detach.mutate(c.itemId); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground max-w-md">
                Interactive Socratic case study, graded on this course. {isDraft ? 'Publish the case to let learners start it.' : 'Start to work through the scenario with guided questioning.'}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button size="sm" disabled={!!isDraft} onClick={() => navigate(`/cases/${c.caseId}/begin`)}><Play className="h-3.5 w-3.5 mr-1.5" /> Start case</Button>
                {isInstructor && (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/cases/${c.caseId}/edit`)}><PenTool className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'build', label: 'Build', icon: PenTool },
  { id: 'modules', label: 'Modules', icon: BookOpen },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList },
  { id: 'activities', label: 'Activities', icon: Play },
  { id: 'cases', label: 'Case studies', icon: FileText },
  { id: 'discussions', label: 'Discussions', icon: MessageSquare },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'gradebook', label: 'Gradebook', icon: BarChart2 },
  { id: 'alignment', label: 'Alignment', icon: Target },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'people', label: 'People', icon: Users },
  { id: 'groups', label: 'Groups', icon: UsersRound },
];

function parseMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\| (.+) \|$/gm, (m) => {
      const cells = m.split('|').filter(Boolean).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td class="border border-border px-3 py-1.5 text-sm">${c}</td>`).join('') + '</tr>';
    })
    .replace(/\n/g, '<br/>');
}

function formatDate(d?: string) {
  if (!d) return ', ';
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

// Month-grid calendar view. A real month layout (Mon-start) with events placed on their
// day, plus prev/next navigation. Complements the flat List view. `compact` renders a
// smaller grid with event dots (for the narrow sidebar).
function MonthGrid({ events, cursor, onCursor, compact = false }: {
  events: Event[];
  cursor: Date;
  onCursor: (d: Date) => void;
  compact?: boolean;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay: Record<number, Event[]> = {};
  events.forEach((e) => {
    const dt = new Date(e.startDate);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      (byDay[dt.getDate()] ??= []).push(e);
    }
  });

  const today = new Date();
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onCursor(new Date(year, month - 1, 1))}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
          {cursor.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
        </span>
        <button
          onClick={() => onCursor(new Date(year, month + 1, 1))}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted/50"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
        {(compact ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((d, idx) => (
          <div key={idx} className={cn('bg-muted/50 text-center font-semibold text-muted-foreground', compact ? 'py-1 text-[9px]' : 'py-1.5 text-[11px]')}>{d}</div>
        ))}
        {cells.map((d, i) => (
          <div key={i} className={cn('bg-card', compact ? 'min-h-[44px] p-1' : 'min-h-[84px] p-1.5', !d && 'bg-muted/20')}>
            {d && (
              <>
                <div className={cn(compact ? 'text-[10px]' : 'text-xs mb-1', isToday(d) ? 'font-bold text-primary' : 'text-muted-foreground')}>
                  {d}
                </div>
                {compact ? (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {(byDay[d] ?? []).slice(0, 3).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: e.color ?? '#6366f1' }} title={`${e.title} (${e.type.replace('_', ' ')})`} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(byDay[d] ?? []).slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className="text-[10px] leading-tight rounded px-1 py-0.5 truncate text-white"
                        style={{ backgroundColor: e.color ?? '#6366f1' }}
                        title={`${e.title} (${e.type.replace('_', ' ')})`}
                      >
                        {e.title}
                      </div>
                    ))}
                    {(byDay[d] ?? []).length > 3 && (
                      <div className="text-[10px] text-muted-foreground">+{(byDay[d]?.length ?? 0) - 3} more</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Instructor-only editor for course-level learning objectives. Self-contained draft +
// dirty tracking; the parent supplies the initial value and the save handler. Keying the
// element by the saved value (see usage) resets the draft after a successful save.
/** Instructor: edit core course metadata (title, description, NQF level, published status). */
function CourseSettingsCard({ course, saving, onSave }: {
  course: { title: string; description?: string; nqfLevel?: number | null; status?: string };
  saving: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: course.title ?? '', description: course.description ?? '',
    nqfLevel: course.nqfLevel != null ? String(course.nqfLevel) : '', status: course.status ?? 'draft',
  });
  if (!open) {
    return (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="font-serif font-semibold">{course.title || 'Untitled course'}</div>
              {course.description
                ? <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl whitespace-pre-line">{course.description}</p>
                : <p className="text-sm text-muted-foreground italic">No description yet.</p>}
              <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                {course.nqfLevel != null && <span className="rounded-full border border-border px-2 py-0.5">NQF {course.nqfLevel}</span>}
                <span className="rounded-full border border-border px-2 py-0.5 capitalize">{course.status ?? 'draft'}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /> Edit course</Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-dashed border-primary/30">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" /><span className="font-semibold text-sm">Course settings</span></div>
        <label className="text-xs block"><span className="mb-1 block text-muted-foreground">Title</span>
          <input className={fieldCls} value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} /></label>
        <label className="text-xs block"><span className="mb-1 block text-muted-foreground">Description</span>
          <Textarea rows={3} className="text-sm resize-none" value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></label>
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">NQF level</span>
            <input className={fieldCls} inputMode="numeric" value={f.nqfLevel} onChange={(e) => setF((p) => ({ ...p, nqfLevel: e.target.value.replace(/[^0-9]/g, '') }))} /></label>
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Status</span>
            <select className={fieldCls} value={f.status} onChange={(e) => setF((p) => ({ ...p, status: e.target.value }))}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select></label>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={saving || !f.title.trim()} onClick={() => { onSave({ title: f.title.trim(), description: f.description.trim(), nqfLevel: f.nqfLevel ? Number(f.nqfLevel) : null, status: f.status }); setOpen(false); }}>
            {saving ? 'Saving...' : 'Save course'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Super-admin only: courses belong to the platform and are assigned OUT to partners here.
// A partner's admins/coaches then see and deliver the courses assigned to their partner.
function AssignPartnersCard({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const { data: partners, isLoading } = useQuery({
    queryKey: ['all-partners'],
    queryFn: () => apiFetch<{ id: string; name: string; status?: string }[]>(`/partners`),
  });
  const { data: current } = useQuery({
    queryKey: ['course-partners', courseId],
    queryFn: () => apiFetch<{ partnerIds: string[] }>(`/courses/${courseId}/partners`),
  });
  const [sel, setSel] = useState<Set<string> | null>(null);
  const chosen = sel ?? new Set(current?.partnerIds ?? []);
  const dirty = sel !== null;
  const toggle = (id: string) => {
    const n = new Set(chosen);
    n.has(id) ? n.delete(id) : n.add(id);
    setSel(n);
  };
  const save = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/partners`, { method: 'PUT', body: JSON.stringify({ partnerIds: [...chosen] }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-partners', courseId] }); setSel(null); },
  });
  // Collapsed by default: assigning to partners is the final publish step, not something you set
  // up mid-build, so it stays out of the way until you open it.
  const [open, setOpen] = useState(false);
  const assignedCount = current?.partnerIds?.length ?? 0;
  return (
    <Card className="border-dashed border-primary/30">
      <CardHeader className="pb-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
          <Layers className="h-4 w-4 text-primary flex-shrink-0" />
          <CardTitle className="text-base">Assign to partners</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">{assignedCount > 0 ? `${assignedCount} assigned` : 'Final step'}</span>
        </button>
        {open && <p className="mt-1 text-xs text-muted-foreground">This course belongs to the platform. Choose which partners can see and deliver it. Do this once the course is built.</p>}
      </CardHeader>
      {open && (
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading partners...</p>
        ) : !partners?.length ? (
          <p className="text-xs text-muted-foreground">No partners yet. Create a partner first, then assign this course to it.</p>
        ) : (
          <div className="space-y-1">
            {partners.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted/50">
                <input type="checkbox" className="h-4 w-4" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-medium">{p.name}</span>
                {p.status && <Badge variant="outline" className="text-[10px] ml-auto capitalize">{p.status}</Badge>}
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {dirty && <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Reset</Button>}
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving...' : 'Save assignments'}</Button>
        </div>
      </CardContent>
      )}
    </Card>
  );
}

const DEFAULT_BLOOM: BloomLevel[] = ['Understand', 'Apply', 'Analyze'];

function CourseObjectivesCard({ initial, saving, onSave, title, description }: {
  initial: string[];
  saving: boolean;
  onSave: (objectives: string[]) => void;
  title: string;
  description?: string;
}) {
  const [draft, setDraft] = useState<string[]>(initial.length ? initial : ['']);
  const [genOpen, setGenOpen] = useState(false);
  // Collapsed by default once objectives exist, so a long list does not dominate the build page.
  // Empty starts expanded so a new course prompts you to add them.
  const [open, setOpen] = useState(initial.length === 0);
  const [levels, setLevels] = useState<BloomLevel[]>(DEFAULT_BLOOM);
  const clean = draft.map((s) => s.trim()).filter(Boolean);
  const dirty = JSON.stringify(clean) !== JSON.stringify(initial);
  const toggleLevel = (l: BloomLevel) =>
    setLevels((p) => (p.includes(l) ? p.filter((x) => x !== l) : [...p, l]));
  const generate = () => {
    // Rules-based Bloom's engine: one measurable objective per chosen cognitive level,
    // seeded from the course title/description. Appended to the draft for review, the ID
    // edits and Saves; nothing is written until Save objectives.
    const gen = generateObjectives(title, description ?? '', BLOOM_LEVELS.filter((l) => levels.includes(l)));
    const existing = new Set(clean.map((s) => s.toLowerCase()));
    const additions = gen.map((o) => o.text).filter((t) => !existing.has(t.toLowerCase()));
    if (additions.length) setDraft([...clean, ...additions]);
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-start gap-2 text-left min-w-0">
            {open ? <ChevronDown className="h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <CardTitle className="text-base">
                Course learning objectives
                {!open && clean.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({clean.length})</span>}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Shown to learners on the course overview.</p>
            </div>
          </button>
          {open && (
            <Button size="sm" variant="outline" className="gap-1.5 flex-shrink-0" onClick={() => setGenOpen((o) => !o)}>
              Generate
            </Button>
          )}
        </div>
      </CardHeader>
      {open && (
      <CardContent className="space-y-3">
        {genOpen && (
          <div className="rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] p-3 space-y-2.5">
            <p className="text-xs text-muted-foreground">Pick the cognitive levels (Bloom's Taxonomy). One measurable objective is drafted per level from the course title and description, then added below for you to edit.</p>
            <div className="flex flex-wrap gap-1.5">
              {BLOOM_LEVELS.map((l) => {
                const on = levels.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => toggleLevel(l)}
                    className={cn(
                      'text-xs rounded-full px-2.5 py-1 border transition-colors',
                      on ? bloomColor(l) : 'text-muted-foreground border-border hover:bg-muted',
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="gap-1.5" disabled={!levels.length} onClick={generate}>
                Generate objectives
              </Button>
            </div>
          </div>
        )}
        <ObjectivesEditor value={draft} onChange={setDraft} />
        <div className="flex justify-end">
          <Button size="sm" disabled={!dirty || saving} onClick={() => onSave(clean)}>
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving...' : 'Save objectives'}
          </Button>
        </div>
      </CardContent>
      )}
    </Card>
  );
}

// ---- AI course architect ------------------------------------------------------------------
// "The material defines everything." The author pastes or uploads source content; an expert
// instructional-designer persona proposes a full blueprint (objectives, modules with per-section
// plans, suggested videos, gap analysis). Nothing is written until the author approves, then it
// scaffolds real modules.
type ArchitectSections = { reading: string | null; lecture: string | null; activity: string | null; caseStudy: string | null; assessment: string | null };
type ArchitectModule = { title: string; overview: string; objectives: string[]; sections: ArchitectSections; sourceMapping: string; suggestedVideo: string; summary: string };
type Blueprint = { courseDescription?: string; catalogDescription?: string; courseObjectives: string[]; modules: ArchitectModule[]; gaps: { gap: string; suggestion: string }[]; flowNote: string };

function CourseArchitect({ courseId, onScaffolded, defaultOpen = false }: { courseId: string; onScaffolded: () => void; defaultOpen?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const cardRef = React.useRef<HTMLDivElement>(null);
  // When launched straight from "Create course", open and scroll the upload panel into view so
  // adding course materials is the obvious first step.
  useEffect(() => {
    if (defaultOpen) {
      const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
      return () => clearTimeout(t);
    }
  }, [defaultOpen]);
  // Restore a previously generated blueprint so it is not lost when the author navigates away and
  // comes back before applying it.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await apiFetch<{ blueprint: Blueprint | null }>(`/courses/${courseId}/architect/blueprint`);
        if (!cancel && r.blueprint && (r.blueprint.modules?.length ?? 0) > 0) { setPlan(r.blueprint); setOpen(true); void fillCourseFromBlueprint(r.blueprint); }
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [courseId]);
  const discard = async () => {
    try { await apiFetch(`/courses/${courseId}/architect/blueprint`, { method: 'DELETE' }); } catch { /* ignore */ }
    setPlan(null); setSkip(new Set());
  };

  // Populate the real course fields from a blueprint, filling only the ones the author has not
  // already written, then refresh the course so the Course details and objectives cards update.
  const fillCourseFromBlueprint = async (bp: Blueprint) => {
    try {
      const cur = await apiFetch<{ description?: string; catalogDescription?: string; objectives?: string[] }>(`/courses/${courseId}`);
      const patch: Record<string, unknown> = {};
      if (!(cur.description ?? '').trim() && bp.courseDescription) patch.description = bp.courseDescription;
      if (!(cur.catalogDescription ?? '').trim() && bp.catalogDescription) patch.catalogDescription = bp.catalogDescription;
      if ((!cur.objectives || cur.objectives.length === 0) && bp.courseObjectives.length) patch.objectives = bp.courseObjectives;
      if (Object.keys(patch).length) await apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await qc.invalidateQueries({ queryKey: ['course', courseId] });
    } catch { /* ignore */ }
  };
  const [content, setContent] = useState('');
  const [guidance, setGuidance] = useState('');
  const [fileBusy, setFileBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Blueprint | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const fileRef = React.useRef<HTMLInputElement>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileBusy(true); setError(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
        r.onerror = () => reject(new Error('Could not read that file.'));
        r.readAsDataURL(file);
      });
      const r = await apiFetch<{ text: string }>('/activities/extract', { method: 'POST', body: JSON.stringify({ filename: file.name, dataBase64 }) });
      setContent((c) => (c ? `${c}\n\n` : '') + (r.text ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setFileBusy(false);
    }
  };

  const analyze = async () => {
    setAnalyzing(true); setError(null); setPlan(null); setSkip(new Set()); setProgress('Starting');
    // The architect runs as a background job so even very large documents are read in full (in
    // chunks) without hitting a request timeout. Start the job, then poll for progress.
    try {
      const { jobId } = await apiFetch<{ jobId: string }>(`/courses/${courseId}/architect`, {
        method: 'POST',
        body: JSON.stringify({ materialText: content.slice(0, 300000), guidance }),
      });
      const started = Date.now();
      // Poll until done/error, up to 12 minutes.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - started > 12 * 60 * 1000) throw new Error('This is taking longer than expected. Please try again with less material.');
        await new Promise((r) => setTimeout(r, 3000));
        const s = await apiFetch<{ status: string; phase?: string; step?: number; totalSteps?: number; result?: Blueprint; error?: string }>(
          `/courses/${courseId}/architect/jobs/${jobId}`,
        );
        if (s.phase) setProgress(s.totalSteps && s.totalSteps > 1 ? `${s.phase} (${Math.min((s.step ?? 0) + 1, s.totalSteps)}/${s.totalSteps})` : s.phase);
        if (s.status === 'done' && s.result) {
          // Fill the real course fields (description, catalogue blurb, objectives) from the design.
          await fillCourseFromBlueprint(s.result);
          // For a fresh course (no modules yet), build the modules automatically so the whole course
          // is populated in one step. If modules already exist, show the review to add selectively.
          let autoBuilt = false;
          try {
            const mods = await apiFetch<unknown[]>(`/courses/${courseId}/modules`);
            if ((mods?.length ?? 0) === 0 && s.result.modules.length > 0) {
              await apiFetch(`/courses/${courseId}/architect/apply`, {
                method: 'POST',
                body: JSON.stringify({
                  modules: s.result.modules,
                  courseObjectives: s.result.courseObjectives,
                  courseDescription: s.result.courseDescription,
                  catalogDescription: s.result.catalogDescription,
                }),
              });
              await qc.invalidateQueries({ queryKey: ['modules', courseId] });
              await qc.invalidateQueries({ queryKey: ['course', courseId] });
              autoBuilt = true;
            }
          } catch { /* fall back to the review */ }
          if (autoBuilt) { setPlan(null); setContent(''); setOpen(false); onScaffolded(); }
          else setPlan(s.result);
          break;
        }
        if (s.status === 'error') throw new Error(s.error || 'The architect could not analyse that content.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The architect could not analyse that content.');
    } finally {
      setAnalyzing(false); setProgress('');
    }
  };

  const apply = async () => {
    if (!plan) return;
    const modules = plan.modules.filter((_, i) => !skip.has(i));
    if (modules.length === 0) { setError('Select at least one module to create.'); return; }
    setApplying(true); setError(null);
    try {
      await apiFetch(`/courses/${courseId}/architect/apply`, {
        method: 'POST',
        body: JSON.stringify({
          modules,
          courseObjectives: plan.courseObjectives,
          courseDescription: plan.courseDescription,
          catalogDescription: plan.catalogDescription,
        }),
      });
      await qc.invalidateQueries({ queryKey: ['modules', courseId] });
      await qc.invalidateQueries({ queryKey: ['course', courseId] });
      setPlan(null); setContent(''); setGuidance(''); setOpen(false);
      onScaffolded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the modules.');
    } finally {
      setApplying(false);
    }
  };

  const toggleSkip = (i: number) => setSkip((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const sectionLabels: [keyof ArchitectSections, string][] = [
    ['reading', 'Reading'], ['lecture', 'Lecture'], ['activity', 'Activity'], ['caseStudy', 'Case study'], ['assessment', 'Assessment'],
  ];

  return (
    <Card ref={cardRef} className="border-primary/30 scroll-mt-24">
      <CardHeader className="pb-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground" />}
          <FileText className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <CardTitle className="text-base">Build from content</CardTitle>
            <p className="text-xs text-muted-foreground">Paste or upload your material. The AI designs the modules, objectives, and structure from it.</p>
          </div>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {!plan && (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                placeholder="Paste the source material here: a syllabus, lecture notes, a chapter, a transcript, anything the course should be built from."
              />
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" className="hidden" onChange={onPickFile}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv" />
                <Button size="sm" variant="outline" className="gap-1.5" disabled={fileBusy} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {fileBusy ? 'Reading file...' : 'Upload a file'}
                </Button>
                <span className="text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, or text. Adds to the box above.</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Guidance for the architect (optional)</label>
                <Input value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="e.g. audience is first-year students; keep it to 5 modules; emphasise practical application." />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {content.trim().length > 0 && `${content.trim().length.toLocaleString()} characters`}
                  {content.length > 300000 && ' · only the first 300,000 are used'}
                </p>
                <Button size="sm" disabled={analyzing || content.trim().length < 80} onClick={analyze}>
                  {analyzing ? (progress || 'Designing the course...') : 'Design the course'}
                </Button>
              </div>
              {analyzing && (
                <p className="text-xs text-muted-foreground text-right">Reading your whole document. Large files can take a few minutes, you can keep this open.</p>
              )}
              {content.trim().length > 0 && content.trim().length < 80 && (
                <p className="text-xs text-muted-foreground text-right">Add a bit more content to analyse.</p>
              )}
            </>
          )}

          {plan && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                The course description and objectives have been filled in on the course. This course already has modules, so choose which of these to add.
              </p>

              {/* Flow note */}
              {plan.flowNote && (
                <div className="rounded-lg bg-primary/[0.04] border border-primary/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Learning arc</p>
                  <p className="text-sm text-foreground">{plan.flowNote}</p>
                </div>
              )}

              {/* Proposed modules */}
              <div>
                <p className="text-sm font-medium mb-2">Proposed modules ({plan.modules.length - skip.size} of {plan.modules.length} selected)</p>
                <div className="space-y-3">
                  {plan.modules.map((m, i) => {
                    const off = skip.has(i);
                    return (
                      <div key={i} className={cn('rounded-lg border p-3 transition-opacity', off ? 'opacity-45 border-border' : 'border-primary/30')}>
                        <div className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1 h-4 w-4" checked={!off} onChange={() => toggleSkip(i)} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground">{i + 1}. {m.title}</p>
                            {m.overview && <p className="text-sm text-muted-foreground mt-0.5">{m.overview}</p>}
                            {m.objectives.length > 0 && (
                              <ul className="mt-2 space-y-0.5">
                                {m.objectives.map((o, k) => (
                                  <li key={k} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <Target className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />{o}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {sectionLabels.filter(([k]) => m.sections[k]).map(([k, label]) => (
                                <span key={k} title={m.sections[k] ?? ''} className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground">{label}</span>
                              ))}
                            </div>
                            {m.suggestedVideo && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Video idea:</span> {m.suggestedVideo}</p>}
                            {m.summary && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">Summary:</span> {m.summary}</p>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Gaps */}
              {plan.gaps.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">
                    <Lightbulb className="h-3.5 w-3.5" /> Gaps to fill
                  </p>
                  <ul className="space-y-2">
                    {plan.gaps.map((g, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium text-foreground">{g.gap}</span>
                        <span className="text-muted-foreground"> {g.suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <p className="text-sm text-rose-600">{error}</p>}
              <p className="text-xs text-muted-foreground">This design is saved. You can leave and come back to it before applying.</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" disabled={applying} onClick={() => setPlan(null)}>Back to content</Button>
                  <Button size="sm" variant="ghost" disabled={applying} className="text-muted-foreground hover:text-rose-600" onClick={discard}>Discard</Button>
                </div>
                <Button size="sm" disabled={applying} onClick={apply}>
                  {applying ? 'Creating modules...' : `Create ${plan.modules.length - skip.size} module${plan.modules.length - skip.size === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const LESSON_TYPE_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  socratic: { icon: MessageSquare, label: 'Socratic',   color: 'text-violet-600' },
  video:    { icon: Play,          label: 'Video',      color: 'text-blue-600'   },
  slides:   { icon: BookOpen,      label: 'Slides',     color: 'text-emerald-600'},
  quiz:     { icon: ClipboardList, label: 'Quiz',       color: 'text-amber-600'  },
};

function ModuleRow({ mod, canEdit = false, prev, next, index }: { mod: Module; canEdit?: boolean; prev?: Module; next?: Module; index?: number }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const isEmpty = mod.beatCount === 0;
  // Instructors can open a module even when it has no content yet, so they can go add some.
  const canOpen = !isEmpty || canEdit;
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(mod.title);
  const refresh = () => qc.invalidateQueries({ queryKey: ['modules', mod.courseId] });

  const del = useMutation({
    mutationFn: () => apiFetch(`/modules/${mod.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not delete that module.'),
  });
  const rename = useMutation({
    mutationFn: (title: string) => apiFetch(`/modules/${mod.id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    onSuccess: () => { setRenaming(false); refresh(); },
  });
  // Reorder by swapping this module's order with a neighbour's, so the list stays contiguous.
  const swap = useMutation({
    mutationFn: async (other: Module) => {
      await apiFetch(`/modules/${mod.id}`, { method: 'PATCH', body: JSON.stringify({ order: other.order }) });
      await apiFetch(`/modules/${other.id}`, { method: 'PATCH', body: JSON.stringify({ order: mod.order }) });
    },
    onSuccess: refresh,
  });
  const busy = swap.isPending || rename.isPending;

  return (
    <Card
      className={cn(
        'transition-shadow',
        canOpen && !renaming && 'hover:shadow-md cursor-pointer',
        isEmpty && 'opacity-60',
      )}
      onClick={() => canOpen && !renaming && navigate(`/courses/${mod.courseId}/modules/${mod.id}`)}
    >
      <CardHeader>
        <div className="flex items-center gap-4">
          {/* Reorder controls (instructor) + order badge */}
          <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {canEdit && (
              <div className="flex flex-col">
                <button className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move up"
                  disabled={!prev || busy} onClick={() => prev && swap.mutate(prev)}><ChevronRight className="h-3.5 w-3.5 -rotate-90" /></button>
                <button className="text-muted-foreground hover:text-foreground disabled:opacity-25" title="Move down"
                  disabled={!next || busy} onClick={() => next && swap.mutate(next)}><ChevronRight className="h-3.5 w-3.5 rotate-90" /></button>
              </div>
            )}
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
              {String((index ?? mod.order) + (index != null ? 1 : 0)).padStart(2, '0')}
            </div>
          </div>
          {/* Title & meta */}
          <div className="flex-1 min-w-0">
            {renaming ? (
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Input autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nameDraft.trim()) rename.mutate(nameDraft.trim()); if (e.key === 'Escape') setRenaming(false); }} className="h-8" />
                <Button size="sm" disabled={!nameDraft.trim() || rename.isPending} onClick={() => rename.mutate(nameDraft.trim())}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setRenaming(false); setNameDraft(mod.title); }}>Cancel</Button>
              </div>
            ) : (
              <CardTitle className="text-base truncate">{mod.title}</CardTitle>
            )}
            {!renaming && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {(mod.estimatedMinutes ?? 0) > 0 && <><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{mod.estimatedMinutes}min</span><span>·</span></>}
                <span>{mod.beatCount} {mod.beatCount === 1 ? 'page' : 'pages'}</span>
                {isEmpty && <span className="text-amber-600">· No content yet</span>}
              </div>
            )}
          </div>
          {/* Status + edit controls */}
          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Badge variant={mod.status === 'published' ? 'default' : 'secondary'} className="text-xs">
              {mod.status}
            </Badge>
            {canEdit && !renaming && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename module"
                  onClick={() => { setNameDraft(mod.title); setRenaming(true); }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-rose-600" disabled={del.isPending} title="Delete module"
                  onClick={() => { if (window.confirm(`Delete the module "${mod.title}"? This cannot be undone.`)) del.mutate(); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            {canOpen && !renaming && <ChevronRight className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => navigate(`/courses/${mod.courseId}/modules/${mod.id}`)} />}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

/** Lay out a bare module (title only) so an author can build the course incrementally. */
function NewModule({ courseId, nextOrder }: { courseId: string; nextOrder: number }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/modules`, {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim(),
        estimatedMinutes: minutes.trim() ? Number(minutes) : undefined,
        order: nextOrder,
      }),
    }),
    onSuccess: () => { setTitle(''); setMinutes(''); setError(null); qc.invalidateQueries({ queryKey: ['modules', courseId] }); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not add that module.'),
  });
  return (
    <Card className="border-dashed border-primary/30">
      <CardContent className="py-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Plus className="h-4 w-4 text-primary flex-shrink-0" />
          <input
            className={cn(fieldCls, 'flex-1 min-w-[200px]')}
            placeholder="Module title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && title.trim() && !m.isPending) m.mutate(); }}
          />
          <input
            type="number"
            min={0}
            className={cn(fieldCls, 'w-24')}
            placeholder="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <Button size="sm" className="gap-1.5" disabled={!title.trim() || m.isPending} onClick={() => m.mutate()}>
            <Plus className="h-3.5 w-3.5" /> {m.isPending ? 'Adding...' : 'Add module'}
          </Button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Brightspace-style left Table of Contents for the course page: course sections plus every module
 * by name. Instructors can Customize which sections appear (saved per course in the browser). This
 * replaces the old horizontal tab bar for instructors and visitors.
 */
function CourseToc({ courseId, activeTab, setTab, isInstructor, modules, navigate, savedConfig }: {
  courseId: string;
  activeTab: string;
  setTab: (t: string) => void;
  isInstructor: boolean;
  modules?: { id: string; title: string }[];
  navigate: (to: string) => void;
  savedConfig?: string | null;
}) {
  const STORAGE = `toc-hidden:${courseId}`;
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(STORAGE); return new Set<string>(raw ? JSON.parse(raw) : []); } catch { return new Set<string>(); }
  });
  const [customizing, setCustomizing] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(true);
  const toggle = (id: string) => setHidden((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id);
    try { localStorage.setItem(STORAGE, JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  // Sections only staff should see (course setup + roster/roster-management). Learners and visitors
  // never see these in the table of contents.
  const STAFF_ONLY = new Set(['build', 'alignment', 'people', 'groups']);
  const baseSections = TABS.filter((t) => isInstructor || !STAFF_ONLY.has(t.id));
  // Custom order (drag-free up/down reordering in Customize mode), saved per course.
  const ORDER_KEY = `toc-order:${courseId}`;
  const [order, setOrder] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch { return []; } });
  const rank = (id: string) => { const i = order.indexOf(id); return i === -1 ? 1000 + baseSections.findIndex((s) => s.id === id) : i; };
  const sections = [...baseSections].sort((a, b) => rank(a.id) - rank(b.id));
  const move = (id: string, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const idx = ids.indexOf(id); const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    setOrder(ids); try { localStorage.setItem(ORDER_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  };
  // Custom labels: instructors can rename any menu item (saved per course). Empty = fall back to default.
  const LABELS_KEY = `toc-labels:${courseId}`;
  const [labels, setLabels] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem(LABELS_KEY) || '{}'); } catch { return {}; } });
  const labelOf = (id: string, fallback: string) => (labels[id] && labels[id].trim() ? labels[id] : fallback);
  const setLabel = (id: string, v: string) => setLabels((m) => { const n = { ...m, [id]: v }; try { localStorage.setItem(LABELS_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  // Server-saved config applies to EVERY viewer. Load it when the course arrives; persist on "Done".
  useEffect(() => {
    if (!savedConfig) return;
    try {
      const s = JSON.parse(savedConfig);
      if (Array.isArray(s.order)) setOrder(s.order);
      if (Array.isArray(s.hidden)) setHidden(new Set(s.hidden));
      if (s.labels && typeof s.labels === 'object') setLabels(s.labels);
    } catch { /* ignore */ }
  }, [savedConfig]);
  const persistConfig = () => {
    const cfg = JSON.stringify({ order, hidden: [...hidden], labels });
    apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify({ tocConfig: cfg }) }).catch(() => { /* non-fatal */ });
  };
  const hasModules = (modules?.length ?? 0) > 0;
  return (
    <aside className="lg:w-full shrink-0 lg:sticky lg:top-4 self-start mb-6 lg:mb-0 lg:border-r lg:border-border lg:pr-4 lg:min-h-[70vh]">
      <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Table of contents</span>
        {isInstructor && (
          <button onClick={() => setCustomizing((c) => { if (c) persistConfig(); return !c; })} className="text-xs text-primary hover:underline">
            {customizing ? 'Done' : 'Customize'}
          </button>
        )}
      </div>
      <nav className="space-y-0.5">
        {sections.filter((t) => customizing || !hidden.has(t.id)).map((t) => (
          <div key={t.id}>
            <div className="flex items-center gap-1">
              {customizing && isInstructor && (
                <>
                  <input type="checkbox" className="ml-1 h-3.5 w-3.5 shrink-0" checked={!hidden.has(t.id)} onChange={() => toggle(t.id)} title="Show in table of contents" />
                  <span className="flex flex-col shrink-0">
                    <button className="text-muted-foreground hover:text-foreground" title="Move up" onClick={() => move(t.id, -1)}><ChevronRight className="h-3 w-3 -rotate-90" /></button>
                    <button className="text-muted-foreground hover:text-foreground" title="Move down" onClick={() => move(t.id, 1)}><ChevronRight className="h-3 w-3 rotate-90" /></button>
                  </span>
                </>
              )}
              {customizing && isInstructor ? (
                <div className="flex-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 bg-muted/40">
                  <t.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input value={labelOf(t.id, t.label)} onChange={(e) => setLabel(t.id, e.target.value)}
                    className="flex-1 min-w-0 rounded-md border border-input bg-background px-2 py-1 text-sm"
                    aria-label={`Rename ${t.label}`} />
                </div>
              ) : (
                <button onClick={() => setTab(t.id)}
                  className={cn('flex-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-left transition-colors',
                    activeTab === t.id ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-muted/60')}>
                  <t.icon className="h-4 w-4 shrink-0" />{labelOf(t.id, t.label)}
                </button>
              )}
              {/* The Modules entry expands to show each module as a collapsible sub-menu. */}
              {t.id === 'modules' && hasModules && (
                <button onClick={() => setModulesOpen((o) => !o)} className="p-1 text-muted-foreground hover:text-foreground" title={modulesOpen ? 'Collapse modules' : 'Expand modules'}>
                  {modulesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              )}
            </div>
            {t.id === 'modules' && hasModules && modulesOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
                {(modules ?? []).map((m, i) => (
                  <button key={m.id} onClick={() => navigate(`/courses/${courseId}/modules/${m.id}`)}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left text-muted-foreground hover:text-foreground hover:bg-muted/60">
                    <span className="text-[10px] font-bold tabular-nums shrink-0 w-5">{String(i + 1).padStart(2, '0')}</span>
                    <span className="truncate">{m.title}</span>
                  </button>
                ))}
                {isInstructor && (
                  <button onClick={() => setTab('modules')} className="w-full px-2 py-1.5 text-left text-xs text-primary hover:bg-muted/40 rounded-md">
                    Add or manage modules
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}

// Turn objectives HTML (from the rich editor) into per-item HTML strings, and into plain text for
// the structured course.objectives array used elsewhere (alignment, learner views).
function objectivesHtmlToItems(html: string): string[] {
  const li = [...(html || '').matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1].trim());
  if (li.length) return li.filter(Boolean);
  return (html || '')
    .split(/<br\s*\/?>|<\/p>|<\/div>|\n/i)
    .map((s) => s.replace(/<\/?(p|div|ul|ol)[^>]*>/gi, '').trim())
    .filter(Boolean);
}
function itemsToPlain(items: string[]): string[] {
  return items.map((h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Shared palette + bullet shapes for the overview styling controls.
const STYLE_COLORS = ['#111827', '#f97316', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
const HEADING_SIZES: { key: string; label: string; cls: string }[] = [
  { key: 'sm', label: 'S', cls: 'text-base' },
  { key: 'md', label: 'M', cls: 'text-lg' },
  { key: 'lg', label: 'L', cls: 'text-2xl' },
  { key: 'xl', label: 'XL', cls: 'text-3xl' },
];
const headingSizeCls = (k?: string) => HEADING_SIZES.find((s) => s.key === k)?.cls ?? 'text-lg';
const BULLET_SHAPES = ['target', 'dot', 'check', 'square', 'star', 'arrow'] as const;
type BulletShape = typeof BULLET_SHAPES[number];
function BulletIcon({ shape, color, className }: { shape?: string; color?: string; className?: string }) {
  const cls = cn('h-3 w-3 shrink-0', className);
  const style = { color: color || '#f97316' };
  switch (shape as BulletShape) {
    case 'dot': return <Circle className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'check': return <Check className={cls} style={style} strokeWidth={3} />;
    case 'square': return <Square className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'star': return <Star className={cls} style={style} fill="currentColor" strokeWidth={0} />;
    case 'arrow': return <ChevronRight className={cls} style={style} strokeWidth={3} />;
    default: return <Target className={cls} style={style} strokeWidth={2.5} />;
  }
}

/**
 * Lightweight rich-text editor with a formatting toolbar (headings, bold/italic/underline, font
 * size, colour, lists, links). Uses the browser's editing commands and stores HTML. No extra deps.
 */
function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // Seed the editable div once; after that the DOM is the source of truth (React must not re-set it).
  useEffect(() => { if (ref.current) ref.current.innerHTML = value || ''; /* eslint-disable-next-line */ }, []);
  const sync = () => onChange(ref.current?.innerHTML ?? '');
  const exec = (cmd: string, arg?: string) => { ref.current?.focus(); document.execCommand(cmd, false, arg); sync(); };
  const Btn = ({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) => (
    <button type="button" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className="h-7 min-w-7 px-1.5 rounded hover:bg-muted text-sm text-foreground inline-flex items-center justify-center">{children}</button>
  );
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 p-1">
        <select title="Text style" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('formatBlock', e.target.value); e.target.value=''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Style</option>
          <option value="H2">Heading</option>
          <option value="H3">Subheading</option>
          <option value="P">Paragraph</option>
        </select>
        <select title="Font" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('fontName', e.target.value); e.target.value=''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Font</option>
          <option value="Georgia, serif">Serif</option>
          <option value="Inter, system-ui, sans-serif">Sans</option>
          <option value="ui-monospace, monospace">Mono</option>
        </select>
        <select title="Font size" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { exec('fontSize', e.target.value); e.target.value=''; }}
          className="h-7 rounded border border-input bg-background px-1 text-xs">
          <option value="">Size</option>
          <option value="1">XS</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="4">Medium</option>
          <option value="5">Large</option>
          <option value="6">X-Large</option>
          <option value="7">XX-Large</option>
        </select>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Bold" onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Btn>
        <Btn title="Italic" onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Btn>
        <Btn title="Underline" onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Btn>
        <Btn title="Strikethrough" onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Align left" onClick={() => exec('justifyLeft')}><AlignLeft className="h-4 w-4" /></Btn>
        <Btn title="Align centre" onClick={() => exec('justifyCenter')}><AlignCenter className="h-4 w-4" /></Btn>
        <Btn title="Align right" onClick={() => exec('justifyRight')}><AlignRight className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <Btn title="Bulleted list" onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Btn>
        <Btn title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Btn>
        <Btn title="Link" onClick={() => { const u = window.prompt('Link URL'); if (u) exec('createLink', u); }}><Link2 className="h-4 w-4" /></Btn>
        <Btn title="Clear formatting" onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></Btn>
        <span className="mx-0.5 h-5 w-px bg-border" />
        {STYLE_COLORS.map((c) => (
          <button key={c} type="button" title="Text colour" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('foreColor', c)}
            className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: c }} />
        ))}
        <input type="color" title="Custom colour" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => exec('foreColor', e.target.value)} className="h-6 w-6 rounded border border-border bg-transparent p-0" />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={sync}
        className="prose prose-sm max-w-none min-h-[9rem] p-3 focus:outline-none [&_h2]:font-serif [&_h3]:font-serif" />
    </div>
  );
}

// Course-level action: generate the full reading for every module from the uploaded source, one at a
// time (each is its own request, so no single call times out). Shows progress.
function GenerateAllReadings({ modules }: { modules?: { id: string; title: string }[] }) {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const run = async () => {
    const mods = modules ?? [];
    if (!mods.length) { setError('This course has no modules yet.'); return; }
    setRunning(true); setError(null); setFailed([]);
    const fails: string[] = [];
    for (let i = 0; i < mods.length; i++) {
      setProgress(`Generating reading ${i + 1} of ${mods.length}: ${mods[i].title}`);
      try {
        await apiFetch(`/modules/${mods[i].id}/readings/generate`, { method: 'POST', body: JSON.stringify({}) });
        qc.invalidateQueries({ queryKey: ['module-readings', mods[i].id] });
      } catch { fails.push(mods[i].title); }
    }
    setFailed(fails);
    setProgress(fails.length ? `Done, ${fails.length} could not be generated.` : `Done. Full readings generated for ${mods.length} module${mods.length === 1 ? '' : 's'}.`);
    setRunning(false);
  };
  return (
    <div className="rounded-lg border border-dashed border-primary/30 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Generate full readings for all modules</p>
        <p className="text-xs text-muted-foreground">Builds each module's reading from your uploaded material, replacing the starter stubs. Takes a minute per module.</p>
        {progress && <p className="text-xs text-muted-foreground mt-1">{progress}</p>}
        {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
        {failed.length > 0 && <p className="text-xs text-amber-600 mt-1">Retry these: {failed.join(', ')}</p>}
      </div>
      <Button size="sm" disabled={running} onClick={run}>{running ? 'Generating…' : 'Generate all readings'}</Button>
    </div>
  );
}

// Build page: bulk-generate coursework from each module's content. The instructor sets how many
// activities / case studies / discussions per module, picks interaction types and rigor for the
// activities, and one click generates them across every module (grounded in that module's readings).
const ACT_TYPES: { id: string; label: string }[] = [
  { id: 'quiz', label: 'Quiz' }, { id: 'flashcards', label: 'Flashcards' }, { id: 'matching', label: 'Matching' },
  { id: 'order', label: 'Ordering' }, { id: 'categorize', label: 'Categorize' },
];
const BLOOMS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
function GenerateCoursework({ courseId, modules }: { courseId: string; modules?: { id: string; title: string }[] }) {
  const qc = useQueryClient();
  const [actCount, setActCount] = useState(2);
  const [types, setTypes] = useState<Set<string>>(() => new Set(ACT_TYPES.map((t) => t.id)));
  const [bloom, setBloom] = useState('mixed');
  const [difficulty, setDifficulty] = useState('mixed');
  const [caseCount, setCaseCount] = useState(1);
  const [discCount, setDiscCount] = useState(2);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const toggleType = (id: string) => setTypes((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const gather = async (moduleId: string) => {
    const list = await apiFetch<{ id: string; hasContent: boolean }[]>(`/modules/${moduleId}/readings`).catch(() => []);
    const parts: string[] = [];
    for (const r of (list ?? []).filter((x) => x.hasContent)) {
      try { const full = await apiFetch<{ content: string }>(`/readings/${r.id}`); if (full.content) parts.push(full.content); } catch { /* skip */ }
    }
    return parts.join('\n\n').trim();
  };

  const run = async () => {
    const mods = modules ?? [];
    if (!mods.length) { setError('This course has no modules yet.'); return; }
    if (actCount === 0 && caseCount === 0 && discCount === 0) { setError('Choose at least one thing to generate.'); return; }
    if (actCount > 0 && types.size === 0) { setError('Pick at least one activity type.'); return; }
    setRunning(true); setError(null); setLog([]);
    const notes: string[] = [];
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      setProgress(`Module ${i + 1} of ${mods.length}: ${m.title}`);
      const content = await gather(m.id);
      // Activities (from the module's readings) -> rendered interactive, attached + published.
      if (actCount > 0) {
        if (content.length < 80) { notes.push(`${m.title}: no reading content for activities`); }
        else {
          try {
            const body: Record<string, unknown> = { content: content.slice(0, 12000), count: actCount, types: [...types] };
            if (bloom !== 'mixed') body.targetBloom = bloom;
            if (difficulty !== 'mixed') body.targetDifficulty = difficulty;
            const { activities } = await apiFetch<{ activities: { type: string; title: string; instructions: string; bloomsLevel: string; difficulty: string; spec: unknown }[] }>(`/activities/generate`, { method: 'POST', body: JSON.stringify(body) });
            let made = 0;
            for (const a of activities ?? []) {
              try {
                const html = renderActivity(a.type as InteractionType, a.spec as ActivitySpec);
                if (!html) continue;
                await activitiesApi.create({ title: a.title, instructions: a.instructions || undefined, source: 'html', html, kind: 'game', bloomsLevel: a.bloomsLevel || null, difficulty: a.difficulty || null, published: true, courseId, moduleId: m.id });
                made++;
              } catch { /* skip one */ }
            }
            qc.invalidateQueries({ queryKey: ['module-activities', m.id] });
            if (!made) notes.push(`${m.title}: activities failed`);
          } catch { notes.push(`${m.title}: activities failed`); }
        }
      }
      // Case studies -> one draft per requested count.
      for (let c = 0; c < caseCount; c++) {
        try { await apiFetch(`/modules/${m.id}/cases/generate`, { method: 'POST', body: JSON.stringify({}) }); }
        catch { notes.push(`${m.title}: case ${c + 1} failed`); }
      }
      if (caseCount > 0) qc.invalidateQueries({ queryKey: ['module-cases', m.id] });
      // Discussions.
      if (discCount > 0) {
        try { await apiFetch(`/modules/${m.id}/discussions/generate`, { method: 'POST', body: JSON.stringify({ count: discCount }) }); }
        catch { notes.push(`${m.title}: discussions failed`); }
      }
    }
    setLog(notes);
    setProgress(notes.length ? `Done, with ${notes.length} item(s) to review below.` : `Done. Coursework generated across ${mods.length} module${mods.length === 1 ? '' : 's'}.`);
    setRunning(false);
  };

  const Num = ({ value, set, max }: { value: number; set: (n: number) => void; max: number }) => (
    <select value={value} onChange={(e) => set(Number(e.target.value))} disabled={running}
      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
      {Array.from({ length: max + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  return (
    <div className="rounded-lg border border-dashed border-primary/30 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold">Generate coursework for every module</p>
        <p className="text-xs text-muted-foreground">Builds activities, case studies and discussions from each module's own reading content. Runs one module at a time.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Play className="h-3.5 w-3.5 text-primary" /> Activities / module <Num value={actCount} set={setActCount} max={4} /></label>
          {actCount > 0 && (
            <div className="space-y-2 rounded-md bg-muted/40 p-2">
              <div className="flex flex-wrap gap-1">
                {ACT_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => toggleType(t.id)} disabled={running}
                    className={cn('rounded-full px-2 py-0.5 text-[11px] border', types.has(t.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>{t.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-muted-foreground">Rigor</span>
                <select value={bloom} onChange={(e) => setBloom(e.target.value)} disabled={running} className="rounded border border-input bg-background px-1.5 py-1">
                  <option value="mixed">Mixed Bloom's</option>
                  {BLOOMS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} disabled={running} className="rounded border border-input bg-background px-1.5 py-1">
                  <option value="mixed">Mixed difficulty</option>
                  <option value="foundational">Foundational</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <label className="flex items-start gap-2 text-sm font-medium"><FileText className="h-3.5 w-3.5 text-primary mt-1" /> Case studies / module <Num value={caseCount} set={setCaseCount} max={3} /></label>
        <label className="flex items-start gap-2 text-sm font-medium"><MessageSquare className="h-3.5 w-3.5 text-primary mt-1" /> Discussions / module <Num value={discCount} set={setDiscCount} max={5} /></label>
      </div>

      {progress && <p className="text-xs text-muted-foreground">{progress}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {log.length > 0 && <ul className="text-xs text-amber-600 list-disc pl-4 space-y-0.5">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      <div className="flex justify-end">
        <Button size="sm" disabled={running} onClick={run}>{running ? 'Generating…' : 'Generate coursework for all modules'}</Button>
      </div>
    </div>
  );
}

function HeadingStyleBar({ style, onChange }: { style: { color?: string; size?: string }; onChange: (s: { color?: string; size?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Heading colour</span>
      {STYLE_COLORS.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange({ ...style, color: c })}
          className={cn('h-4 w-4 rounded-full border border-border', style.color === c && 'ring-2 ring-primary ring-offset-1')} style={{ backgroundColor: c }} />
      ))}
      <span className="ml-2 text-[11px] font-medium text-muted-foreground">Size</span>
      {HEADING_SIZES.map((s) => (
        <button key={s.key} type="button" onClick={() => onChange({ ...style, size: s.key })}
          className={cn('h-6 px-1.5 rounded border text-xs', style.size === s.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground')}>{s.label}</button>
      ))}
    </div>
  );
}
function BulletStyleBar({ bullet, onChange }: { bullet: { shape?: string; color?: string }; onChange: (b: { shape?: string; color?: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Bullet</span>
      {BULLET_SHAPES.map((sh) => (
        <button key={sh} type="button" title={sh} onClick={() => onChange({ ...bullet, shape: sh })}
          className={cn('h-7 w-7 rounded border flex items-center justify-center', bullet.shape === sh ? 'border-primary bg-primary/10' : 'border-border')}>
          <BulletIcon shape={sh} color={bullet.color} />
        </button>
      ))}
      <span className="ml-2 text-[11px] font-medium text-muted-foreground">Colour</span>
      {STYLE_COLORS.map((c) => (
        <button key={c} type="button" title={c} onClick={() => onChange({ ...bullet, color: c })}
          className={cn('h-4 w-4 rounded-full border border-border', bullet.color === c && 'ring-2 ring-primary ring-offset-1')} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

export function CourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(search);
  // Set when arriving straight from "Create course": open the Build tab with the content panel.
  const startBuild = searchParams.get('build') === 'content';
  const activeTab = searchParams.get('tab') || (startBuild ? 'build' : 'overview');
  const [ivBeat, setIvBeat] = useState<Beat | null>(null);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [calendarView, setCalendarView] = useState<'month' | 'list'>('month');
  const [calCursor, setCalCursor] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const qc = useQueryClient();

  const { data: user } = useGetMe();
  const role = user?.role ?? 'learner';
  const canInstruct = ['coach', 'org_admin', 'partner_admin', 'super_admin'].includes(role);
  // "View as student": staff can preview the course exactly as a learner sees it while building.
  // When on, isInstructor renders false so all instructor controls/tabs hide and learner views show.
  const [previewAsStudent, setPreviewAsStudent] = useState(() => { try { return localStorage.getItem('viewAsStudent') === '1'; } catch { return false; } });
  const toggleStudentView = () => setPreviewAsStudent((v) => { const nv = !v; try { localStorage.setItem('viewAsStudent', nv ? '1' : '0'); } catch { /* ignore */ } return nv; });
  const isInstructor = canInstruct && !previewAsStudent;
  // Inline edit of the course overview content ("About this course", objectives).
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [objEditing, setObjEditing] = useState(false);
  const [objDraft, setObjDraft] = useState<string[]>([]);
  const [objHtmlDraft, setObjHtmlDraft] = useState('');
  const [aboutHeadingDraft, setAboutHeadingDraft] = useState('');
  const [objHeadingDraft, setObjHeadingDraft] = useState('');
  // Heading + bullet style drafts (colour/size/shape) while editing a section.
  const [aboutHStyle, setAboutHStyle] = useState<{ color?: string; size?: string }>({});
  const [objHStyle, setObjHStyle] = useState<{ color?: string; size?: string }>({});
  const [bulletDraft, setBulletDraft] = useState<{ shape?: string; color?: string }>({});
  // Youngest learners (K-5) get a stripped, jargon-free course page: just "Start here", no
  // objectives lists, structure stat grid, competency tags, or calendar sidebar.
  const youngPersona = personaByEmail((user as { email?: string } | undefined)?.email);
  const isYoungBand = !!youngPersona && (youngPersona.band === 'early' || youngPersona.band === 'elementary');
  // Any K-12 demo learner gets the streamlined course page (skip the adult overview/objectives/skills
  // blocks) so they land on their lessons ("Start here") with minimal scrolling.
  const isK12Learner = !!youngPersona;
  // Spanish-first learner (Sofía): every label on this page reads in her language.
  const es = youngPersona?.defaultLang === 'es';
  const L = (en: string, esT: string) => (es ? esT : en);

  const setTab = (tab: string) => navigate(`/courses/${courseId}?tab=${tab}`);
  // Leaving a staff-only tab when entering student view, so the preview never lands on a blank tab.
  useEffect(() => {
    if (previewAsStudent && (activeTab === 'build' || activeTab === 'alignment')) setTab('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewAsStudent, activeTab]);

  const { data: course, isLoading: courseLoading } = useQuery({ queryKey: ['course', courseId], queryFn: () => apiFetch<Course>(`/courses/${courseId}`) });
  // Real completion, computed from beats the learner has actually viewed.
  const { data: progress } = useQuery({
    queryKey: ['course-progress', courseId],
    queryFn: () => apiFetch<CourseProgress>(`/progress/course/${courseId}`),
    enabled: !!courseId,
  });
  // Also needed on the discussions tab, where a new thread can be scoped to a module.
  const { data: modules, isLoading: modulesLoading, isError: modulesError } = useQuery({ queryKey: ['modules', courseId], queryFn: () => apiFetch<Module[]>(`/courses/${courseId}/modules`), enabled: !!courseId, retry: false });
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({ queryKey: ['assignments', courseId], queryFn: () => apiFetch<Assignment[]>(`/courses/${courseId}/assignments`), enabled: activeTab === 'assignments' || activeTab === 'overview', retry: false });
  const { data: discussions, isLoading: discussionsLoading } = useQuery({ queryKey: ['discussions', courseId], queryFn: () => apiFetch<Discussion[]>(`/courses/${courseId}/discussions`), enabled: activeTab === 'discussions' || activeTab === 'overview', retry: false });
  const { data: announcements, isLoading: announcementsLoading } = useQuery({ queryKey: ['announcements', courseId], queryFn: () => apiFetch<Announcement[]>(`/courses/${courseId}/announcements`), enabled: activeTab === 'announcements' || activeTab === 'overview', retry: false });
  const { data: myGrades } = useQuery({ queryKey: ['grades', courseId, 'me'], queryFn: () => apiFetch<{ grades: GradeEntry[]; totalEarned: number; totalPossible: number; overallPercent: number; }>(`/courses/${courseId}/gradebook/me`), enabled: activeTab === 'gradebook' && !isInstructor });
  const { data: events } = useQuery({ queryKey: ['events', courseId], queryFn: () => apiFetch<Event[]>(`/courses/${courseId}/events`), enabled: activeTab === 'calendar' || activeTab === 'overview' });
  const { data: pages, isLoading: pagesLoading } = useQuery({ queryKey: ['pages', courseId], queryFn: () => apiFetch<Page[]>(`/courses/${courseId}/pages`), enabled: activeTab === 'pages', retry: false });
  const { data: roster, isLoading: rosterLoading } = useQuery({ queryKey: ['roster', courseId], queryFn: () => apiFetch<RosterEntry[]>(`/courses/${courseId}/roster`), enabled: activeTab === 'people', retry: false });
  const { data: groups, isLoading: groupsLoading } = useQuery({ queryKey: ['groups', courseId], queryFn: () => apiFetch<Group[]>(`/courses/${courseId}/groups`), enabled: activeTab === 'groups', retry: false });
  const { data: alignment, isLoading: alignmentLoading, isError: alignmentError } = useQuery({
    queryKey: ['alignment', courseId],
    queryFn: () => apiFetch<{
      objectiveCount: number; covered: number; assessed: number; moduleCount: number; assessmentCount: number;
      alignment: Array<{ objective: string; modules: string[]; assessments: string[]; covered: boolean; assessed: boolean; note: string }>;
      wcag: Array<{ id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
    }>(`/courses/${courseId}/alignment`),
    enabled: activeTab === 'alignment',
    retry: false,
  });
  const { data: enrolment } = useQuery({ queryKey: ['enrolment', courseId, 'me'], queryFn: () => apiFetch<Enrolment | null>(`/courses/${courseId}/my-enrolment`) });
  // Enrolled learners get the clean single-flow course page (no tab rail). Instructors and
  // catalog visitors keep the tabbed course-management shell. Declared AFTER the enrolment
  // query (it reads enrolment) to avoid a temporal-dead-zone reference.
  const isLearnerView = !isInstructor && !!enrolment;
  // Behavioural density recommendation (Focus vs Full view), sets the DEFAULT only;
  // the learner's explicit toggle choice always wins. Learners only.
  const { data: densityRec } = useQuery({
    queryKey: ['learn', 'density'],
    queryFn: () => apiFetch<{ density: 'focus' | 'full' }>('/learn/density'),
    enabled: !isInstructor,
  });

  const enrolMutation = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/enrol`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enrolment', courseId] }),
  });

  // Instructor-only: delete the whole course (and everything under it).
  const deleteCourseMutation = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/courses'),
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not delete this course.'),
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: string) => apiFetch(`/groups/${groupId}/join`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', courseId] }),
  });

  // Instructor authoring: persist course-level learning objectives.
  const saveCourse = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
    onError: (e) => alert(e instanceof Error ? e.message : 'Could not save. Please try again.'),
  });

  // Instructor-only: set the course banner from an image URL.
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  // Live preview in the dialog: 'idle' before a URL is entered, 'loading' while the
  // browser fetches it, 'ok' once it loads, 'error' if it cannot be loaded as an image.
  // This surfaces the common failure mode (a page URL or hotlink-blocked link that is
  // not a direct image) instead of silently falling back to the themed gradient.
  const [bannerPreview, setBannerPreview] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [bannerResolving, setBannerResolving] = useState(false);
  const openBannerDialog = () => {
    setBannerUrl(course?.thumbnailUrl ?? '');
    setBannerError(null);
    setBannerPreview(course?.thumbnailUrl ? 'loading' : 'idle');
    setBannerOpen(true);
  };
  // Instructor-only: edit the course title inline on the banner.
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const startTitleEdit = () => { setTitleDraft(course?.title ?? ''); setTitleEditing(true); };
  const saveTitle = async () => {
    const t = titleDraft.trim();
    if (!t || t === course?.title) { setTitleEditing(false); return; }
    setTitleSaving(true);
    try {
      await apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify({ title: t }) });
      await qc.invalidateQueries({ queryKey: ['course', courseId] });
      setTitleEditing(false);
    } catch { /* keep editing on failure */ }
    finally { setTitleSaving(false); }
  };
  // Ask the server to turn a page URL (Unsplash/Pexels/etc.) into a direct image URL by reading
  // its preview image. Returns the direct URL, or null on failure (error surfaced to the user).
  const resolvePageToImage = async (): Promise<string | null> => {
    const url = bannerUrl.trim();
    if (!url) return null;
    setBannerResolving(true);
    setBannerError(null);
    try {
      const r = await apiFetch<{ imageUrl: string }>('/courses/resolve-image', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      if (r.imageUrl && r.imageUrl !== url) {
        setBannerUrl(r.imageUrl);
        setBannerPreview('loading');
      }
      return r.imageUrl || null;
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Could not fetch an image from that page.');
      return null;
    } finally {
      setBannerResolving(false);
    }
  };
  const saveBanner = async () => {
    setBannerSaving(true);
    setBannerError(null);
    try {
      let url = bannerUrl.trim();
      // If the pasted link is not itself a displayable image (page link, hotlink-blocked),
      // try to resolve it into a direct image URL before saving, so the banner actually shows.
      if (url && bannerPreview !== 'ok') {
        const resolved = await resolvePageToImage();
        if (!resolved) { setBannerSaving(false); return; }
        url = resolved;
      }
      await apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: JSON.stringify({ thumbnailUrl: url || null }) });
      await qc.invalidateQueries({ queryKey: ['course', courseId] });
      setBannerImgFailed(false);
      setBannerOpen(false);
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Could not save the banner.');
    } finally {
      setBannerSaving(false);
    }
  };
  // When the saved banner changes (e.g. after saveBanner refetches the course), clear any
  // stale image-failed flag so a newly saved, valid banner is not suppressed by a previous
  // bad URL's onError.
  useEffect(() => { setBannerImgFailed(false); }, [course?.thumbnailUrl]);

  // Course structure = published modules in order, each annotated with the learner's
  // progress (complete / certified / percent) so the Overview shows a real module map.
  const moduleProgressById = new Map((progress?.modules ?? []).map((m) => [m.moduleId, m] as const));
  const publishedModules = (modules ?? [])
    .filter((m) => m.status === 'published')
    .sort((a, b) => a.order - b.order);
  const totalMinutes = publishedModules.reduce((s, m) => s + (m.estimatedMinutes ?? 0), 0);
  // The module we suggest the learner start with: the first that isn't complete or mastered.
  const recommendedId = publishedModules.find((m) => {
    const p = moduleProgressById.get(m.id);
    return !(p?.complete || p?.certified);
  })?.id;

  // Display order for the "Start here" list: ALWAYS the curriculum sequence. A module the learner
  // just mastered keeps its place in the syllabus - it must not drop below untouched modules, which
  // is disorienting ("where did the one I just finished go?") and makes the list stop reading like a
  // course outline. Completion is shown by badge (Complete / Mastered), and `recommendedId` still
  // highlights the next thing to do with a "Start here" chip - so what's next is obvious without
  // reordering. Each card keeps its curriculum number (seq).
  const orderedModules = publishedModules.map((m, i) => ({ m, seq: i + 1 }));

  if (courseLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
  if (!course) return <div className="text-muted-foreground">Course not found.</div>;

  // Custom overview section headings + rich "About" HTML (author-adjustable, persisted on the course).
  const ovCfg: {
    aboutHeading?: string; objectivesHeading?: string; aboutHtml?: string; objectivesHtml?: string;
    aboutHColor?: string; aboutHSize?: string; objHColor?: string; objHSize?: string;
    bulletShape?: string; bulletColor?: string;
  } = (() => {
    try { return (course as { overviewConfig?: string }).overviewConfig ? JSON.parse((course as { overviewConfig?: string }).overviewConfig!) : {}; } catch { return {}; }
  })();
  const aboutHeading = ovCfg.aboutHeading || 'About this course';
  const objectivesHeading = ovCfg.objectivesHeading || "What you'll be able to do";
  const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  return (
    <div className={cn('space-y-0', !isLearnerView && 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6 lg:items-start')}>
      {!isLearnerView && (
        <CourseToc courseId={courseId} activeTab={activeTab} setTab={setTab} isInstructor={isInstructor} modules={modules} navigate={navigate} savedConfig={(course as { tocConfig?: string | null } | undefined)?.tocConfig ?? null} />
      )}
      <div className="min-w-0 space-y-0">
      {/* Breadcrumb + View-as-student toggle (staff only) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <a href="/courses" className="hover:text-foreground transition-colors">{L('Courses', 'Cursos')}</a>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium truncate max-w-xs">{course.title}</span>
        </div>
        {canInstruct && (
          <Button size="sm" variant={previewAsStudent ? 'default' : 'outline'} className="gap-1.5"
            onClick={toggleStudentView}>
            <Users className="h-4 w-4" />
            {previewAsStudent ? 'Exit student view' : 'View as student'}
          </Button>
        )}
      </div>
      {previewAsStudent && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          You are previewing this course as a student would see it. Instructor tools and the Build tab are hidden. Click "Exit student view" to return to building.
        </div>
      )}

      {/* Course header - banner hero. Shown on the Overview only, so the course banner + description
          do not appear on every section (Assignments, Activities, etc.). */}
      {activeTab === 'overview' && (
      <div className="relative mb-4 h-56 md:h-72 overflow-hidden rounded-xl">
        {course.thumbnailUrl && !bannerImgFailed ? (
          <img
            src={course.thumbnailUrl}
            alt={`Banner for ${course.title}`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setBannerImgFailed(true)}
          />
        ) : (
          <div className="absolute inset-0" style={bannerGradientStyle(course.title)} />
        )}
        {/* Scrim so white text and controls read on any image */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Title, bottom-left */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-5">
          {isInstructor && titleEditing ? (
            <div className="flex items-center gap-2 max-w-2xl w-full">
              <Input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setTitleEditing(false); }}
                className="bg-white/90 text-foreground font-serif text-lg"
              />
              <Button size="sm" className="shrink-0" disabled={titleSaving} onClick={saveTitle}>{titleSaving ? 'Saving...' : 'Save'}</Button>
              <Button size="sm" variant="ghost" className="shrink-0 text-white hover:bg-white/20" disabled={titleSaving} onClick={() => setTitleEditing(false)}>Cancel</Button>
            </div>
          ) : (
            <h1
              className={cn('font-serif text-2xl md:text-3xl font-bold text-white drop-shadow-md line-clamp-2 max-w-2xl', isInstructor && 'cursor-text')}
              onClick={isInstructor ? startTitleEdit : undefined}
              title={isInstructor ? 'Click to edit the title' : undefined}
            >
              {course.title}
            </h1>
          )}
          {/* Instructor controls, bottom-right, styled to read on the image */}
          {isInstructor && !titleEditing && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm"
                onClick={startTitleEdit}
              >
                <Pencil className="h-4 w-4" /> Edit title
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm"
                onClick={openBannerDialog}
              >
                <ImageIcon className="h-4 w-4" /> Change banner
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm"
                disabled={deleteCourseMutation.isPending}
                onClick={() => {
                  if (window.confirm('Delete this course and everything in it? This cannot be undone.')) deleteCourseMutation.mutate();
                }}
              >
                <Trash2 className="h-4 w-4" /> {deleteCourseMutation.isPending ? 'Deleting...' : 'Delete course'}
              </Button>
            </div>
          )}
        </div>

        {/* Enrolled badge, top-right on the banner */}
        {enrolment && (
          <div className="absolute right-4 top-4">
            <Badge variant="outline" className="bg-white/85 text-green-700 border-green-600 backdrop-blur-sm">{L('Enrolled', 'Inscrito')}</Badge>
          </div>
        )}
      </div>
      )}

      {/* Badges + enrolment note, on the Overview only (the description lives in the About card). */}
      {activeTab === 'overview' && (
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {courseLevelLabel(course) && <Badge variant="outline">{es ? courseLevelLabel(course)!.replace(/^Grade /, 'Grado ') : courseLevelLabel(course)}</Badge>}
          {/* Standards/skill tags are jargon for K-12 learners, hidden so the page stays short. */}
          {!isK12Learner && course.competencyTags?.map((t: string) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
        </div>
        {role === 'learner' && !enrolment && (
          <div className="mt-3 max-w-md rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Enrolment is managed by your organisation. Ask your admin to assign this course to you.
          </div>
        )}
      </div>
      )}

      {/* Change banner dialog */}
      {isInstructor && (
        <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change banner</DialogTitle>
              <DialogDescription>Paste an image URL to use as this course's banner. Leave it empty to clear the banner.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="banner-url" className="text-sm font-medium">Banner image URL</label>
              <Input
                id="banner-url"
                value={bannerUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setBannerUrl(v);
                  setBannerPreview(v.trim() ? 'loading' : 'idle');
                }}
                placeholder="https://example.com/banner.jpg"
              />
              <p className="text-xs text-muted-foreground">
                Use a direct link to an image (ending in .jpg, .png, or .webp). A page link will not display.
              </p>
              <p className="text-xs text-muted-foreground">
                Best free sources: Unsplash, Pexels, or Wikimedia Commons. Paid sites like iStock and Getty block embedding and will not work.
              </p>

              {/* Live preview so a bad or non-image URL is visible here rather than silently
                  reverting to the themed banner after saving. */}
              {bannerUrl.trim() && (
                <div className="mt-1 overflow-hidden rounded-lg border border-border">
                  <div className="relative h-32 w-full bg-muted">
                    <img
                      key={bannerUrl.trim()}
                      src={bannerUrl.trim()}
                      alt="Banner preview"
                      className="absolute inset-0 h-full w-full object-cover"
                      onLoad={() => setBannerPreview('ok')}
                      onError={() => setBannerPreview('error')}
                    />
                  </div>
                  {bannerPreview === 'error' && (
                    <div className="space-y-1.5 px-2 py-1.5">
                      <p className="text-xs text-rose-600">
                        That URL could not be loaded as an image. If it is a photo page (e.g. Unsplash), fetch the image from it.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1.5 text-xs"
                        disabled={bannerResolving}
                        onClick={resolvePageToImage}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        {bannerResolving ? 'Fetching...' : 'Fetch image from this page'}
                      </Button>
                    </div>
                  )}
                  {bannerPreview === 'ok' && (
                    <p className="px-2 py-1.5 text-xs text-green-700">Looks good. This is how the banner will appear.</p>
                  )}
                </div>
              )}
              {bannerError && <p className="text-sm text-rose-600">{bannerError}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBannerOpen(false)} disabled={bannerSaving || bannerResolving}>Cancel</Button>
              <Button onClick={saveBanner} disabled={bannerSaving || bannerResolving}>{bannerResolving ? 'Fetching...' : bannerSaving ? 'Saving...' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Real completion, from beats actually viewed. Only shown to enrolled learners:
          an unenrolled visitor browsing the catalog has no progress to speak of. */}
      {/* The learner Overview's "Start here" list already shows progress + the next module,
          so this header progress card is redundant there; keep it on the other tabs. */}
      {enrolment && progress && progress.totalBeats > 0 && !(activeTab === 'overview' && !isInstructor) && (
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {progress.percent >= 100 ? 'Course complete' : 'Your progress'}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progress.viewedBeats} of {progress.totalBeats} steps · {progress.percent}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress.percent >= 100 ? 'bg-green-600' : 'bg-primary',
              )}
              style={{ width: `${progress.percent}%` }}
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Course completion"
            />
          </div>
          {progress.modules?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {progress.modules.map((m) => (
                <span
                  key={m.moduleId}
                  title={
                    m.certified && !m.complete
                      ? `${m.title}: Mastered, review the material`
                      : `${m.title}: ${m.viewedBeats}/${m.totalBeats}`
                  }
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-full border',
                    m.complete
                      ? 'border-green-600/40 bg-green-600/10 text-green-700'
                      : m.certified
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                        : m.percent > 0
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground',
                  )}
                >
                  {m.complete ? '✓ ' : m.certified ? '★ ' : ''}{m.title}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Course sections content (the left Table of Contents now lives at the top-level, so this
          is just the selected section's content). */}
      <div>
        {/* Tab content */}
        <div className="min-w-0">
        {/* OVERVIEW */}
        {/* Learners get the cognitively-optimized single-primary-action view; staff keep
            the informational overview (about + upcoming + quick links). */}
        {activeTab === 'overview' && isLearnerView && (
          <div className={isYoungBand ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8'}>
            {/* Main column: the single learning flow */}
            <div className="space-y-10 min-w-0">
              {/* 1. Course overview, hidden for all K-12 learners (already in the header; keeps modules high) */}
              {course.description && !isK12Learner && (
                <section>
                  <h2 className="text-lg font-serif font-semibold tracking-tight mb-3">Course overview</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{course.description}</p>
                </section>
              )}

              {/* 2-4. Objectives, structure, skills, hidden for all K-12 learners to minimize scrolling to lessons */}
              {!isK12Learner && (<>
              <section>
                <h2 className="text-lg font-serif font-semibold tracking-tight mb-3">Course learning objectives</h2>
                {(course.objectives && course.objectives.length > 0) ? (
                  <ul className="space-y-2.5">
                    {course.objectives.map((o, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                        <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-sm leading-relaxed">{o}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Learning objectives for this course haven't been added yet.</p>
                )}
              </section>

              {/* 3. Course structure (summary) */}
              <section>
                <h2 className="text-lg font-serif font-semibold tracking-tight mb-3">Course structure</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: BookOpen, value: String(publishedModules.length), label: publishedModules.length === 1 ? 'Module' : 'Modules' },
                    { icon: Clock, value: String(totalMinutes), label: 'Minutes' },
                    { icon: Play, value: 'Self-paced', label: 'Delivery' },
                    { icon: CheckCircle, value: 'Credential', label: 'On mastery' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                      <s.icon className="h-5 w-5 text-muted-foreground mb-2" />
                      <div className="text-base font-serif font-bold leading-none">{s.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 4. What you'll learn (skills) */}
              <section>
                <h2 className="text-lg font-serif font-semibold tracking-tight mb-3">What you'll learn</h2>
                {course.competencyTags && course.competencyTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {course.competencyTags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">The skills you'll build will be listed here.</p>
                )}
              </section>
              </>)}

              {/* 5. Start here -> pick a module */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h2 className={isYoungBand ? 'text-2xl font-bold tracking-tight' : 'text-lg font-serif font-semibold tracking-tight'} style={isYoungBand ? { color: youngPersona!.accent } : undefined}>{isYoungBand ? L("Let's start!", '¡Empecemos!') : 'Start here'}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">{progress?.percent ?? 0}% {isYoungBand ? L('done', 'listo') : 'complete'}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-3">{isYoungBand ? L('Tap a lesson to begin. 👇', 'Toca una lección para empezar. 👇') : 'Pick a module to work on. We suggest starting with the recommended one.'}</p>
                {orderedModules.length > 0 ? (
                  <div className="space-y-2">
                    {orderedModules.map(({ m, seq }) => {
                      const p = moduleProgressById.get(m.id);
                      const done = p?.complete;
                      const certified = p?.certified;
                      const pct = p?.percent ?? 0;
                      const recommended = m.id === recommendedId;
                      return (
                        <button key={m.id} onClick={() => navigate(`/courses/${courseId}/modules/${m.id}`)}
                          className={cn('w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors',
                            recommended ? 'border-primary/50 bg-primary/5' : 'border-border bg-card hover:bg-muted/40')}>
                          <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                            done ? 'bg-emerald-500/15 text-emerald-600'
                              : certified ? 'bg-amber-500/15 text-amber-600'
                              : 'bg-muted text-muted-foreground')}>
                            {done ? <CheckCircle className="h-4 w-4" /> : String(seq).padStart(2, '0')}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{m.title}</span>
                              {recommended && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">{L('Start here', 'Empieza aquí')}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{m.estimatedMinutes ?? 0} min</span>
                              {certified && !done && <span className="text-amber-600">Mastered</span>}
                              {pct > 0 && !done && <span>{pct}% viewed</span>}
                              {done && <span className="text-emerald-600">{L('Complete', 'Completado')}</span>}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No modules have been published yet.</p>
                )}
              </section>
            </div>

            {/* Side column: Calendar + Announcements, hidden for the youngest (too much) */}
            {!isYoungBand && (
            <aside className="mt-10 lg:mt-0 space-y-6 lg:sticky lg:top-20 lg:self-start">
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-2 font-serif font-semibold text-sm"><Calendar className="h-4 w-4 text-primary" /> Calendar</span>
                  <div className="flex items-center rounded-lg border border-border p-0.5 text-[11px]">
                    {(['month', 'list'] as const).map((v) => (
                      <button key={v} onClick={() => setCalendarView(v)}
                        className={cn('px-2 py-0.5 rounded-md font-medium capitalize transition-colors',
                          calendarView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{v}</button>
                    ))}
                  </div>
                </div>
                {!events ? (
                  <Skeleton className="h-48" />
                ) : calendarView === 'month' ? (
                  <MonthGrid compact events={events} cursor={calCursor} onCursor={setCalCursor} />
                ) : events.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">No events scheduled.</p>
                ) : (
                  <div className="space-y-2.5">
                    {events.slice().sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).slice(0, 8).map((e) => (
                      <div key={e.id} className="flex items-start gap-2">
                        <div className="h-2.5 w-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium leading-snug">{e.title}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDate(e.startDate)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {announcements && announcements.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Megaphone className="h-4 w-4 text-amber-600" />
                    <span className="font-serif font-semibold text-sm">Announcements</span>
                  </div>
                  {(() => {
                    const a = announcements.find((x) => x.pinned) ?? announcements[0];
                    return (
                      <div>
                        <div className="text-xs font-medium">{a.title}</div>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{a.body}</p>
                      </div>
                    );
                  })()}
                </div>
              )}
            </aside>
            )}
          </div>
        )}
        {/* ---- INSTRUCTOR BUILD VIEW (the setup wizard, under the Build tab, super-admin/staff
             only). This is the process to generate/assemble the course, NOT the learner overview. */}
        {activeTab === 'build' && isInstructor && (
          <div className="max-w-3xl space-y-8">
            {/* Step 1: start from content -- the material defines everything */}
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 1 · Start from content</p>
                <p className="text-sm text-muted-foreground">Upload or paste your material and let the AI design the modules, objectives, and structure. Optional, you can also build by hand below.</p>
              </div>
              <CourseArchitect courseId={courseId} onScaffolded={() => setTab('modules')} defaultOpen={startBuild} />
            </section>

            {/* Step 2: the essentials */}
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 2 · Course details</p>
                <p className="text-sm text-muted-foreground">Title, description, level, and status.</p>
              </div>
              <CourseSettingsCard
                key={`${course.title}|${course.status}|${course.nqfLevel}|${(course.description ?? '').length}|${(course.catalogDescription ?? '').length}`}
                course={course as any}
                saving={saveCourse.isPending}
                onSave={(patch) => saveCourse.mutate(patch)}
              />
            </section>

            {/* Step 3: objectives (collapsible card) */}
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 3 · Learning objectives</p>
                <p className="text-sm text-muted-foreground">What a learner can do by the end. Modules and assessments align to these.</p>
              </div>
              <CourseObjectivesCard
                key={JSON.stringify(course.objectives ?? [])}
                initial={course.objectives ?? []}
                saving={saveCourse.isPending}
                onSave={(objectives) => saveCourse.mutate({ objectives })}
                title={course.title}
                description={course.description}
              />
            </section>

            {/* Generate the full readings for every module from the uploaded source. */}
            {(modules?.length ?? 0) > 0 && (
              <section className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 4 · Module readings</p>
                  <p className="text-sm text-muted-foreground">Generate each module's full reading from your uploaded material.</p>
                </div>
                <GenerateAllReadings modules={modules} />
              </section>
            )}

            {/* Generate activities, case studies and discussions for every module from its content. */}
            {(modules?.length ?? 0) > 0 && (
              <section className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 5 · Coursework</p>
                  <p className="text-sm text-muted-foreground">Choose how many activities, case studies and discussions each module should have, and generate them from the content.</p>
                </div>
                <GenerateCoursework courseId={courseId} modules={modules} />
              </section>
            )}

            {/* Publish -- assign to partners, only relevant at the end. (The Modules/Activities/
                Assignments/Cases/Pages tabs at the top of the page are the build surface, so a
                duplicate row of buttons here was redundant and has been removed.) */}
            {role === 'super_admin' && (
              <section className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Step 6 · Publish</p>
                  <p className="text-sm text-muted-foreground">When the course is ready, assign it to the partners who should deliver it.</p>
                </div>
                <AssignPartnersCard courseId={courseId} />
              </section>
            )}
          </div>
        )}

        {/* ---- COURSE OVERVIEW (instructors and unenrolled visitors). The learner-facing
             overview of the course: what it covers, its objectives, and its modules. The build
             wizard lives under the Build tab, not here. ---- */}
        {activeTab === 'overview' && !enrolment && (
          <div className="max-w-3xl space-y-8">
            {/* About this course - flat, inline-editable (heading + body) */}
            <section>
              <div className="flex items-center justify-between mb-2">
                {isInstructor && aboutEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="h-5 w-1 rounded-full shrink-0" style={{ backgroundColor: aboutHStyle.color || '#f97316' }} />
                    <Input value={aboutHeadingDraft} onChange={(e) => setAboutHeadingDraft(e.target.value)} className="font-serif text-lg font-bold h-9 max-w-sm" />
                  </div>
                ) : (
                  <h2 className={cn('font-serif font-bold flex items-center gap-2', headingSizeCls(ovCfg.aboutHSize))} style={{ color: ovCfg.aboutHColor }}>
                    <span className="h-4 w-1 rounded-full" style={{ backgroundColor: ovCfg.aboutHColor || '#f97316' }} />{aboutHeading}
                  </h2>
                )}
                {isInstructor && !aboutEditing && (
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => { setAboutDraft(ovCfg.aboutHtml || escapeHtml(course.description ?? '')); setAboutHeadingDraft(aboutHeading); setAboutHStyle({ color: ovCfg.aboutHColor, size: ovCfg.aboutHSize }); setAboutEditing(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>
              {isInstructor && aboutEditing ? (
                <div className="space-y-2">
                  <HeadingStyleBar style={aboutHStyle} onChange={setAboutHStyle} />
                  <RichTextEditor value={aboutDraft} onChange={setAboutDraft} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" disabled={saveCourse.isPending} onClick={() => setAboutEditing(false)}>Cancel</Button>
                    <Button size="sm" disabled={saveCourse.isPending} onClick={() => {
                      saveCourse.mutate({ description: stripHtml(aboutDraft), overviewConfig: JSON.stringify({ ...ovCfg, aboutHtml: aboutDraft, aboutHeading: aboutHeadingDraft.trim() || 'About this course', aboutHColor: aboutHStyle.color, aboutHSize: aboutHStyle.size }) }, { onSuccess: () => setAboutEditing(false) });
                    }}>
                      {saveCourse.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : ovCfg.aboutHtml ? (
                <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed [&_h2]:font-serif [&_h2]:text-foreground [&_h3]:font-serif [&_h3]:text-foreground" dangerouslySetInnerHTML={{ __html: ovCfg.aboutHtml }} />
              ) : (
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{course.description || (isInstructor ? 'No description yet. Click Edit to add one.' : '')}</p>
              )}
            </section>

            {/* What you'll be able to do - flat, inline-editable objectives */}
            {((course.objectives?.length ?? 0) > 0 || isInstructor) && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  {isInstructor && objEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <span className="h-5 w-1 rounded-full shrink-0" style={{ backgroundColor: objHStyle.color || '#f97316' }} />
                      <Input value={objHeadingDraft} onChange={(e) => setObjHeadingDraft(e.target.value)} className="font-serif text-lg font-bold h-9 max-w-sm" />
                    </div>
                  ) : (
                    <h2 className={cn('font-serif font-bold flex items-center gap-2', headingSizeCls(ovCfg.objHSize))} style={{ color: ovCfg.objHColor }}>
                      <span className="h-4 w-1 rounded-full" style={{ backgroundColor: ovCfg.objHColor || '#f97316' }} />{objectivesHeading}
                    </h2>
                  )}
                  {isInstructor && !objEditing && (
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => {
                      const seed = ovCfg.objectivesHtml || ('<ul>' + (course.objectives ?? []).map((o) => `<li>${escapeHtml(o)}</li>`).join('') + '</ul>');
                      setObjHtmlDraft(seed);
                      setObjHeadingDraft(objectivesHeading); setObjHStyle({ color: ovCfg.objHColor, size: ovCfg.objHSize }); setBulletDraft({ shape: ovCfg.bulletShape, color: ovCfg.bulletColor }); setObjEditing(true);
                    }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </div>
                {isInstructor && objEditing ? (
                  <div className="space-y-2">
                    <HeadingStyleBar style={objHStyle} onChange={setObjHStyle} />
                    <BulletStyleBar bullet={bulletDraft} onChange={setBulletDraft} />
                    <RichTextEditor value={objHtmlDraft} onChange={setObjHtmlDraft} />
                    <p className="text-xs text-muted-foreground">Each list item (or line) becomes an objective. The bullet style above is applied to each.</p>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" disabled={saveCourse.isPending} onClick={() => setObjEditing(false)}>Cancel</Button>
                      <Button size="sm" disabled={saveCourse.isPending} onClick={() => {
                        const items = objectivesHtmlToItems(objHtmlDraft);
                        saveCourse.mutate({ objectives: itemsToPlain(items), overviewConfig: JSON.stringify({ ...ovCfg, objectivesHtml: objHtmlDraft, objectivesHeading: objHeadingDraft.trim() || "What you'll be able to do", objHColor: objHStyle.color, objHSize: objHStyle.size, bulletShape: bulletDraft.shape, bulletColor: bulletDraft.color }) }, { onSuccess: () => setObjEditing(false) });
                      }}>
                        {saveCourse.isPending ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                ) : ((ovCfg.objectivesHtml && objectivesHtmlToItems(ovCfg.objectivesHtml).length > 0) || (course.objectives?.length ?? 0) > 0) ? (
                  <ul className="space-y-2.5">
                    {(ovCfg.objectivesHtml ? objectivesHtmlToItems(ovCfg.objectivesHtml) : (course.objectives ?? []).map((o) => escapeHtml(o))).map((itemHtml: string, i: number) => (
                      <li key={i} className="flex items-start gap-2.5 text-sm">
                        <span className="mt-1"><BulletIcon shape={ovCfg.bulletShape} color={ovCfg.bulletColor} /></span>
                        <span className="leading-relaxed [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: itemHtml }} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No objectives yet. Click Edit to add them.</p>
                )}
              </section>
            )}

            {/* Front page content (flat) */}
            {pages?.find(p => p.frontPage) && (
              <section>
                <h2 className="font-serif text-lg font-bold flex items-center gap-2 mb-2"><span className="h-4 w-1 rounded-full bg-orange-500" />{pages.find(p => p.frontPage)!.title}</h2>
                <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: parseMarkdown(pages.find(p => p.frontPage)!.body) }} />
              </section>
            )}

            {/* Pinned announcement (subtle accent, not a heavy box) */}
            {announcements?.find(a => a.pinned) && (
              <section className="border-l-2 border-amber-400 pl-4">
                <div className="flex items-center gap-2 mb-1">
                  <Megaphone className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Pinned Announcement</span>
                </div>
                <p className="font-medium text-foreground text-sm">{announcements.find(a => a.pinned)!.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{announcements.find(a => a.pinned)!.body.slice(0, 200)}{announcements.find(a => a.pinned)!.body.length > 200 ? '...' : ''}</p>
              </section>
            )}

            {/* Upcoming deadlines, only when there are any (flat) */}
            {assignments?.some(a => a.dueDate && !isOverdue(a.dueDate)) && (
              <section>
                <h3 className="font-serif text-base font-bold flex items-center gap-2 mb-2"><span className="h-4 w-1 rounded-full bg-orange-500" />Upcoming</h3>
                <div className="space-y-1.5">
                  {assignments.filter(a => a.dueDate && !isOverdue(a.dueDate)).slice(0, 5).map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-foreground">{a.title}</span>
                      <span className="text-muted-foreground text-xs flex-shrink-0">{formatDate(a.dueDate)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Start here: send the learner straight into the first module from the bottom of the overview. */}
            {(modules?.length ?? 0) > 0 && (
              <section className="pt-2">
                <button onClick={() => navigate(`/courses/${courseId}/modules/${modules![0].id}`)}
                  className="group w-full flex items-center justify-between gap-4 rounded-2xl bg-primary px-6 py-5 text-left text-primary-foreground shadow-sm transition-all hover:shadow-md hover:brightness-105">
                  <span className="min-w-0">
                    <span className="block text-lg font-serif font-bold">Start here</span>
                    <span className="block text-sm text-primary-foreground/80 truncate">Begin with {modules![0].title}</span>
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 shrink-0 transition-transform group-hover:translate-x-0.5">
                    <ChevronRight className="h-5 w-5" />
                  </span>
                </button>
              </section>
            )}
          </div>
        )}

        {/* MODULES */}
        {activeTab === 'modules' && (
          <div className="space-y-4">
            {isInstructor && (
              <Card className="border-dashed">
                <CardContent className="py-4 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium mr-1 flex items-center gap-1.5">Add to this course:</span>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate('/studio')}><Layers className="h-3.5 w-3.5" /> Author a module (Studio)</Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/cases?courseId=${courseId}`)}><FileText className="h-3.5 w-3.5" /> Case study</Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/activities?courseId=${courseId}`)}><Play className="h-3.5 w-3.5" /> Interactive</Button>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground ml-auto"
                    onClick={async () => {
                      if (!window.confirm('Remove duplicate modules? This keeps the first module of each title and deletes the later copies (and their starter content).')) return;
                      try {
                        const r = await apiFetch<{ removed: number; remaining: number }>(`/courses/${courseId}/modules/dedupe`, { method: 'POST', body: JSON.stringify({}) });
                        await qc.invalidateQueries({ queryKey: ['modules', courseId] });
                        window.alert(r.removed ? `Removed ${r.removed} duplicate module${r.removed === 1 ? '' : 's'}.` : 'No duplicate modules found.');
                      } catch (e) { window.alert(e instanceof Error ? e.message : 'Could not remove duplicates.'); }
                    }}><Trash2 className="h-3.5 w-3.5" /> Remove duplicate modules</Button>
                </CardContent>
              </Card>
            )}
            {isInstructor && <NewModule courseId={courseId} nextOrder={modules?.length ?? 0} />}
            {modulesLoading && <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>}
            {modulesError && !modulesLoading && (
              <div className="text-center text-muted-foreground py-12">
                {enrolment ? 'Could not load modules. Please refresh.' : 'Enrol in this course to view its modules.'}
              </div>
            )}
            {!modulesError && modules?.length === 0 && <div className="text-center text-muted-foreground py-12">No modules yet. Use "Author a module" above to add one.</div>}
            {modules?.map((mod, i) => (
              <ModuleRow key={mod.id} mod={mod} canEdit={isInstructor} index={i}
                prev={i > 0 ? modules[i - 1] : undefined}
                next={i < modules.length - 1 ? modules[i + 1] : undefined} />
            ))}
          </div>
        )}

        {/* ASSIGNMENTS */}
        {activeTab === 'assignments' && (
          <div className="space-y-3">
            {isInstructor && <NewAssignment courseId={courseId} />}
            {assignmentsLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>}
            {!assignmentsLoading && !assignments && <div className="text-center text-muted-foreground py-12">{enrolment ? 'Could not load assignments. Please refresh.' : 'Enrol in this course to view its assignments.'}</div>}
            {assignments?.length === 0 && <div className="text-center text-muted-foreground py-12">No assignments yet.</div>}
            {assignments?.map((a) => (
              isInstructor ? (
                <InstructorAssignmentCard key={a.id} courseId={courseId} a={a} onOpen={() => navigate(`/courses/${courseId}/assignments/${a.id}`)} />
              ) : (
                <Card key={a.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/courses/${courseId}/assignments/${a.id}`)}>
                  <CardContent className="py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{a.title}</div>
                      {a.description && <div className="text-sm text-muted-foreground truncate">{a.description}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm text-muted-foreground">{a.pointsPossible} pts</span>
                      {a.dueDate && (
                        <Badge variant={isOverdue(a.dueDate) ? 'destructive' : 'outline'} className="text-xs">
                          {isOverdue(a.dueDate) ? 'OVERDUE' : formatDate(a.dueDate)}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              )
            ))}
          </div>
        )}

        {/* ACTIVITIES (interactives linked to this course) */}
        {activeTab === 'activities' && (
          <CourseActivitiesTab courseId={courseId} isInstructor={isInstructor} />
        )}

        {/* CASE STUDIES attached to this course */}
        {activeTab === 'cases' && (
          <CourseCasesTab courseId={courseId} isInstructor={isInstructor} />
        )}

        {/* DISCUSSIONS */}
        {activeTab === 'discussions' && (
          <div className="space-y-3">
            {isInstructor && (
              <NewDiscussion courseId={courseId} modules={modules ?? []} />
            )}
            {discussionsLoading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>}
            {!discussionsLoading && !discussions && <div className="text-center text-muted-foreground py-12">{enrolment ? 'Could not load discussions. Please refresh.' : 'Enrol in this course to join its discussions.'}</div>}
            {discussions?.length === 0 && <div className="text-center text-muted-foreground py-12">No discussions yet.</div>}
            {discussions?.map((d) => (
              <Card key={d.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/courses/${courseId}/discussions/${d.id}`)}>
                <CardContent className="py-4 flex items-center gap-4">
                  {d.isPinned && <Pin className="h-4 w-4 text-amber-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{d.title}</div>
                    <div className="text-sm text-muted-foreground truncate mt-0.5">{d.body.slice(0, 100)}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {d.author && <span>{d.author.firstName} {d.author.lastName}</span>}
                      <span>•</span>
                      <span>{d.replyCount} replies</span>
                      <span>•</span>
                      <span>{formatDate(d.createdAt)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ANNOUNCEMENTS */}
        {activeTab === 'announcements' && (
          <div className="space-y-3">
            {isInstructor && <NewAnnouncement courseId={courseId} />}
            {announcementsLoading && <Skeleton className="h-32" />}
            {!announcementsLoading && !announcements && <div className="text-center text-muted-foreground py-8 text-sm">Could not load announcements.</div>}
            {announcements?.length === 0 && <div className="text-center text-muted-foreground py-12">No announcements yet.</div>}
            {announcements?.map((a) => (
              <Card key={a.id} className={cn(a.pinned && "border-amber-200")}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    {a.pinned && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">📌 Pinned</Badge>}
                    <CardTitle className="text-base">{a.title}</CardTitle>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.author && <>{a.author.firstName} {a.author.lastName} · </>}{formatDate(a.createdAt)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* GRADEBOOK */}
        {activeTab === 'gradebook' && (
          <div className="space-y-4">
            {!isInstructor && myGrades && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">My Grades</h2>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-foreground">{myGrades.overallPercent != null ? `${myGrades.overallPercent.toFixed(1)}%` : ', '}</div>
                    <div className="text-xs text-muted-foreground">Overall ({myGrades.totalEarned} / {myGrades.totalPossible} pts)</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Assignment</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Score</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Grade</th>
                        <th className="text-right py-2 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myGrades.grades.map((g) => (
                        <tr key={g.assignmentId} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2.5 px-3">
                            <div>{g.assignmentTitle}</div>
                            {g.dueDate && <div className="text-xs text-muted-foreground">{formatDate(g.dueDate)}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {g.score !== null ? `${g.score} / ${g.pointsPossible}` : ', '}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {g.letterGrade ? <Badge variant="outline">{g.letterGrade}</Badge> : ', '}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {g.missing && <Badge variant="destructive" className="text-xs">Missing</Badge>}
                            {g.late && !g.missing && <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">Late</Badge>}
                            {g.score !== null && !g.missing && !g.late && <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />}
                            {!g.missing && g.score === null && !g.late && <span className="text-xs text-muted-foreground">Pending</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {isInstructor && (
              <div className="text-center py-12 space-y-3">
                <BarChart2 className="h-10 w-10 text-muted-foreground mx-auto" />
                <div className="text-muted-foreground">Full gradebook with all learner scores</div>
                <Button onClick={() => navigate(`/courses/${courseId}/gradebook`)}>View Full Gradebook</Button>
              </div>
            )}
          </div>
        )}

        {/* ALIGNMENT (staff-only): objective coverage + assessment + WCAG accessibility */}
        {activeTab === 'alignment' && isInstructor && (
          <div className="space-y-6">
            {alignmentLoading && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">Running the alignment pass. This can take a few seconds.</div>
                {[1,2,3].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            )}
            {alignmentError && !alignmentLoading && (
              <div className="text-center text-muted-foreground py-12">Could not run the alignment check. Please refresh.</div>
            )}
            {alignment && !alignmentLoading && (
              <>
                <p className="text-sm text-muted-foreground">
                  {alignment.covered} of {alignment.objectiveCount} objectives are addressed by a module, {alignment.assessed} of {alignment.objectiveCount} are assessed.
                </p>

                {/* Objective coverage + assessment */}
                <div className="space-y-3">
                  <h2 className="text-lg font-serif font-semibold tracking-tight">Objective alignment</h2>
                  {alignment.alignment.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">No objectives on this course yet. Add objectives to check alignment.</div>
                  )}
                  {alignment.alignment.map((row, i) => (
                    <Card key={i}>
                      <CardContent className="py-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-medium text-foreground min-w-0">{row.objective}</div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {row.covered
                              ? <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200"><CheckCircle className="h-3.5 w-3.5" /> Taught</Badge>
                              : <Badge variant="outline" className="gap-1 text-rose-600 border-rose-200"><XCircle className="h-3.5 w-3.5" /> Not taught</Badge>}
                            {row.assessed
                              ? <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-200"><CheckCircle className="h-3.5 w-3.5" /> Assessed</Badge>
                              : <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> Not assessed</Badge>}
                          </div>
                        </div>
                        <div className="text-sm space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">Taught in:</span>
                            {row.modules.length > 0
                              ? row.modules.map((m, j) => <Badge key={j} variant="secondary" className="text-xs">{m}</Badge>)
                              : <span className="text-rose-600">No module addresses this yet</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">Assessed by:</span>
                            {row.assessments.length > 0
                              ? row.assessments.map((a, j) => <Badge key={j} variant="secondary" className="text-xs">{a}</Badge>)
                              : <span className="text-amber-600">No assessment checks this yet</span>}
                          </div>
                        </div>
                        {row.note && <p className="text-sm text-muted-foreground">{row.note}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Accessibility checklist (WCAG) */}
                <div className="space-y-3">
                  <h2 className="text-lg font-serif font-semibold tracking-tight">Accessibility (WCAG)</h2>
                  <Card>
                    <CardContent className="py-2 divide-y divide-border">
                      {alignment.wcag.length === 0 && (
                        <div className="text-center text-muted-foreground py-6">No accessibility checks returned.</div>
                      )}
                      {alignment.wcag.map((w) => (
                        <div key={w.id} className="flex items-start gap-3 py-3">
                          {w.status === 'pass' && <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />}
                          {w.status === 'warn' && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />}
                          {w.status === 'fail' && <XCircle className="h-4 w-4 text-rose-600 mt-0.5 flex-shrink-0" />}
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{w.label}</div>
                            <div className="text-sm text-muted-foreground">{w.detail}</div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-serif font-semibold tracking-tight">Calendar</h2>
              <div className="flex items-center rounded-lg border border-border p-0.5 text-xs">
                {(['month', 'list'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCalendarView(v)}
                    className={cn('px-3 py-1 rounded-md font-medium capitalize transition-colors',
                      calendarView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {!events ? (
              <Skeleton className="h-64" />
            ) : calendarView === 'month' ? (
              <MonthGrid events={events} cursor={calCursor} onCursor={setCalCursor} />
            ) : events.length === 0 ? (
              <div className="text-center text-muted-foreground py-12 border-2 border-dashed border-border rounded-xl">No events scheduled.</div>
            ) : (
              <div className="space-y-2">
                {events.slice().sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).map((e) => (
                  <div key={e.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">{e.title}</div>
                      <div className="text-xs text-muted-foreground">{e.type.replace('_', ' ')}</div>
                    </div>
                    <div className="text-sm text-muted-foreground">{formatDate(e.startDate)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PAGES */}
        {activeTab === 'pages' && (
          <div className="space-y-4">
            {isInstructor && <NewPage courseId={courseId} />}
            {selectedPage ? (
              <div>
                <Button variant="ghost" size="sm" className="mb-4" onClick={() => setSelectedPage(null)}>← Back to Pages</Button>
                <Card>
                  <CardHeader><CardTitle>{selectedPage.title}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: parseMarkdown(selectedPage.body) }} />
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="space-y-2">
                {pagesLoading && <Skeleton className="h-32" />}
                {!pagesLoading && !pages && <div className="text-center text-muted-foreground py-8 text-sm">Could not load pages.</div>}
                {pages?.length === 0 && <div className="text-center text-muted-foreground py-12">No pages yet.</div>}
                {pages?.map((p) => (
                  <Card key={p.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedPage(p)}>
                    <CardContent className="py-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{p.title}</div>
                        {p.author && <div className="text-xs text-muted-foreground mt-0.5">{p.author.firstName} {p.author.lastName} · {formatDate(p.updatedAt)}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.frontPage && <Badge variant="outline" className="text-xs">Front Page</Badge>}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PEOPLE */}
        {activeTab === 'people' && (
          <div className="space-y-4">
            {rosterLoading && <Skeleton className="h-48" />}
            {!rosterLoading && !roster && <div className="text-center text-muted-foreground py-8 text-sm">Could not load the roster.</div>}
            {roster && (
              <>
                <div className="text-sm text-muted-foreground mb-2">{roster.length} enrolled</div>
                {isInstructor && <AddLearner courseId={courseId} />}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                        {/* Contact details are shown to course staff only. Learners never see
                            each other's email addresses (POPIA: no lawful basis). */}
                        {isInstructor && <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>}
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((r) => (
                        <tr key={r.enrolmentId} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2.5 px-3 font-medium">{r.user?.firstName} {r.user?.lastName}</td>
                          {isInstructor && <td className="py-2.5 px-3 text-muted-foreground">{r.user?.email ?? ', '}</td>}
                          <td className="py-2.5 px-3 text-muted-foreground capitalize">{r.user?.role === 'learner' ? 'Learner' : (r.user?.role?.replace('_', ' ') ?? 'Learner')}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={r.enrolmentStatus === 'completed' ? 'default' : r.enrolmentStatus === 'active' ? 'secondary' : 'outline'} className="text-xs">
                              {r.enrolmentStatus}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!isInstructor && (
                  <p className="mt-3 text-xs text-muted-foreground">Classmates' email addresses are private and shown to course staff only.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* GROUPS */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            {isInstructor && <NewGroup courseId={courseId} />}
            {groupsLoading && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[1,2].map(i => <Skeleton key={i} className="h-32" />)}</div>}
            {!groupsLoading && !groups && <div className="text-center text-muted-foreground py-12">{enrolment ? 'Could not load groups. Please refresh.' : 'Enrol in this course to view its groups.'}</div>}
            {groups?.length === 0 && <div className="text-center text-muted-foreground py-12">No groups yet.</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups?.map((g) => {
                const isMember = g.members.some(m => m.userId === user?.id);
                return (
                  <Card key={g.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{g.name}</CardTitle>
                      {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 mb-3">
                        {g.members.map((m) => (
                          <div key={m.userId} className="flex items-center gap-2 text-sm">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                              {m.user?.firstName?.[0]}
                            </div>
                            <span>{m.user?.firstName} {m.user?.lastName}</span>
                            {m.role === 'leader' && <Badge variant="outline" className="text-xs">Leader</Badge>}
                          </div>
                        ))}
                      </div>
                      {role === 'learner' && !isMember && (
                        <Button size="sm" variant="outline" onClick={() => joinGroupMutation.mutate(g.id)} disabled={joinGroupMutation.isPending}>Join</Button>
                      )}
                      {isMember && <Badge variant="secondary" className="text-xs">You're in this group</Badge>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
      </div>{/* end right column */}

      {/* Interactive Video Modal */}
      {ivBeat && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-background rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">{ivBeat.title}</h3>
              <Button variant="ghost" size="sm" onClick={() => setIvBeat(null)}>✕ Close</Button>
            </div>
            <div className="p-4">
              <InteractiveVideoPlayer
                beatId={ivBeat.id}
                videoUrl={ivBeat.videoUrl!}
                onComplete={() => setIvBeat(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
