import React from 'react';

/**
 * Shared page header for consistency across the app. Before this, pages hand-rolled their own
 * <h1> at 2xl/3xl/4xl, serif or not — this normalises them to one 3xl serif header with an
 * optional icon tile, subtitle and right-aligned action.
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
