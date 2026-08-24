import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/context/SessionContext';
import { apiFetch } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ChevronDown, CheckCircle2, Building, ExternalLink } from 'lucide-react';
import { getActivePartnerId } from '@/lib/partnerHubData';

/**
 * Partner "Received courses": the courses the super admin has given this partner, and the step where
 * the partner (e.g. Enza) allocates each course to the organisations that should run it. Only allocated
 * organisations can then build classes and enrol students on that course.
 */
type ReceivedCourse = { id: string; title: string; status: string | null; orgIds: string[] };
type OrgLite = { id: string; name: string };
type Received = { courses: ReceivedCourse[]; orgs: OrgLite[] };

export function PartnerCourses() {
  const { user } = useSession();
  const qc = useQueryClient();
  const partnerId = user?.partnerId ?? getActivePartnerId() ?? '';
  const q = partnerId ? `?partnerId=${encodeURIComponent(partnerId)}` : '';

  const { data, isLoading } = useQuery({
    queryKey: ['received-courses', partnerId],
    queryFn: () => apiFetch<Received>(`/my-partner/received-courses${q}`),
    enabled: !!partnerId,
  });
  const courses = data?.courses ?? [];
  const orgs = data?.orgs ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Courses"
        icon={BookOpen}
        subtitle="Courses the platform has assigned to you. Allocate each one to the organisations that should run it."
      />
      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Loading your courses…</Card>}
      {!isLoading && courses.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground border-dashed">
          No courses have been assigned to you yet. The Synops team ships completed courses here, then you allocate them to your organisations.
        </Card>
      )}
      <div className="space-y-3">
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} orgs={orgs} partnerId={partnerId}
            onSaved={() => qc.invalidateQueries({ queryKey: ['received-courses', partnerId] })} />
        ))}
      </div>
      {courses.length > 0 && orgs.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground border-dashed flex items-start gap-2">
          <Building className="h-4 w-4 mt-0.5 shrink-0" /> You have no organisations yet. Create one under Organisations, then allocate courses to it here.
        </Card>
      )}
    </div>
  );
}

function CourseRow({ course, orgs, partnerId, onSaved }: { course: ReceivedCourse; orgs: OrgLite[]; partnerId: string; onSaved: () => void }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(course.orgIds));
  const [flash, setFlash] = useState(false);
  useEffect(() => { setSel(new Set(course.orgIds)); }, [course.orgIds]);

  const save = useMutation({
    mutationFn: () => apiFetch(`/partner-courses/${course.id}/orgs`, { method: 'PUT', body: JSON.stringify({ orgIds: [...sel], partnerId }) }),
    onSuccess: () => { setFlash(true); setTimeout(() => setFlash(false), 1800); onSaved(); },
  });
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const dirty = [...sel].sort().join(',') !== [...course.orgIds].sort().join(',');

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
