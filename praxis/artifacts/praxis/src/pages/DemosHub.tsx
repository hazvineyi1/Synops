import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useGetMe, useListPartners } from '@workspace/api-client-react';
import { setActivePartner } from '@/lib/partnerHubData';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, ExternalLink, FileWarning, Pencil, PlayCircle } from 'lucide-react';

/**
 * Super-admin "Demos" hub. Each card offers three actions:
 *  - Open demo: previews the learner experience by IMPERSONATING the demo learner, which keeps the
 *    super-admin session alive (stashed in the impersonator cookie). A "Stop impersonating" banner
 *    returns you with no logout. This is deliberately NOT the public /demos/* landing, which runs
 *    demo-login and replaces your session with the learner's - dropping you at /sign-in on the way back.
 *  - Edit: enters that partner's hub as super admin to change its practice credentials.
 *  - Public link: the shareable /demos/* URL (signs the visitor in as the demo learner) - for prospects.
 */
const DEMOS = [
  {
    name: 'Educator Professional Development',
    blurb: 'AI in teaching — practice credentials (lesson design, assessment integrity, teaching students to use AI well). Coached practice, reflective cycle.',
    path: '/demos/educator',
    slug: 'educator-pd',
  },
  {
    name: 'PEJ Justice Practice',
    blurb: 'Justice-sector guided practice — decisions under pressure (scene sequencing, lawful inspection, eliciting accounts). Serious, decision-first.',
    path: '/demos/pej-practice',
    slug: 'pej-practice',
  },
  {
    name: 'Manchester Review Board',
    blurb: 'Ethical / values-driven leadership — practice credentials (ethical leadership, team formation, servant leadership). Coached by Mutale.',
    path: '/demos/mrb',
    slug: 'zambian-leadership',
  },
];

export function DemosHub() {
  const { data: me } = useGetMe();
  const { data: partners } = useListPartners();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isSuper = me?.role === 'super_admin';

  if (!isSuper) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h1 className="text-xl font-serif font-semibold mb-1">Not available</h1>
        <p className="text-sm text-muted-foreground">The demos hub is for the platform team only.</p>
      </div>
    );
  }

  // Resolve the partner id from its stable slug, falling back to the display name. Slugs never
  // change; display names can (the MRB demo's partner is named "Zambian Clinician Leadership").
  const partnerIdFor = (d: { slug: string; name: string }): string | undefined => {
    const list = (partners ?? []) as Array<{ id: string; slug?: string; name?: string }>;
    const bySlug = list.find((p) => (p?.slug ?? '').trim().toLowerCase() === d.slug.toLowerCase());
    if (bySlug) return bySlug.id;
    const want = d.name.trim().toLowerCase();
    return list.find((p) => (p?.name ?? '').trim().toLowerCase() === want)?.id;
  };

  const editAsSuper = (d: { slug: string; name: string }) => {
    const id = partnerIdFor(d);
    if (!id) {
      const list = (partners ?? []) as Array<{ slug?: string; name?: string }>;
      const found = list.map((p) => `${p?.name ?? '?'} (${p?.slug ?? '?'})`).join(', ') || 'none loaded';
      window.alert(
        `Couldn't find the "${d.name}" partner (looking for slug "${d.slug}").\n\nPartners currently loaded: ${found}.`,
      );
      return;
    }
    setActivePartner(id);
    navigate('/partner/courses');
  };

  // Preview the demo AS its learner while keeping the super-admin session (impersonation). The
  // "Stop impersonating" banner on /practice returns you — no logout, no /sign-in bounce.
  const preview = async (d: { slug: string; name: string }) => {
    setBusy(d.slug);
    setErr(null);
    try {
      await apiFetch(`/platform/demos/${d.slug}/enter`, { method: 'POST' });
      window.location.href = '/practice';
    } catch (e) {
      setErr(`${d.name}: ${e instanceof Error ? e.message : 'Could not open the demo.'}`);
      setBusy(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Demos</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          <strong>Open demo</strong> previews the learner experience while keeping your super-admin session — a “Stop impersonating” banner brings you straight back, no logout. <strong>Edit</strong> opens that partner's practice credentials. <strong>Public link</strong> is the shareable URL for prospects (it signs the visitor in as the demo learner).
        </p>
      </div>

      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {DEMOS.map((d) => (
          <Card key={d.path} className="p-4 flex flex-col">
            <div className="font-serif font-semibold">{d.name}</div>
            <p className="text-sm text-muted-foreground mt-1 flex-1">{d.blurb}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={busy === d.slug}
                onClick={() => preview(d)}
              >
                <PlayCircle className="h-3.5 w-3.5" /> {busy === d.slug ? 'Opening…' : 'Open demo'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                title="Edit this demo’s practice credentials as super admin"
                onClick={() => editAsSuper(d)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
            <a
              href={d.path}
              target="_blank"
              rel="noreferrer"
              className="mt-2 text-[11px] text-muted-foreground hover:underline inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Public link ({d.path})
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default DemosHub;
