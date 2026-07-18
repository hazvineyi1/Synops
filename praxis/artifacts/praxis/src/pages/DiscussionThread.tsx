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
import { ChevronRight, MessageSquare, Sparkles, Languages, CheckCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Counted the same way the server counts it, or the composer would lie about the rule. */
function countWords(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** Languages a learner may contribute in. Mirrors the tutor's supported set. */
const LANGS: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'xh', label: 'isiXhosa' },
  { code: 'af', label: 'Afrikaans' },
];

export function DiscussionThread() {
  const { courseId, discussionId } = useParams<{ courseId: string; discussionId: string }>();
  const [replyText, setReplyText] = useState('');
  const [lang, setLang] = useState('en');
  const [viewLang, setViewLang] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data: user } = useGetMe();

  const { data: discussion, isLoading } = useQuery({
    queryKey: ['discussion', discussionId],
    queryFn: () => apiFetch<any>(`/courses/${courseId}/discussions/${discussionId}`),
  });

  const { data: course } = useQuery({ queryKey: ['course', courseId], queryFn: () => apiFetch<any>(`/courses/${courseId}`) });

  // Translation is a reading aid, held in component state only. The originals stay the
  // record -- we never overwrite what someone actually wrote.
  const translate = useMutation({
    mutationFn: (langCode: string) =>
      apiFetch<{ langCode: string; translated: boolean; body: string; replies: { id: string; body: string }[] }>(
        `/discussions/${discussionId}/translate`, { method: 'POST', body: JSON.stringify({ langCode }) }),
  });
  const shown = translate.data && viewLang === translate.data.langCode ? translate.data : null;
  const shownReply = (id: string, original: string) =>
    shown?.replies.find((r) => r.id === id)?.body ?? original;

  const replyMutation = useMutation({
    mutationFn: () => apiFetch(`/courses/${courseId}/discussions/${discussionId}/replies`, {
      method: 'POST', body: JSON.stringify({ body: replyText, language: lang }),
    }),
    onSuccess: () => {
      setReplyText(''); setError(null);
      qc.invalidateQueries({ queryKey: ['discussion', discussionId] });
    },
    // The server owns the rule; surface its message rather than inventing our own.
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not post that reply.'),
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-24" /></div>;
  if (!discussion) return <div className="text-muted-foreground">Discussion not found.</div>;

  // The server sends the rule and the caller's own count, so the composer and the
  // completion check can never disagree about what is required or what has been done.
  const p = discussion.myParticipation ?? {
    posts: 0, required: 5, hasInitialPost: false, met: false,
    minInitialWords: 100, maxInitialWords: 150, minReplyWords: 50,
  };
  const isInitial = !p.hasInitialPost;
  const minW = isInitial ? p.minInitialWords : p.minReplyWords;
  const maxW = isInitial ? p.maxInitialWords : Infinity;
  const words = countWords(replyText);
  const okToPost = words >= minW && words <= maxW;

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
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{shown?.body ?? discussion.body}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participation progress + translation. The learner should always know how many
          contributions are expected and how many they have made, without counting by hand. */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {p.met
            ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            : <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="text-sm">
            {p.met
              ? <span className="font-medium text-emerald-600">Participation complete — {p.posts} of {p.required}</span>
              : <><span className="font-medium">{p.posts} of {p.required} contributions</span>
                  <span className="text-muted-foreground">
                    {' '}· {isInitial ? 'start with your opening post' : `${p.required - p.posts} to go`}
                  </span></>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {shown && (
            <button onClick={() => setViewLang(null)} className="text-xs text-muted-foreground hover:underline">
              Show originals
            </button>
          )}
          <Select
            value={viewLang ?? 'off'}
            onValueChange={(v) => {
              if (v === 'off') { setViewLang(null); return; }
              setViewLang(v); translate.mutate(v);
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <Languages className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <SelectValue placeholder="Translate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">No translation</SelectItem>
              {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>Read in {l.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {translate.isPending && <p className="text-xs text-muted-foreground">Translating the thread...</p>}
      {translate.data && viewLang === translate.data.langCode && !translate.data.translated && (
        <p className="text-xs text-amber-600">This thread could not be translated just now. Showing the originals.</p>
      )}

      {/* Replies */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">{discussion.replies?.length ?? 0} replies</span>
        </div>
        <div className="space-y-3">
          {discussion.replies?.map((reply: any) => {
            const ai = !!reply.isAiFacilitator;
            return (
              <Card key={reply.id} className={
                ai ? 'border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20'
                   : reply.isInstructorReply ? 'border-blue-200 bg-blue-50/30 dark:bg-blue-950/20' : ''}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback
                        className={ai ? 'bg-violet-100 text-violet-700' : reply.isInstructorReply ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}
                        style={{ fontSize: '12px' }}>
                        {ai ? <Sparkles className="h-4 w-4" /> : (reply.author?.firstName?.[0] ?? '?')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">
                          {ai ? 'Discussion facilitator' : `${reply.author?.firstName ?? ''} ${reply.author?.lastName ?? ''}`}
                        </span>
                        {ai
                          ? <Badge variant="outline" className="text-xs text-violet-600 border-violet-300">AI facilitator</Badge>
                          : reply.isInstructorReply && <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Instructor</Badge>}
                        <span className="text-xs text-muted-foreground">{formatDate(reply.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {shownReply(reply.id, reply.body)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Reply form. The word rule is shown live, but the server is what enforces it. */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-medium text-foreground">
              {isInitial ? 'Write your opening post' : 'Add to the discussion'}
            </div>
            <div className="flex items-center gap-2">
              <Languages className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {isInitial
              ? `Your opening post should be ${minW}-${maxW} words: set out your own view and say why.`
              : `At least ${minW} words, so there is something for someone to respond to.`}
            {' '}You can write in any of the languages listed.
          </p>

          <div className="flex gap-3">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{user?.firstName?.[0] ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder={isInitial ? 'Set out your view and the reasoning behind it...' : 'Respond to a specific point someone made...'}
                value={replyText}
                onChange={(e) => { setReplyText(e.target.value); setError(null); }}
                className="min-h-[140px] text-sm resize-none"
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className={cn('text-xs tabular-nums',
                  words === 0 ? 'text-muted-foreground'
                    : okToPost ? 'text-emerald-600'
                    : 'text-amber-600')}>
                  {words} {words === 1 ? 'word' : 'words'}
                  {isInitial
                    ? words > maxW ? ` — ${words - maxW} over the limit`
                      : words < minW ? ` — ${minW - words} to go` : ' — good to post'
                    : words < minW ? ` — ${minW - words} to go` : ' — good to post'}
                </span>
                <Button
                  onClick={() => replyMutation.mutate()}
                  disabled={replyMutation.isPending || !okToPost}
                  size="sm"
                >
                  {replyMutation.isPending ? 'Posting...' : isInitial ? 'Post your opening' : 'Post reply'}
                </Button>
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
