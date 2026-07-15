import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarDays, Plus, Clock, Trash2, Users } from 'lucide-react';

type Session = {
  id: string;
  tenantId: string;
  courseId: string | null;
  title: string;
  sessionType: string;
  scheduledAt: string;
  durationMinutes: number;
  location: string | null;
};
type Member = { id: string; firstName: string | null; lastName: string | null; email: string; role: string };

const SESSION_TYPES = [
  { value: 'in_person', label: 'In person' },
  { value: 'virtual', label: 'Virtual' },
  { value: 'mentoring', label: '1:1 mentoring' },
  { value: 'workshop', label: 'Workshop' },
];

/**
 * Blended-delivery tracking UI (decision doc §10.3). Facilitators schedule sessions and
 * log attendance + coaching hours; the totals feed the funder impact report.
 */
export function Delivery() {
  const { data: user } = useGetMe();
  const qc = useQueryClient();
  const orgId = user?.organisationId ?? '';

  const { data: sessions } = useQuery({
    queryKey: ['delivery-sessions', orgId],
    queryFn: () => apiFetch<Session[]>(`/orgs/${orgId}/delivery-sessions`),
    enabled: !!orgId,
  });
  const { data: hours } = useQuery({
    queryKey: ['coaching-hours', orgId],
    queryFn: () => apiFetch<{ coachingHours: number }>(`/orgs/${orgId}/coaching-hours`),
    enabled: !!orgId,
  });

  const [title, setTitle] = useState('');
  const [sessionType, setSessionType] = useState('in_person');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [location, setLocation] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const createSession = useMutation({
    mutationFn: () =>
      apiFetch('/delivery-sessions', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: orgId,
          title,
          sessionType,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
          durationMinutes,
          location: location || null,
        }),
      }),
    onSuccess: () => {
      setTitle('');
      setScheduledAt('');
      setLocation('');
      qc.invalidateQueries({ queryKey: ['delivery-sessions', orgId] });
    },
  });
  const deleteSession = useMutation({
    mutationFn: (id: string) => apiFetch(`/delivery-sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-sessions', orgId] }),
  });

  if (!orgId) {
    return (
      <div className="space-y-4">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Sessions</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Session tracking is scoped to an organisation. Sign in as an organisation facilitator to log sessions.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Sessions</h1>
          <p className="text-muted-foreground">Log in-person, virtual, mentoring and workshop sessions and their coaching hours.</p>
        </div>
        <Card className="shadow-none">
          <CardContent className="px-5 py-3 flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-serif font-bold leading-none">{hours?.coachingHours ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">coaching hours logged</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Schedule a session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Session title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={sessionType} onChange={(e) => setSessionType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              {SESSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <Input type="number" min={5} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} placeholder="Minutes" />
            <Input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <Button onClick={() => createSession.mutate()} disabled={!title || createSession.isPending}>
            <Plus className="h-4 w-4 mr-2" />Add session
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(sessions ?? []).length === 0 && <p className="text-sm text-muted-foreground">No sessions logged yet.</p>}
        {(sessions ?? []).map((s) => (
          <Card key={s.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <button className="text-left flex-1" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                      {SESSION_TYPES.find((t) => t.value === s.sessionType)?.label ?? s.sessionType}
                    </span>
                    <span className="font-medium">{s.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(s.scheduledAt).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.durationMinutes} min</span>
                    {s.location && <span>{s.location}</span>}
                  </p>
                </button>
                <Button variant="ghost" size="icon" onClick={() => deleteSession.mutate(s.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
              {openId === s.id && <AttendanceEditor sessionId={s.id} orgId={orgId} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AttendanceEditor({ sessionId, orgId }: { sessionId: string; orgId: string }) {
  const qc = useQueryClient();
  const { data: members } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => apiFetch<Member[]>(`/organisations/${orgId}/members`),
  });
  const { data: existing } = useQuery({
    queryKey: ['attendance', sessionId],
    queryFn: () => apiFetch<{ userId: string; status: string; coachingHours: string | null }[]>(`/delivery-sessions/${sessionId}/attendance`),
  });

  const learners = (members ?? []).filter((m) => m.role === 'learner');
  const [rows, setRows] = useState<Record<string, { status: string; hours: string }>>({});

  // Seed local edit state from any existing records once loaded.
  React.useEffect(() => {
    if (!existing) return;
    const seed: Record<string, { status: string; hours: string }> = {};
    for (const r of existing) seed[r.userId] = { status: r.status, hours: r.coachingHours ?? '' };
    setRows((prev) => ({ ...seed, ...prev }));
  }, [existing]);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/delivery-sessions/${sessionId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          records: learners.map((l) => ({
            userId: l.id,
            status: rows[l.id]?.status ?? 'present',
            coachingHours: rows[l.id]?.hours ? Number(rows[l.id].hours) : undefined,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance', sessionId] });
      qc.invalidateQueries({ queryKey: ['coaching-hours', orgId] });
    },
  });

  const set = (id: string, patch: Partial<{ status: string; hours: string }>) =>
    setRows((prev) => ({ ...prev, [id]: { status: prev[id]?.status ?? 'present', hours: prev[id]?.hours ?? '', ...patch } }));

  return (
    <div className="mt-4 pt-4 border-t border-border space-y-2">
      <p className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" />Attendance &amp; coaching hours</p>
      {learners.length === 0 && <p className="text-sm text-muted-foreground">No learners in this organisation.</p>}
      {learners.map((l) => (
        <div key={l.id} className="flex items-center gap-3 text-sm">
          <span className="flex-1 truncate">{l.firstName || l.email}{l.lastName ? ` ${l.lastName}` : ''}</span>
          <select
            value={rows[l.id]?.status ?? 'present'}
            onChange={(e) => set(l.id, { status: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
            <option value="late">Late</option>
          </select>
          <Input
            type="number"
            min={0}
            step={0.5}
            placeholder="hrs"
            value={rows[l.id]?.hours ?? ''}
            onChange={(e) => set(l.id, { hours: e.target.value })}
            className="w-20 h-8"
          />
        </div>
      ))}
      {learners.length > 0 && (
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="mt-2">
          {save.isPending ? 'Saving…' : 'Save attendance'}
        </Button>
      )}
    </div>
  );
}
