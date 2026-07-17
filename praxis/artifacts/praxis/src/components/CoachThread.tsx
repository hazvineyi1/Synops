import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';

interface Msg { id: string; fromRole: string; fromName: string; body: string; createdAt: string; mine: boolean }
interface ThreadData { role: string; messages: Msg[] }

/**
 * Two-way coach <-> learner conversation on one intervention (gradebook alert). Same endpoints for
 * both sides; the backend decides sender role and who gets notified. Used in the coach's
 * intervention dialog and on the learner's grades page.
 */
export function CoachThread({ alertId, suggested }: { alertId: string; suggested?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<ThreadData>({ queryKey: ['coach-thread', alertId], queryFn: () => apiFetch<ThreadData>(`/coach-thread/${alertId}`) });
  const [text, setText] = React.useState('');
  const send = useMutation({
    mutationFn: () => apiFetch(`/coach-thread/${alertId}`, { method: 'POST', body: JSON.stringify({ body: text }) }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['coach-thread', alertId] }); },
  });
  const msgs = data?.messages ?? [];

  return (
    <div>
      <div className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-border p-3 bg-muted/20">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && msgs.length === 0 && <p className="text-xs text-muted-foreground italic">No messages yet — start the conversation below.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
              {!m.mine && <p className="text-[10px] font-bold opacity-70 mb-0.5">{m.fromName}</p>}
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className={`text-[9px] mt-1 ${m.mine ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{new Date(m.createdAt).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a message…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex justify-between items-center mt-1">
          {suggested && !text ? <button className="text-xs text-primary hover:underline" onClick={() => setText(suggested)}>Use suggested message</button> : <span />}
          <Button size="sm" disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />} Send
          </Button>
        </div>
      </div>
    </div>
  );
}
