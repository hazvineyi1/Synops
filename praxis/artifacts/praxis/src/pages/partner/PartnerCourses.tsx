import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BookOpen, ChevronDown, CheckCircle2, Building, ExternalLink, Plus, Trash2, Compass, Pencil } from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';

/**
 * Partner "Received courses": the courses the super admin has given this partner, and the step where
 * the partner (e.g. Enza) allocates each course to the organisations that should run it. Only allocated
 * organisations can then build classes and enrol students on that course.
 *
 * When the super admin is acting inside a partner hub (active partner set), they additionally get an
 * "Add courses" picker (pull platform courses into this partner) and a per-course Remove control
 * (un-assign a course from this partner without deleting it from the platform catalogue). These
 * controls are hidden from partner_admins — distribution stays a super-admin action.
 */
type ReceivedCourse = { id: string; title: string; status: string | null; orgIds: string[] };
type OrgLite = { id: string; name: string };
type Received = { courses: ReceivedCourse[]; orgs: OrgLite[] };
type Shippable = { id: string; title: string; status: string | null };
type PracticeCredential = {
  id: string; code: string; title: string; summary: string | null; activity_brief: string | null;
  gateway_guidance?: string | null; example_assignment?: string | null; rationale?: string | null; sort?: number;
};

export function PartnerCourses() {
  const { user } = useSession();
  const qc = useQueryClient();
  const isSuper = user?.role === 'super_admin';
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const q = partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : '';

  const { data, isLoading } = useQuery({
    queryKey: ['received-courses', partnerId],
    queryFn: () => apiFetch<Received>(`/my-partner/received-courses${q}`),
    enabled: !!partnerId,
  });
  const courses = data?.courses ?? [];
  const orgs = data?.orgs ?? [];

  // Platform catalogue (super admin only), used to power the "Add courses" picker.
  const { data: catalogue } = useQuery({
    queryKey: ['shippable-courses'],
    queryFn: () => apiFetch<Shippable[]>(`/courses/shippable`),
    enabled: isSuper,
  });
  const assignedIds = useMemo(() => new Set(courses.map((c) => c.id)), [courses]);
  const addable = (catalogue ?? []).filter((c) => !assignedIds.has(c.id));

  const invalidate = () => qc.invalidateQueries({ queryKey: ['received-courses', partnerId] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        icon={BookOpen}
        subtitle={isSuper
          ? 'Add or remove the courses this partner carries, then allocate each to the organisations that should run it.'
          : 'Courses the platform has assigned to you. Allocate each one to the organisations that should run it.'}
      />

      {isSuper && (
        <AddCoursesPanel addable={addable} partnerId={partnerId} onAdded={invalidate} />
      )}

      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading your courses…</Card>}
      {!isLoading && courses.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
          {isSuper
            ? 'This partner carries no courses yet. Use “Add courses” above to pull courses from the platform catalogue.'
            : 'No courses have been assigned to you yet. The Synops team ships completed courses here, then you allocate them to your organisations.'}
        </Card>
      )}
      <div className="space-y-3">
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} orgs={orgs} partnerId={partnerId} isSuper={isSuper}
            onSaved={invalidate} />
        ))}
      </div>
      {courses.length > 0 && orgs.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground border-dashed flex items-start gap-2">
          <Building className="h-4 w-4 mt-0.5 shrink-0" /> You have no organisations yet. Create one under Organisations, then allocate courses to it here.
        </Card>
      )}

      <PracticeCredentialsSection partnerId={partnerId} q={q} isSuper={isSuper} />
    </div>
  );
}

/**
 * Practice credentials are a SEPARATE track from catalogue courses (they live in practice_credentials,
 * delivered through /practice, reviewed in the Review queue). They never appear in the course list, so
 * a partner that runs a practice programme (e.g. Manchester Review Board) looked "empty" here. This
 * surfaces them, clearly labelled, so they're discoverable from the hub.
 */
