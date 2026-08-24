import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquarePlus, CheckCircle2, ExternalLink, ChevronRight, Inbox, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

type ChangeRequest = {
  id: string;
  partner_name: string | null;
  course_id: string;
  course_title: string | null;
  module_id: string | null;
  module_title: string | null;
  section: string | null;
  category: string;
  details: string;
  status: string;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
  resolved_by_name: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  banner: 'Banner or image', content: 'Content correction', activity: 'Add / adjust activity',
  assessment: 'Assessment or rubric', objective: 'Learning objective', reading: 'Reading or resource',
  accessibility: 'Accessibility', other: 'Other',
};

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (!d) return '';
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/** Super-admin review queue for partner-submitted change requests. */
export function ChangeRequests() {
  const { data: me } = useGetMe();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const isSuper = me?.role === 'super_admin';

  const { data: requests, isLoading } = useQuery({
    queryKey: ['change-requests', filter],
    queryFn: () => apiFetch<ChangeRequest[]>(`/change-requests?status=${filter}`),
    enabled: isSuper,
  });

  const resolve = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'resolved' | 'open'; note?: string }) =>
      apiFetch(`/change-requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status, resolutionNote: note }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] });
      qc.invalidateQueries({ queryKey: ['change-requests-open-count'] });
    },
  });

  if (!isSuper) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h1 className="text-xl font-serif font-semibold mb-1">Not available</h1>
        <p className="text-sm text-muted-foreground">The change-requests queue is for the platform team only.</p>
      </div>
    );
  }

  const list = requests ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Change requests</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Changes partners have asked for on their courses. Each is tagged with exactly what they were viewing. Make the edit in the course, then mark the request resolved.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {(['open', 'resolved', 'all'] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} className="capitalize" onClick={() => setFilter(f)}>
            {f}
          </Button>
        ))}
      </div>

      {isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>}

      {!isLoading && list.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <h2 className="font-serif font-semibold text-lg mb-1">{filter === 'open' ? 'No open requests' : 'Nothing here'}</h2>
            <p className="text-sm text-muted-foreground">{filter === 'open' ? 'Partners have no pending change requests right now.' : 'No requests match this filter.'}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {list.map((r) => {
          const trail = [r.partner_name, r.course_title, r.module_title, r.section].filter(Boolean);
          const openCourse = () => navigate(r.module_id ? `/courses/${r.course_id}/modules/${r.module_id}` : `/courses/${r.course_id}`);
          return (
            <Card key={r.id} className={cn('overflow-hidden', r.status === 'resolved' && 'opacity-70')}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[r.category] ?? r.category}</Badge>
                      {r.status === 'resolved'
                        ? <Badge className="gap-1 border-transparent bg-emerald-500/15 text-[10px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Resolved</Badge>
                        : <Badge className="border-transparent bg-amber-500/15 text-[10px] text-amber-700">Open</Badge>}
                      <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                    </div>
                    {trail.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {trail.map((t, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <ChevronRight className="h-3 w-3" />}
                            <span className={i === trail.length - 1 ? 'font-medium text-foreground' : ''}>{t}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openCourse}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </Button>
                </div>

                <p className="text-sm text-foreground whitespace-pre-line rounded-lg bg-muted/40 p-3">{r.details}</p>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    Requested by {r.created_by_name || r.created_by_email || 'a partner'}
                    {r.status === 'resolved' && r.resolved_by_name ? ` · resolved by ${r.resolved_by_name}` : ''}
                  </span>
                  {r.status === 'open' ? (
                    <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={resolve.isPending}
                      onClick={() => {
                        const note = window.prompt('Optional note back to the partner (what you changed):') ?? undefined;
                        resolve.mutate({ id: r.id, status: 'resolved', note });
                      }}>
                      <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate({ id: r.id, status: 'open' })}>
                      Reopen
                    </Button>
                  )}
                </div>
                {r.resolution_note && (
                  <p className="text-xs text-muted-foreground border-l-2 border-emerald-400 pl-2">Resolution: {r.resolution_note}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default ChangeRequests;
