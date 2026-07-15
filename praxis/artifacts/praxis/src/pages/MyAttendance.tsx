import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, Clock, MapPin } from 'lucide-react';

type Row = {
  id: string;
  status: string;
  coachingHours: string | null;
  session: {
    title: string;
    sessionType: string;
    scheduledAt: string;
    durationMinutes: number;
    location: string | null;
  } | null;
};

const TYPE_LABEL: Record<string, string> = {
  in_person: 'In person',
  virtual: 'Virtual',
  mentoring: '1:1 mentoring',
  workshop: 'Workshop',
};

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-teal-100 text-teal-800',
  absent: 'bg-orange-100 text-orange-800',
  excused: 'bg-slate-100 text-slate-700',
  late: 'bg-amber-100 text-amber-800',
};

/** Learner self-view of their session attendance and coaching hours (decision §10.3). */
export function MyAttendance() {
  const { data, isLoading } = useQuery({ queryKey: ['me-attendance'], queryFn: () => apiFetch<Row[]>('/me/attendance') });

  const rows = data ?? [];
  const totalHours = rows.reduce((s, r) => s + (r.coachingHours ? Number(r.coachingHours) : 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-serif font-bold tracking-tight">My sessions</h1>
        <p className="text-muted-foreground">Your in-person, virtual and mentoring sessions{totalHours > 0 ? ` — ${totalHours} coaching hours so far` : ''}.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <CalendarDays className="h-10 w-10 mx-auto mb-4 opacity-40" />
            No sessions recorded yet. In-person and mentoring sessions will appear here once your facilitator logs them.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                      {r.session ? TYPE_LABEL[r.session.sessionType] ?? r.session.sessionType : 'Session'}
                    </span>
                    <span className="font-medium">{r.session?.title ?? 'Session'}</span>
                  </div>
                  {r.session && (
                    <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(r.session.scheduledAt).toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{r.session.durationMinutes} min</span>
                      {r.session.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.session.location}</span>}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-700'}`}>
                    {r.status}
                  </span>
                  {r.coachingHours && Number(r.coachingHours) > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">{Number(r.coachingHours)} coaching hrs</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
