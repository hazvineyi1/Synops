import React, { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useGetMe } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ChevronRight, MessageSquare } from 'lucide-react';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DiscussionThread() {
  const { courseId, discussionId } = useParams<{ courseId: string; discussionId: string }>();
  const [replyText, setReplyText] = useState('');
  const qc = useQueryClient();
  const { data: user } = useGetMe();

  const { data: discussion, isLoading } = useQuery({
    queryKey: ['discussion', discussionId],
    queryFn: () => apiFetch<any>(`/courses/${courseId}/discussions/${discussionId}`),
  });

  const { data: course } = useQuery({ queryKey: ['course', courseId], queryFn: () => apiFetch<any>(`/courses/${courseId}`) });

  const replyMutation = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/discussions/${discussionId}/replies`, {
      method: 'POST', body: JSON.stringify({ body: replyText }),
    }),
    onSuccess: () => {
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['discussion', discussionId] });
    },
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-24" /></div>;
  if (!discussion) return <div className="text-muted-foreground">Discussion not found.</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/courses" className="hover:text-foreground">Courses</a>
        <ChevronRight className="h-4 w-4" />
        <a href={`/courses/${courseId}?tab=discussions`} className="hover:text-foreground">{course?.title ?? 'Course'}</a>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground truncate max-w-xs">{discussion.title}</span>
      </div>

      {/* Original post */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {discussion.author?.firstName?.[0] ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-foreground">{discussion.author?.firstName} {discussion.author?.lastName}</span>
                {['coach', 'org_admin', 'partner_admin', 'super_admin'].includes(discussion.author?.role ?? '') && (
                  <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Instructor</Badge>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(discussion.createdAt)}</span>
              </div>
              <h2 className="text-lg font-bold text-foreground mb-3">{discussion.title}</h2>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{discussion.body}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Replies */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">{discussion.replies?.length ?? 0} replies</span>
        </div>
        <div className="space-y-3">
          {discussion.replies?.map((reply: any) => (
            <Card key={reply.id} className={reply.isInstructorReply ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/20' : ''}>
              <CardContent className="pt-4 pb-4">
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className={reply.isInstructorReply ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'} style={{ fontSize: '12px' }}>
                      {reply.author?.firstName?.[0] ?? '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-foreground">{reply.author?.firstName} {reply.author?.lastName}</span>
                      {reply.isInstructorReply && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Instructor</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDate(reply.createdAt)}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{reply.body}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Reply form */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="text-sm font-medium text-foreground">Post a reply</div>
          <div className="flex gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{user?.firstName?.[0] ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Share your thoughts..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="min-h-[100px] text-sm resize-none"
              />
              <Button
                onClick={() => replyMutation.mutate()}
                disabled={replyMutation.isPending || !replyText.trim()}
                size="sm"
              >
                {replyMutation.isPending ? 'Posting...' : 'Post Reply'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
