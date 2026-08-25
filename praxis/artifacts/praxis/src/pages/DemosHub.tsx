import React from 'react';
import { useGetMe } from '@workspace/api-client-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Compass, ExternalLink, FileWarning } from 'lucide-react';

/**
 * Super-admin "Demos" hub: quick access to every public demo entry. Each link opens the practice
 * experience for that partner (no sign-up; it signs you in as that demo's learner in a new tab).
 */
const DEMOS = [
  {
    name: 'Educator Professional Development',
    blurb: 'AI in teaching — practice credentials (lesson design, assessment integrity, teaching students to use AI well). Coached practice, reflective cycle.',
    path: '/demos/educator',
  },
  {
    name: 'PEJ Justice Practice',
    blurb: 'Justice-sector guided practice — decisions under pressure (scene sequencing, lawful inspection, eliciting accounts). Serious, decision-first.',
    path: '/demos/pej-practice',
  },
  {
    name: 'Manchester Review Board',
    blurb: 'Ethical / values-driven leadership — practice credentials (ethical leadership, team formation, servant leadership). Coached by Mutale.',
    path: '/demos/mrb',
  },
];

export function DemosHub() {
  const { data: me } = useGetMe();
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-serif font-bold tracking-tight">Demos</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          The public demo experiences for the practice partners. Each opens the reflective practice format (no modules or activities). Opening a demo signs you in as that demo's learner in a new tab — close it and sign back in as yourself to return to the console.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {DEMOS.map((d) => (
          <Card key={d.path} className="p-4 flex flex-col">
            <div className="font-serif font-semibold">{d.name}</div>
            <p className="text-sm text-muted-foreground mt-1 flex-1">{d.blurb}</p>
            <code className="mt-2 text-[11px] text-muted-foreground truncate">{d.path}</code>
            <a href={d.path} target="_blank" rel="noreferrer" className="mt-3">
              <Button size="sm" className="w-full gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Open demo
              </Button>
            </a>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default DemosHub;
