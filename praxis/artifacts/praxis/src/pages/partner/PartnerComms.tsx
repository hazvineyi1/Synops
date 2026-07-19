import React, { useState } from 'react';
import { useSession } from '@/context/SessionContext';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Megaphone, Send, Users, Building, CheckCircle2, Bell, FileText } from 'lucide-react';
import { getPartnerHub } from '@/lib/partnerHubData';

type Audience = { kind: 'all' } | { kind: 'org'; org: string } | { kind: 'role'; role: string };
type Announcement = {
  id: string; subject: string; body: string; audienceLabel: string;
  channel: 'in-app' | 'email' | 'both'; sentAt: string; recipients: number;
};

const TEMPLATES = [
  { name: 'Maintenance window', subject: 'Scheduled maintenance', body: 'The platform will be briefly unavailable for scheduled maintenance. No action is needed on your side.' },
  { name: 'New cohort kickoff', subject: 'Your new cohort starts soon', body: 'Welcome! Your programme kicks off shortly. Sign in to complete your profile and review the first module.' },
  { name: 'Compliance reminder', subject: 'Action needed: outstanding paperwork', body: 'A quick reminder to submit any outstanding compliance documentation so your funding stays on track.' },
];

/**
 * Communications (upgrade §7). Partner-wide broadcast: compose an in-app or email announcement to
 * all organisations, a single organisation, or a role, with reusable templates and a sent history.
 * Functional on seeded data - actual delivery is a backend step, kept separate from the UI surface.
 */
export function PartnerComms() {
  const { user } = useSession();
  const h = getPartnerHub(user?.partnerId);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<'in-app' | 'email' | 'both'>('both');
  const [audience, setAudience] = useState<Audience>({ kind: 'all' });
  const [sent, setSent] = useState<Announcement[]>([
    { id: 's1', subject: 'Q3 programme calendar published', body: 'The updated programme calendar for the coming quarter is now available.', audienceLabel: 'All organisations', channel: 'both', sentAt: '2026-07-08', recipients: h.accounts.length },
    { id: 's2', subject: 'Reminder: submit WSP/ATR evidence', body: 'Please upload your quarterly skills-spend evidence to keep SETA funding compliant.', audienceLabel: h.orgs[0]?.name ?? 'Organisation', channel: 'email', sentAt: '2026-07-02', recipients: 6 },
  ]);
  const [flash, setFlash] = useState<string | null>(null);

  const audienceLabel = (a: Audience) =>
    a.kind === 'all' ? 'All organisations' : a.kind === 'org' ? a.org : `Role: ${a.role}`;

  const estRecipients = (a: Audience) =>
    a.kind === 'all' ? h.accounts.length
      : a.kind === 'org' ? h.accounts.filter((x) => x.orgName === a.org).length
        : h.accounts.filter((x) => x.role === a.role).length;

  const applyTemplate = (t: typeof TEMPLATES[number]) => { setSubject(t.subject); setBody(t.body); };

  const send = () => {
    if (!subject.trim() || !body.trim()) return;
    setSent((xs) => [{
      id: `s_${Date.now()}`, subject: subject.trim(), body: body.trim(),
      audienceLabel: audienceLabel(audience), channel, sentAt: new Date().toISOString().slice(0, 10),
      recipients: estRecipients(audience),
    }, ...xs]);
    setSubject(''); setBody('');
    setFlash('Announcement sent and written to the audit log.');
    window.setTimeout(() => setFlash(null), 3500);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Communications" icon={Megaphone} subtitle={`${h.partnerName} - broadcast announcements to your organisations, coaches and learners.`} />

      {flash && (
        <Card className="p-3 border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {flash}
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Megaphone} label="Announcements sent" value={sent.length} tint="bg-indigo-500/10 text-indigo-600" />
        <StatCard icon={Users} label="Reachable accounts" value={h.accounts.length} tint="bg-emerald-500/10 text-emerald-600" />
        <StatCard icon={Building} label="Organisations" value={h.orgs.length} tint="bg-violet-500/10 text-violet-600" />
        <StatCard icon={FileText} label="Templates" value={TEMPLATES.length} tint="bg-muted text-muted-foreground" />
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
        </TabsList>

        {/* Compose */}
        <TabsContent value="compose" className="mt-4 grid lg:grid-cols-[1fr_260px] gap-4">
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Audience</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button onClick={() => setAudience({ kind: 'all' })}
                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', audience.kind === 'all' ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/40')}>All organisations</button>
                {h.orgs.map((o) => (
                  <button key={o.id} onClick={() => setAudience({ kind: 'org', org: o.name })}
                    className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition', audience.kind === 'org' && audience.org === o.name ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/40')}>{o.name}</button>
                ))}
                {['coach', 'org_admin', 'learner'].map((r) => (
                  <button key={r} onClick={() => setAudience({ kind: 'role', role: r })}
                    className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition', audience.kind === 'role' && audience.role === r ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/40')}>{r.replace('_', ' ')}s</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Channel</label>
              <div className="mt-1.5 flex gap-2">
                {(['in-app', 'email', 'both'] as const).map((c) => (
                  <button key={c} onClick={() => setChannel(c)}
                    className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition', channel === c ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/40')}>{c}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Announcement subject" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write your message…" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y" />
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> {audienceLabel(audience)} · ~{estRecipients(audience)} recipients · {channel}</span>
              <Button onClick={send} disabled={!subject.trim() || !body.trim()} className="gap-1.5"><Send className="h-4 w-4" /> Send announcement</Button>
            </div>
          </Card>

          <Card className="p-4 h-fit">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Templates</div>
            <div className="space-y-2">
              {TEMPLATES.map((t) => (
                <button key={t.name} onClick={() => applyTemplate(t)} className="w-full rounded-lg border border-border p-3 text-left hover:border-primary/40 hover:bg-muted/30 transition">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.subject}</div>
                </button>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Sent */}
        <TabsContent value="sent" className="mt-4 space-y-2">
          {sent.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{a.subject}</div>
                  <div className="text-sm text-muted-foreground line-clamp-2">{a.body}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">{a.audienceLabel}</Badge>
                    <Badge variant="secondary" className="capitalize text-[10px]">{a.channel}</Badge>
                    <span>· {a.recipients} recipients</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(a.sentAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</span>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">Every announcement is written to the Partner Activity Audit Log. Actual in-app and email delivery is wired at the backend messaging step.</p>
    </div>
  );
}