function PracticeCredentialsSection({ partnerId, q, isSuper }: { partnerId: string; q: string; isSuper: boolean }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PracticeCredential | 'new' | null>(null);
  const { data: creds = [] } = useQuery({
    queryKey: ['practice-credentials', partnerId],
    queryFn: () => apiFetch<PracticeCredential[]>(`/practice/credentials${q}`),
    enabled: !!partnerId,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['practice-credentials', partnerId] });
  // Nothing to show for a non-super partner with no credentials; a super admin always gets the panel so
  // they can add the partner's first credential.
  if (!creds.length && !isSuper) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-2">
        <Compass className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Practice credentials</h2>
        <span className="text-xs text-muted-foreground">Delivered through the practice track, not the course catalogue.</span>
        {isSuper && (
          <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5" /> Add credential
          </Button>
        )}
      </div>
      {creds.length === 0 && isSuper && (
        <Card className="p-4 text-sm text-muted-foreground border-dashed">This partner has no practice credentials yet. Use “Add credential” to create one from the template.</Card>
      )}
      {creds.map((c) => (
        <Card key={c.id} className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{c.title}</span>
                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary shrink-0">Practice credential</Badge>
              </div>
              {c.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.summary}</p>}
              {c.activity_brief && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium text-foreground/70">Activity: </span>{c.activity_brief}</p>}
            </div>
            {isSuper && (
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setEditing(c)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </div>
        </Card>
      ))}
      <Card className="p-3 border-dashed text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        <span>Learners work through these in the practice track. {isSuper ? 'The reflective cycle (Experience → Reflect → Name it → Try it) is a shared framework across all credentials. To see a learner’s view, impersonate a candidate; to review submissions, open the Review queue.' : 'Open the practice track to continue.'}</span>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => navigate(isSuper ? '/practice/review' : '/practice')}>
          <ExternalLink className="h-3.5 w-3.5" /> {isSuper ? 'Review queue' : 'Open practice track'}
        </Button>
      </Card>

      {editing && (
        <CredentialEditor
          partnerId={partnerId}
          credential={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

// Super-admin editor for a practice credential (create from template, or edit an existing one).
function CredentialEditor({ partnerId, credential, onClose, onSaved }: {
  partnerId: string; credential: PracticeCredential | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !credential;
  const [f, setF] = useState({
    title: credential?.title ?? '',
    code: credential?.code ?? '',
    summary: credential?.summary ?? '',
    activity_brief: credential?.activity_brief ?? '',
    gateway_guidance: credential?.gateway_guidance ?? '',
    example_assignment: credential?.example_assignment ?? '',
    rationale: credential?.rationale ?? '',
  });
  const [loadedTemplate, setLoadedTemplate] = useState(false);

  // For a NEW credential, prefill the fields from the server template so the author shapes rather than
  // starts blank.
  useQuery({
    queryKey: ['credential-template'],
    queryFn: async () => {
      const t = await apiFetch<Record<string, string>>('/practice/credentials/template');
      if (isNew && !loadedTemplate) {
        setF((cur) => ({
          title: cur.title || t.title || '', code: cur.code, summary: cur.summary || t.summary || '',
          activity_brief: cur.activity_brief || t.activity_brief || '', gateway_guidance: cur.gateway_guidance || t.gateway_guidance || '',
          example_assignment: cur.example_assignment || t.example_assignment || '', rationale: cur.rationale || t.rationale || '',
        }));
        setLoadedTemplate(true);
      }
      return t;
    },
    enabled: isNew,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiFetch('/practice/credentials', { method: 'POST', body: JSON.stringify({ partnerId, ...f }) })
      : apiFetch(`/practice/credentials/${credential!.id}`, { method: 'PATCH', body: JSON.stringify(f) }),
    onSuccess: onSaved,
  });

  const field = (key: keyof typeof f, label: string, hint: string, rows = 3) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {rows === 1
        ? <Input value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} placeholder={hint} />
        : <Textarea rows={rows} value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} placeholder={hint} />}
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add practice credential' : 'Edit practice credential'}</DialogTitle>
          <DialogDescription>Shape what learners must demonstrate and how it’s reviewed. The reflective cycle (Experience → Reflect → Name it → Try it) is shared across all credentials and isn’t edited here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {field('title', 'Title', 'e.g. Ethical Leadership in Practice', 1)}
          {field('code', 'Code', 'A short unique code for this partner, e.g. ELP', 1)}
          {field('summary', 'Summary', 'One line on what this credential recognises.', 2)}
          {field('activity_brief', 'Activity', 'What the learner must do to demonstrate this capability.', 3)}
          {field('gateway_guidance', 'How this is reviewed', 'What the reviewer looks for; pass or resubmit with feedback.', 3)}
          {field('example_assignment', 'Example', 'A concrete example of what a strong submission looks like.', 3)}
          {field('rationale', 'Why this matters', 'A short, research-grounded note on why this capability matters.', 3)}
          {save.isError && <p className="text-xs text-destructive">Could not save. {(save.error as Error)?.message}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.title.trim() || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : isNew ? 'Create credential' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Super-admin-only: collapsible picker of platform courses not yet carried by this partner.
function AddCoursesPanel({ addable, partnerId, onAdded }: { addable: Shippable[]; partnerId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const add = useMutation({
    mutationFn: () => apiFetch(`/platform/ship-courses`, { method: 'POST', body: JSON.stringify({ partnerId, courseIds: [...sel] }) }),
    onSuccess: () => { setSel(new Set()); setOpen(false); onAdded(); },
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Card className="p-0 overflow-hidden border-primary/30">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Plus className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Add courses to this partner</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {addable.length > 0 ? `${addable.length} course${addable.length === 1 ? '' : 's'} available in the platform catalogue` : 'All catalogue courses are already assigned'}
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {addable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Every course in the platform catalogue is already carried by this partner.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {addable.map((c) => (
                <label key={c.id} className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-sm cursor-pointer ${sel.has(c.id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{c.title}</span>
                  {c.status && <span className="text-[10px] uppercase tracking-wide text-muted-foreground capitalize shrink-0">{c.status}</span>}
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setSel(new Set()); setOpen(false); }}>Cancel</Button>
            <Button size="sm" disabled={sel.size === 0 || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? 'Adding…' : `Add ${sel.size || ''} course${sel.size === 1 ? '' : 's'}`.trim()}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function CourseRow({ course, orgs, partnerId, isSuper, onSaved }: { course: ReceivedCourse; orgs: OrgLite[]; partnerId: string; isSuper: boolean; onSaved: () => void }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(course.orgIds));
  const [flash, setFlash] = useState(false);
  useEffect(() => { setSel(new Set(course.orgIds)); }, [course.orgIds]);

  const save = useMutation({
    mutationFn: () => apiFetch(`/partner-courses/${course.id}/orgs`, { method: 'PUT', body: JSON.stringify({ orgIds: [...sel], partnerId }) }),
    onSuccess: () => { setFlash(true); setTimeout(() => setFlash(false), 1800); onSaved(); },
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/platform/unship-course`, { method: 'POST', body: JSON.stringify({ partnerId, courseId: course.id }) }),
    onSuccess: () => onSaved(),
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dirty = [...sel].sort().join(',') !== [...course.orgIds].sort().join(',');

  const onRemove = () => {
    const msg = course.orgIds.length > 0
      ? `Remove "${course.title}" from this partner?\n\nIt is currently allocated to ${course.orgIds.length} organisation${course.orgIds.length === 1 ? '' : 's'}. Those allocations will be cleared. The course stays in the platform catalogue and can be re-added later.`
      : `Remove "${course.title}" from this partner?\n\nThe course stays in the platform catalogue and can be re-added later.`;
    if (window.confirm(msg)) remove.mutate();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="w-full flex items-center gap-3 p-4">
        <button onClick={() => setOpen((o) => !o)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <div className="min-w-0">
            <div className="font-semibold truncate">{course.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {course.status && <span className="capitalize mr-2">{course.status}</span>}
              {course.orgIds.length > 0
                ? `Allocated to ${course.orgIds.length} organisation${course.orgIds.length === 1 ? '' : 's'}`
                : 'Not allocated to any organisation yet'}
            </div>
          </div>
        </button>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => navigate(`/courses/${course.id}`)}
          title="Open the full course. Use 'View as student' inside to go through it as a learner would.">
          <ExternalLink className="h-3.5 w-3.5" /> View course
        </Button>
        {isSuper && (
          <Button variant="ghost" size="sm" className="gap-1.5 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={remove.isPending} onClick={onRemove} title="Remove this course from the partner (keeps it in the platform catalogue)">
            <Trash2 className="h-3.5 w-3.5" /> {remove.isPending ? 'Removing…' : 'Remove'}
          </Button>
        )}
        <button onClick={() => setOpen((o) => !o)} className="shrink-0 text-muted-foreground" aria-label="Toggle allocation">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-border p-4 space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Which organisations should run this course?</div>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organisations to allocate to yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {orgs.map((o) => (
                <label key={o.id} className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-sm cursor-pointer ${sel.has(o.id) ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/30'}`}>
                  <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4" />
                  <Building className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{o.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            {flash && <span className="text-xs text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
            <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save allocation'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
