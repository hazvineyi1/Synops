import React from 'react';
import { useLocation } from 'wouter';
import { useGetMe, useListPartners } from '@workspace/api-client-react';
import { setActivePartner } from '@/lib/partnerHubData';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, ExternalLink, FileWarning, Pencil } from 'lucide-react';

/**
 * Super-admin "Demos" hub: quick access to every public demo entry. Each card can either open the
 * public practice experience (signs you in as that demo's learner in a new tab) or drop the
 * super-admin into that partner's hub to edit its practice credentials.
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
        `Couldn't find the "${d.name}" partner (looking for slug "${d.slug}").\n\nPartners currently loaded: ${found}.\n\nIf it's missing, open the demo once (Open demo) to provision it, then try Edit again.`,
      );
      return;
    }
    setActivePartner(id);
    navigate('/partner/courses');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Demos</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          The public demo experiences for the practice partners. <strong>Open demo</strong> launches the reflective practice format in a new tab (it signs you in as that demo's learner — close it and sign back in as yourself to return). <strong>Edit</strong> drops you into that partner's hub as super admin to change its practice credentials.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {DEMOS.map((d) => {
          return (
            <Card key={d.path} className="p-4 flex flex-col">
              <div className="font-serif font-semibold">{d.name}</div>
              <p className="text-sm text-muted-foreground mt-1 flex-1">{d.blurb}</p>
              <code className="mt-2 text-[11px] text-muted-foreground truncate">{d.path}</code>
              <div className="mt-3 flex gap-2">
                <a href={d.path} target="_blank" rel="noreferrer" className="flex-1">
                  <Button size="sm" className="w-full gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" /> Open demo
                  </Button>
                </a>
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
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default DemosHub;
