import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import React from "react";

export interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  /** Right-aligned actions (buttons, badges). */
  actions?: React.ReactNode;
  /** Optional content rendered below the title row (status badges, meta). */
  children?: React.ReactNode;
}

/**
 * Consistent, calm page header for every engine surface: an optional
 * breadcrumb, a single clear title, a supporting subtitle, and a slot for the
 * page's primary action. Keeping one header pattern makes the workspace feel
 * structured rather than crowded.
 */
export function PageHeader({ title, subtitle, crumbs, actions, children }: PageHeaderProps) {
  return (
    <div className="space-y-2">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                  {c.href && !last ? (
                    <Link href={c.href} className="hover:text-foreground hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? "page" : undefined} className={last ? "text-foreground" : undefined}>
                      {c.label}
                    </span>
                  )}
                  {!last && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
