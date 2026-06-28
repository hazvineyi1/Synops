import { type ReactNode } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useGetProject, getGetProjectQueryKey, type Project } from "@workspace/kanon-api-client";
import { Lightbulb, CalendarClock, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, type Crumb } from "@/components/engine/PageHeader";
import { StageRail } from "@/components/engine/StageRail";
import { getStage, STAGE_COUNT } from "@/lib/stages";
import { getMethod } from "@/lib/instructional-methods";
import { cn } from "@/lib/utils";

interface WorkspaceContext {
  project: Project;
}

interface ProjectWorkspaceProps {
  /**
   * The stage this page represents (Intake=0..Handoff=3). Omit on the project
   * overview hub, where the rail shows progress without a "you are here" marker.
   */
  stageId?: number;
  /** Overrides the default subtitle (the stage blurb). */
  subtitle?: string;
  /** Right-aligned header actions; receives the loaded project. */
  actions?: (ctx: WorkspaceContext) => ReactNode;
  /** Extra meta shown under the title (client, due date, status). */
  meta?: (ctx: WorkspaceContext) => ReactNode;
  children: (ctx: WorkspaceContext) => ReactNode;
}

/**
 * One shared frame for every page about a single project (the overview hub and
 * each stage workspace). It loads the project once, then renders a consistent
 * header (breadcrumb, project title, stage badge) and the StageRail timeline so a
 * builder always sees where they are and can move directly between stages. Pages
 * supply only their own content through the render prop, keeping each surface calm
 * and uniform.
 */
export function ProjectWorkspace({ stageId, subtitle, actions, meta, children }: ProjectWorkspaceProps) {
  const params = useParams();
  const [location] = useLocation();
  const projectId = parseInt(params.id || "0", 10);

  const { data: project, isLoading } = useGetProject(projectId, {
    query: { enabled: !!projectId, queryKey: getGetProjectQueryKey(projectId) },
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8">Project not found.</div>;

  const stage = stageId != null ? getStage(stageId) : undefined;
  const method = project.designMethod ? getMethod(project.designMethod) : undefined;
  const ctx: WorkspaceContext = { project };

  const crumbs: Crumb[] = [
    { label: "Dashboard", href: "/" },
    { label: "Projects", href: "/projects" },
    { label: project.title, href: `/projects/${project.id}` },
    ...(stage ? [{ label: stage.title }] : []),
  ];

  const tools = [
    { href: `/projects/${project.id}/meetings`, label: "Agendas", icon: CalendarClock },
    { href: `/projects/${project.id}/time`, label: "Time tracking", icon: Clock },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <PageHeader
        title={project.title}
        subtitle={subtitle ?? stage?.blurb}
        crumbs={crumbs}
        actions={actions?.(ctx)}
      >
        {(stage || meta || method) && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {stage && (
              <Badge variant="secondary" className="uppercase tracking-wide">
                Stage {stage.id + 1} of {STAGE_COUNT}: {stage.title}
              </Badge>
            )}
            {method && (
              <Badge variant="outline" className="gap-1.5 font-normal">
                <Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Method: {method.name}
              </Badge>
            )}
            {meta?.(ctx)}
          </div>
        )}
      </PageHeader>

      {/* Pinned so progress and stage navigation stay visible while scrolling content. */}
      <section
        aria-label="Project navigation"
        className="sticky top-0 z-20 -mx-4 mt-4 border-b bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-8 md:px-8"
      >
        <StageRail
          projectId={project.id}
          currentStage={project.stage}
          viewingStage={stageId}
          variant="full"
        />
        <nav
          aria-label="Project tools"
          className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5"
        >
          <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tools
          </span>
          {tools.map((tool) => {
            const active = location === tool.href;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <tool.icon className="h-4 w-4" aria-hidden="true" />
                {tool.label}
              </Link>
            );
          })}
        </nav>
      </section>

      <div className="space-y-5 pt-5">{children(ctx)}</div>
    </div>
  );
}
