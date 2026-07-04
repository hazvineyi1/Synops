import { useState } from "react";
import { useListProjects, useListClients } from "@workspace/compass-api-client";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Calendar, ArrowRight, Plus } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/engine/PageHeader";
import { StageRail } from "@/components/engine/StageRail";
import { STAGES } from "@/lib/stages";

const STAGE_FILTERS = [
  { value: "all", label: "All stages" },
  ...STAGES.map((s) => ({ value: String(s.id), label: `${s.id}: ${s.title}` })),
];

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "complete", label: "Complete" },
  { value: "gate_blocked", label: "Gate blocked" },
];

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "gate_blocked") return "destructive";
  if (status === "complete") return "default";
  return "secondary";
}

export default function Projects() {
  const { data: projects, isLoading: isProjectsLoading } = useListProjects();
  const { data: clients, isLoading: isClientsLoading } = useListClients();
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  if (isProjectsLoading || isClientsLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const filteredProjects =
    projects?.filter((p) => {
      if (stageFilter !== "all" && p.stage.toString() !== stageFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      return true;
    }) || [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Projects"
        subtitle="Every course design project, in order through the pipeline."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> New project
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger aria-label="Filter by stage">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              {STAGE_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filteredProjects.length === 0 ? (
          <div className="col-span-full rounded-md border bg-card py-12 text-center text-muted-foreground">
            No projects match the current filters.
          </div>
        ) : (
          filteredProjects.map((project) => {
            const client = clients?.find((c) => c.id === project.clientId);
            const meta = [
              project.tier ? `Tier ${project.tier}` : null,
              project.lms ? project.lms.replace(/_/g, " ") : null,
            ].filter(Boolean);
            return (
              <Card key={project.id} className="transition-colors hover:bg-muted/30">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${project.id}`}
                        className="text-lg font-semibold hover:underline"
                      >
                        {project.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="truncate">
                          {client?.name || project.clientName || "Unknown client"}
                        </span>
                      </div>
                    </div>
                    <Badge variant={statusVariant(project.status)} className="shrink-0 capitalize">
                      {project.status.replace("_", " ")}
                    </Badge>
                  </div>

                  <StageRail projectId={project.id} currentStage={project.stage} variant="compact" />

                  <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      {project.targetDeliveryDate
                        ? format(new Date(project.targetDeliveryDate), "MMM d, yyyy")
                        : "No target date"}
                      {meta.length > 0 && (
                        <span className="capitalize text-muted-foreground/80">&middot; {meta.join(" · ")}</span>
                      )}
                    </span>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center font-medium text-primary hover:underline"
                    >
                      Open <ArrowRight className="ml-1 h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
