import { useGetDashboardSummary, useGetDashboardActivity, useListProjects } from "@workspace/compass-api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle, Clock, ArrowRight, CheckCircle2,
  FolderKanban, ShieldAlert, Users, ChevronDown, Plus, Layers, type LucideIcon,
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/engine/PageHeader";
import { StageRail } from "@/components/engine/StageRail";
import { useAuth } from "@/lib/auth-context";
import { isBuilder } from "@/lib/roles";
import { STAGES } from "@/lib/stages";
import { format } from "date-fns";

function isOverdue(p: { targetDeliveryDate?: string | null; status: string }): boolean {
  if (!p.targetDeliveryDate || p.status === "complete") return false;
  return new Date(p.targetDeliveryDate) < new Date();
}

type StatTone = "default" | "destructive" | "warn";

function statValueColor(tone: StatTone, value: number): string {
  if (value > 0 && tone === "destructive") return "text-destructive";
  if (value > 0 && tone === "warn") return "text-accent";
  return "text-foreground";
}

function statIconColor(tone: StatTone, value: number): string {
  if (value > 0 && tone === "destructive") return "text-destructive";
  if (value > 0 && tone === "warn") return "text-accent";
  return "text-muted-foreground";
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: isActivityLoading } = useGetDashboardActivity();
  const { data: projects, isLoading: isProjectsLoading } = useListProjects();

  if (isSummaryLoading || isActivityLoading || isProjectsLoading) {
    return (
      <div className="mx-auto max-w-6xl animate-pulse space-y-6 p-6 md:p-8">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-16 rounded bg-muted" />
        <div className="h-64 rounded bg-muted" />
      </div>
    );
  }

  const allProjects = projects ?? [];
  const needsAttention = allProjects
    .filter((p) => p.status === "gate_blocked" || isOverdue(p))
    .slice(0, 5);
  const needsAttentionIds = new Set(needsAttention.map((p) => p.id));
  // Exclude anything already triaged above so no project appears twice.
  const activeProjects = allProjects
    .filter((p) => p.status === "active" && !needsAttentionIds.has(p.id))
    .sort((a, b) => b.stage - a.stage)
    .slice(0, 6);

  const stats: { label: string; value: number; tone: StatTone; icon: LucideIcon }[] = [
    { label: "Active projects", value: summary?.activeProjects ?? 0, tone: "default", icon: FolderKanban },
    { label: "Gate blocked", value: summary?.gateBlockedCount ?? 0, tone: "destructive", icon: ShieldAlert },
    { label: "Overdue", value: summary?.overdueCount ?? 0, tone: "warn", icon: Clock },
    { label: "Clients", value: summary?.totalClients ?? 0, tone: "default", icon: Users },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:p-8">
      <PageHeader
        title="Dashboard"
        subtitle="Where your curriculum projects stand and what needs you next."
      />

      {/* 1. Overview: at-a-glance counts */}
      <section aria-label="Overview">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </span>
                  <Icon className={"h-4 w-4 shrink-0 " + statIconColor(s.tone, s.value)} aria-hidden="true" />
                </div>
                <div className={"mt-2 text-3xl font-bold tabular-nums " + statValueColor(s.tone, s.value)}>
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {allProjects.length === 0 ? (
        <GettingStartedCard readOnly={!!user?.readOnly} builder={isBuilder(user?.role)} />
      ) : (
      <>
      {/* 2. Needs attention: what to triage first */}
      <section className="space-y-4" aria-label="Needs attention">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Needs attention</h2>
          {needsAttention.length > 0 && (
            <span className="text-sm text-muted-foreground">{needsAttention.length} to review</span>
          )}
        </div>
        {needsAttention.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              Every project is on track. Nothing is blocked or overdue.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {needsAttention.map((p) => {
                const blocked = p.status === "gate_blocked";
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
                  >
                    {blocked ? (
                      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                    ) : (
                      <Clock className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.clientName}</div>
                    </div>
                    <Badge variant={blocked ? "destructive" : "secondary"} className="shrink-0">
                      {blocked ? "Gate blocked" : "Overdue"}
                    </Badge>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      {/* 3. Ongoing work and history */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Active projects */}
        <section className="space-y-4 lg:col-span-2" aria-label="Active projects">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Active projects</h2>
            <Link href="/projects" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          {activeProjects.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No other active projects right now.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeProjects.map((p) => (
                <Card key={p.id} className="transition-colors hover:bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                          {p.title}
                        </Link>
                        <div className="truncate text-xs text-muted-foreground">{p.clientName}</div>
                      </div>
                      {p.targetDeliveryDate && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Due {format(new Date(p.targetDeliveryDate), "MMM d")}
                        </span>
                      )}
                    </div>
                    <StageRail
                      projectId={p.id}
                      currentStage={p.stage}
                      variant="compact"
                      className="mt-3"
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Recent activity */}
        <section aria-label="Recent activity">
          <Collapsible defaultOpen className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Recent activity</h2>
              <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                <span className="group-data-[state=closed]:hidden">Hide</span>
                <span className="group-data-[state=open]:hidden">Show</span>
                <ChevronDown
                  className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-0">
                  {activity && activity.length > 0 ? (
                    <ScrollArea className="h-96">
                      <div className="divide-y">
                        {activity.map((item) => (
                          <div key={item.id} className="flex items-start gap-3 p-4">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm">
                                <span className="font-medium">{item.action}</span> {item.entityType.toLowerCase()}{" "}
                                <span className="font-medium">{item.entityTitle}</span>
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Link href={`/projects/${item.projectId}`} className="hover:underline">
                                  {item.projectTitle}
                                </Link>
                                <span aria-hidden="true">&middot;</span>
                                <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">No recent activity</div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </section>
      </div>
      </>
      )}
    </div>
  );
}

function GettingStartedCard({ readOnly, builder }: { readOnly: boolean; builder: boolean }) {
  // Builders are assigned work rather than creating clients or projects, so they
  // get a simpler explanation instead of the setup checklist.
  if (builder) {
    return (
      <Card>
        <CardContent className="space-y-2 py-10 text-center">
          <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight">No work assigned yet</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            When a project is assigned to you it will appear here. You will move each one
            through Intake, Design, QA, and Handoff.
          </p>
        </CardContent>
      </Card>
    );
  }

  const steps = [
    {
      n: 1,
      icon: Users,
      title: "Add a client",
      body: "Create the institution or partner you are designing curriculum for.",
      href: "/clients",
      cta: "Add a client",
    },
    {
      n: 2,
      icon: Plus,
      title: "Create a project",
      body: "Start a course design project for that client.",
      href: "/projects/new",
      cta: "Create a project",
    },
    {
      n: 3,
      icon: Layers,
      title: "Move through the stages",
      body: "Work each project through the four stages below, one gated step at a time.",
      href: null,
      cta: null,
    },
  ];

  return (
    <section className="space-y-6" aria-label="Getting started">
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Get started</h2>
            <p className="text-sm text-muted-foreground">
              Set up your workspace in three steps. Your first client and project take just a minute.
            </p>
          </div>

          {readOnly && (
            <div
              role="status"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Your free trial has ended, so creating is paused. Contact us to continue building.
            </div>
          )}

          <ol className="space-y-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.n} className="flex items-start gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      <h3 className="font-medium">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{step.body}</p>
                    {step.href && step.cta && !readOnly && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={step.href}>{step.cta}</Link>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="rounded-lg border bg-muted/40 p-4">
            <h3 className="text-sm font-medium">The four stages of every project</h3>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {STAGES.map((stage) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                      <dt className="text-sm font-medium">{stage.title}</dt>
                      <dd className="text-xs text-muted-foreground">{stage.blurb}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
