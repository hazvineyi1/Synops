import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Bell, CheckSquare, MessageSquare, Award, Megaphone, ClipboardList } from 'lucide-react';

function formatDate(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

const ICONS: Record<string, React.ComponentType<any>> = {
  announcement: Megaphone,
  assignment_due: ClipboardList,
  assignment_graded: CheckSquare,
  discussion_reply: MessageSquare,
  credential_issued: Award,
  general: Bell,
};

export function NotificationsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch<any[]>('/notifications'),
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const readAllMutation = useMutation({
    mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const handleClick = async (n: any) => {
    if (!n.read) await readMutation.mutateAsync(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        {notifications?.some(n => !n.read) && (
          <Button variant="outline" size="sm" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending}>
            Mark all read
          </Button>
        )}
      </div>

      {isLoading && <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}</div>}

      {notifications?.length === 0 && (
        <div className="text-center py-16">
          <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-lg">You're all caught up! 🎉</p>
          <p className="text-muted-foreground text-sm mt-1">No new notifications.</p>
        </div>
      )}

      <div className="space-y-2">
        {notifications?.map((n) => {
          const Icon = ICONS[n.type] ?? Bell;
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                !n.read ? "border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900" : "border-border"
              )}
            >
              <div className={cn("h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0", !n.read ? "bg-blue-100 dark:bg-blue-900" : "bg-muted")}>
                <Icon className={cn("h-4 w-4", !n.read ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium", !n.read ? "text-foreground" : "text-muted-foreground")}>{n.title}</p>
                  {!n.read && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                </div>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>}
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(n.createdAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
