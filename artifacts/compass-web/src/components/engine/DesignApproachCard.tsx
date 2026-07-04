import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  type ProjectUpdateDesignMethod,
} from "@workspace/compass-api-client";
import { Lightbulb, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { INSTRUCTIONAL_METHODS, getMethod } from "@/lib/instructional-methods";

/**
 * Project-level instructional design method chooser. The method is a directional
 * decision made at kickoff: it is surfaced on every stage (via ProjectWorkspace)
 * and drives the Design stage (guiding phases plus prefilled add dialogs).
 */
export function DesignApproachCard({
  projectId,
  selectedKey,
}: {
  projectId: number;
  selectedKey: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateProject = useUpdateProject();
  const method = selectedKey ? getMethod(selectedKey) : undefined;

  function choose(value: string) {
    const designMethod = (value === "none" ? null : value) as ProjectUpdateDesignMethod;
    updateProject.mutate(
      { id: projectId, data: { designMethod } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({
            title: designMethod ? "Design approach set" : "Design approach cleared",
            description: designMethod ? getMethod(designMethod)?.name ?? designMethod : undefined,
          });
        },
        onError: () => toast({ title: "Could not update design approach", variant: "destructive" }),
      },
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/[0.03] shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          <CardTitle className="text-lg">Design approach</CardTitle>
        </div>
        <CardDescription className="m-0 max-w-[70ch]">
          Choose the instructional design method that guides this build. It frames every stage from
          intake through handoff and pre-fills the activities and assessments you create in Design.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="design-method">Method</Label>
          <div className="flex items-center gap-3">
            <Select value={selectedKey ?? "none"} onValueChange={choose}>
              <SelectTrigger id="design-method" disabled={updateProject.isPending}>
                <SelectValue placeholder="Not selected yet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not selected yet</SelectItem>
                {INSTRUCTIONAL_METHODS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {updateProject.isPending && (
              <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving
              </span>
            )}
          </div>
        </div>

        {method ? (
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{method.name}</div>
                <div className="text-sm text-muted-foreground">{method.tagline}</div>
              </div>
              <Badge variant="outline" className="shrink-0 text-xs font-normal">{method.origin}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{method.summary}</p>
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phases that guide the build
              </div>
              <ol className="flex flex-wrap gap-1.5">
                {method.phases.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs"
                  >
                    <span className="font-mono text-muted-foreground">{i + 1}</span>
                    <span className="font-medium">{p.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No method selected yet. Until you choose one, the Design stage lets you build from scratch
            or pick a method for each item.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
