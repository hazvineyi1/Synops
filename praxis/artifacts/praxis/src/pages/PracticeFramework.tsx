import React, { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiFetch } from '@/lib/api';
import { useSession } from '@/context/SessionContext';
import { getActivePartnerId } from '@/lib/partnerHubData';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Network, ChevronDown, AlertTriangle, Pencil } from 'lucide-react';

/**
 * The MRB Framework for Advanced Leadership Practice, as the Hub holds it: 12 Core Competencies, every
 * credential linked to one primary competency (and any secondary ones), and programme-specific practice
 * areas. Staff use this to check a programme design before it goes live: which credentials still need
 * content, which are mandatory, and which competencies a programme leaves without a primary credential.
 */
type Competency = { id: string; num: number; code: string; title: string; definition: string | null; version: string | null };
type Cred = {
  id: string; code: string; title: string; framework_name: string | null; published: boolean;
  has_activity: boolean; has_outcomes: boolean; candidates: number;
  links: Array<{ competency_id: string; primary: boolean }>;
};
type AreaCred = { credential_id: string; mandatory: boolean; is_new: boolean; note: string | null };
type Programme = { id: string; code: string; title: string; status: string; notes: string | null; areas: Array<{ id: string; code: string; title: string; credentials: AreaCred[] }> };
type Framework = { partnerId?: string; competencies: Competency[]; credentials: Cred[]; programmes: Programme[]; needsMigration?: boolean };

