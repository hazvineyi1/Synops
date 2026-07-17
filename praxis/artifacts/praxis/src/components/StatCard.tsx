import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Shared learner UI primitives, previously copy-pasted inside LearnerHome / CoachHome /
 * CoachSettings / Dashboard. One definition, so the at-a-glance stat tiles and section headers
 * look identical everywhere.
 */

export function StatCard({
  icon: Icon,
  label,
  value,
  tint = 'bg-primary/10 text-primary',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tint?: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3.5">
      <div className={cn('h-11 w-11 shrink-0 rounded-xl flex items-center justify-center', tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tracking-tight leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </Card>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-serif font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
