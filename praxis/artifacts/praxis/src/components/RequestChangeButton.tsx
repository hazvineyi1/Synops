import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MessageSquarePlus, CheckCircle2, ChevronRight } from 'lucide-react';

/**
 * "Request a change" — a partner-side staff member views a platform course read-only and, instead of
 * editing, files a change request tagged with exactly what they were looking at (course + module +
 * section). The request goes to the super-admin review queue. This is the ONLY way a partner asks for
 * course changes; they never author directly.
 */
export type ChangeContext = {
  courseId: string;
  courseTitle?: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  section?: string | null;
  partnerName?: string | null;
};

// Anticipated change types, so the partner usually just picks one and adds a line of detail.
const CATEGORIES: { value: string; label: string }[] = [
  { value: 'banner', label: 'Banner or image' },
  { value: 'content', label: 'Content correction or update' },
  { value: 'activity', label: 'Add or adjust an activity' },
  { value: 'assessment', label: 'Assessment or rubric' },
  { value: 'objective', label: 'Learning objective' },
  { value: 'reading', label: 'Reading or resource' },
  { value: 'accessibility', label: 'Accessibility issue' },
  { value: 'other', label: 'Something else' },
];

export function RequestChangeButton({ context, variant = 'outline', size = 'sm', className }: {
  context: ChangeContext;
  variant?: 'outline' | 'ghost' | 'default';
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('content');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () => apiFetch('/change-requests', {
      method: 'POST',
      body: JSON.stringify({
        courseId: context.courseId,
        courseTitle: context.courseTitle,
        moduleId: context.moduleId ?? undefined,
        moduleTitle: context.moduleTitle ?? undefined,
        section: context.section ?? undefined,
        partnerName: context.partnerName ?? undefined,
        category,
        details: details.trim(),
      }),
    }),
    onSuccess: () => { setDone(true); },
  });

  const reset = () => { setCategory('content'); setDetails(''); setDone(false); submit.reset(); };
  const trail = [context.courseTitle, context.moduleTitle, context.section].filter(Boolean);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => { reset(); setOpen(true); }}
        title="Ask the Synops team to change something in this course">
        <MessageSquarePlus className="mr-1.5 h-4 w-4" /> Request a change
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          {done ? (
            <div className="py-4 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <DialogTitle className="text-lg">Request sent</DialogTitle>
              <p className="text-sm text-muted-foreground">The Synops team will review it and make the change. You can track it under your requests.</p>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Request a change</DialogTitle>
                <DialogDescription>Tell the Synops team what to change. They make the edit — you don't need to.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {trail.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {trail.map((t, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <ChevronRight className="h-3 w-3" />}
                        <span className={i === trail.length - 1 ? 'font-medium text-foreground' : ''}>{t}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">What needs changing?</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Details</span>
                  <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)}
                    placeholder="Describe the change you'd like — e.g. 'The banner doesn't match our brand, please use a professional office image' or 'This module has no activities; please add a short interactive.'" />
                </label>
                {submit.isError && (
                  <p className="text-xs text-destructive">Could not send the request. Please try again.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={details.trim().length < 3 || submit.isPending} onClick={() => submit.mutate()}>
                  {submit.isPending ? 'Sending…' : 'Send request'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