export function PracticeFramework() {
  const { user } = useSession();
  const [, navigate] = useLocation();
  const role = user?.role;
  const isSuper = role === 'super_admin';
  const canAdmin = isSuper || role === 'partner_admin';
  const pid = user?.partnerId ?? getActivePartnerId() ?? '';
  const q = pid ? `?partnerId=${encodeURIComponent(pid)}` : '';
  const { data, refetch, isLoading } = useQuery({ queryKey: ['practice-framework', pid], queryFn: () => apiFetch<Framework>(`/practice/framework${q}`) });
  const [err, setErr] = useState<string | null>(null);

  const seed = useMutation({
    mutationFn: () => apiFetch(`/practice/framework/seed${q}`, { method: 'POST' }),
    onSuccess: () => { setErr(null); refetch(); },
    onError: (e: any) => setErr(e?.message ?? 'Could not load the framework.'),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/practice/programmes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => { setErr(null); refetch(); },
    onError: (e: any) => setErr(e?.message ?? 'Could not change the programme status.'),
  });
  const flag = useMutation({
    mutationFn: ({ areaId, credentialId, body }: { areaId: string; credentialId: string; body: Record<string, boolean> }) =>
      apiFetch(`/practice/areas/${areaId}/credentials/${credentialId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => refetch(),
  });

  const credById = useMemo(() => new Map((data?.credentials ?? []).map((c) => [c.id, c])), [data]);
  const compById = useMemo(() => new Map((data?.competencies ?? []).map((c) => [c.id, c])), [data]);
  const primaryOf = (c?: Cred) => c?.links.find((l) => l.primary)?.competency_id;

  if (isLoading || !data) return <div className="max-w-5xl mx-auto p-8 text-sm text-muted-foreground">Loading...</div>;

  const empty = data.competencies.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Leadership framework"
        icon={Network}
        subtitle="The Framework for Advanced Leadership Practice: 12 Core Competencies, the credentials that develop them, and the practice areas each programme offers."
        action={isSuper ? (
          <Button size="sm" variant="outline" disabled={seed.isPending} onClick={() => seed.mutate()}>
            {seed.isPending ? 'Loading...' : empty ? 'Load framework v2.1' : 'Refresh framework v2.1'}
          </Button>
        ) : undefined}
      />

      {err && <Card className="rounded-none p-3 text-sm text-destructive border-destructive/40">{err}</Card>}

      {empty ? (
        <Card className="rounded-none p-6 text-sm text-muted-foreground">
          {data.needsMigration
            ? 'The framework tables are not set up on this database yet. A super admin can load the framework, which also runs the setup.'
            : 'No framework has been loaded for this partner yet.'}
          {isSuper && ' Use "Load framework v2.1" above.'}
        </Card>
      ) : (
        <>
          <Card className="rounded-none p-4 text-sm text-muted-foreground border-primary/30">
            <span className="font-medium text-foreground">Design principle. </span>
            No individual is expected to demonstrate all 12 Core Competencies. Teams and organisations develop the full range
            collectively. Each credential has one primary competency and may contribute to others.
          </Card>

          {data.programmes.map((p) => (
            <ProgrammeCard key={p.id} p={p} credById={credById} compById={compById} competencies={data.competencies} primaryOf={primaryOf}
              canAdmin={canAdmin} isSuper={isSuper} busy={setStatus.isPending}
              onStatus={(status) => setStatus.mutate({ id: p.id, status })}
              onFlag={(areaId, credentialId, body) => flag.mutate({ areaId, credentialId, body })}
              onEdit={(id) => navigate(`/practice/credential/${id}`)} />
          ))}

          <Section title={`Core Competencies (${data.competencies.length})`} defaultOpen>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.competencies.map((c) => {
                const prim = data.credentials.filter((cr) => primaryOf(cr) === c.id);
                const sec = data.credentials.filter((cr) => cr.links.some((l) => l.competency_id === c.id && !l.primary));
                return (
                  <div key={c.id} className="border border-border p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="ed-num text-muted-foreground">{c.num}</span>
                      <span className="font-semibold">{c.title}</span>
                    </div>
                    {c.definition && <p className="text-xs text-muted-foreground mt-1">{c.definition}</p>}
                    <div className="text-xs mt-2"><span className="font-medium">Primary credentials: </span>{prim.map((x) => x.framework_name ?? x.title).join(', ') || 'none'}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{sec.length} secondary credential{sec.length === 1 ? '' : 's'}</div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={`All credentials (${data.credentials.length})`}>
            <div className="divide-y divide-border">
              {data.credentials.map((c) => {
                const pc = compById.get(primaryOf(c) ?? '');
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.framework_name ?? c.title}{c.framework_name && c.framework_name !== c.title && <span className="text-muted-foreground font-normal"> (shown as "{c.title}")</span>}</div>
                      <div className="text-xs text-muted-foreground">{pc ? `${pc.num}. ${pc.title}` : 'Not linked to a competency'} · {c.links.filter((l) => !l.primary).length} secondary</div>
                    </div>
                    <ContentBadges c={c} />
                    {isSuper && <Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate(`/practice/credential/${c.id}`)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function ProgrammeCard({ p, credById, compById, competencies, primaryOf, canAdmin, isSuper, busy, onStatus, onFlag, onEdit }: {
  p: Programme; credById: Map<string, Cred>; compById: Map<string, Competency>; competencies: Competency[];
  primaryOf: (c?: Cred) => string | undefined; canAdmin: boolean; isSuper: boolean; busy: boolean;
  onStatus: (s: string) => void; onFlag: (areaId: string, credentialId: string, body: Record<string, boolean>) => void; onEdit: (id: string) => void;
}) {
  const distinct = [...new Set(p.areas.flatMap((a) => a.credentials.map((c) => c.credential_id)))];
  const mandatory = new Set(p.areas.flatMap((a) => a.credentials.filter((c) => c.mandatory).map((c) => c.credential_id)));
  const needsContent = distinct.filter((id) => { const c = credById.get(id); return c && (!c.has_activity || !c.has_outcomes); });
  const coverage = competencies.map((comp) => ({ comp, n: distinct.filter((id) => primaryOf(credById.get(id)) === comp.id).length }));
  const statusTone = p.status === 'active' ? 'bg-emerald-600 text-white' : p.status === 'draft' ? 'bg-amber-500 text-white' : 'bg-muted text-foreground';

  return (
    <Card className="rounded-none p-5 space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <Badge className={`text-[10px] rounded-none ${statusTone}`}>{p.status}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {p.areas.length} practice areas · {distinct.length} distinct credentials · {mandatory.size} marked mandatory
          </div>
          {p.notes && <p className="text-xs text-muted-foreground mt-2 max-w-3xl">{p.notes}</p>}
        </div>
        {canAdmin && (
          <div className="flex gap-2">
            {p.status !== 'active'
              ? <Button size="sm" disabled={busy} onClick={() => onStatus('active')} title="Makes these practice areas the candidate catalogue for this partner">Make live</Button>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus('draft')}>Return to draft</Button>}
          </div>
        )}
      </div>

      {p.status !== 'active' && (
        <div className="text-xs text-muted-foreground">
          While this programme is a draft, candidates keep seeing the current catalogue. Making it live replaces the catalogue
          with these practice areas, and is blocked until every credential in it has an activity.
        </div>
      )}

      {needsContent.length > 0 && (
        <div className="flex items-start gap-2 text-xs border border-amber-500/40 bg-amber-500/5 p-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
          <span>{needsContent.length} of {distinct.length} credentials still need an activity or learning outcomes from MRB before this programme can go live.</span>
        </div>
      )}

      <div>
        <div className="ed-overline text-foreground mb-2">Primary competency coverage</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {coverage.map(({ comp, n }) => (
            <div key={comp.id} className={`flex items-center justify-between gap-2 px-2 py-1 text-xs border ${n === 0 ? 'border-amber-500/50 bg-amber-500/5' : 'border-border'}`}
              title={n === 0 ? 'No credential in this programme has this as its primary competency' : undefined}>
              <span className="truncate">{comp.num}. {comp.title}</span>
              <span className="ed-num shrink-0">{n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {p.areas.map((a) => (
          <div key={a.id} className="border border-border">
            <div className="px-3 py-2 bg-muted/30 text-sm font-semibold">{a.title}</div>
            <div className="divide-y divide-border">
              {a.credentials.map((ac) => {
                const c = credById.get(ac.credential_id);
                const pc = compById.get(primaryOf(c) ?? '');
                return (
                  <div key={ac.credential_id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c?.framework_name ?? c?.title ?? 'Unknown credential'}</div>
                      <div className="text-xs text-muted-foreground">{pc ? `Primary: ${pc.num}. ${pc.title}` : ''}</div>
                      {ac.note && <div className="text-xs text-amber-700 mt-0.5">{ac.note}</div>}
                    </div>
                    {c && <ContentBadges c={c} />}
                    {canAdmin ? (
                      <>
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                          <input type="checkbox" checked={ac.mandatory} onChange={(e) => onFlag(a.id, ac.credential_id, { mandatory: e.target.checked })} /> Mandatory
                        </label>
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                          <input type="checkbox" checked={ac.is_new} onChange={(e) => onFlag(a.id, ac.credential_id, { is_new: e.target.checked })} /> New
                        </label>
                      </>
                    ) : (
                      <>
                        {ac.mandatory && <Badge variant="outline" className="text-[10px] rounded-none">Mandatory</Badge>}
                        {ac.is_new && <Badge variant="outline" className="text-[10px] rounded-none">New</Badge>}
                      </>
                    )}
                    {isSuper && c && <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={() => onEdit(c.id)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContentBadges({ c }: { c: Cred }) {
  return (
    <span className="flex flex-wrap gap-1 shrink-0">
      {!c.published && <Badge variant="outline" className="text-[10px] rounded-none">Unpublished</Badge>}
      {!c.has_activity && <Badge variant="outline" className="text-[10px] rounded-none border-amber-500/50 text-amber-700">No activity</Badge>}
      {!c.has_outcomes && <Badge variant="outline" className="text-[10px] rounded-none border-amber-500/50 text-amber-700">No outcomes</Badge>}
      {c.candidates > 0 && <Badge variant="outline" className="text-[10px] rounded-none">{c.candidates} candidate{c.candidates === 1 ? '' : 's'}</Badge>}
    </span>
  );
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card className="rounded-none p-0">
      <button className="w-full flex items-center justify-between px-5 py-3 text-left" onClick={() => setOpen((o) => !o)}>
        <span className="ed-overline text-foreground">{title}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </Card>
  );
}

export default PracticeFramework;
