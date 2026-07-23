import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStandardsFrameworks,
  useListCompetencies,
  getListCompetenciesQueryKey,
  useListCrosswalkLinks,
  getListCrosswalkLinksQueryKey,
  useCreateCrosswalkLink,
  useDeleteCrosswalkLink,
  type Objective,
} from "@workspace/compass-api-client";
import { GitCompare, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * Objective-to-competency mapping for the Design workspace's Alignment Map.
 *
 * Each objective can be mapped to one or more framework competencies. These rows
 * are what the QA engine reads for the Standards Alignment score (an objective is
 * "aligned" once it has at least one competency link) and what the accreditation
 * crosswalk + evidence packet draw on. Mapping here writes the structured links
 * directly via the existing crosswalk API, so documenting a crosswalk in prose is
 * no longer required to move the score.
 */
export function StandardsAlignmentCard({
  projectId,
  objectives,
}: {
  projectId: number;
  objectives: Objective[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: frameworks } = useListStandardsFrameworks();
  const [frameworkId, setFrameworkId] = useState<number | null>(null);
  const activeFrameworkId = frameworkId ?? frameworks?.[0]?.id ?? null;

  const { data: competencies } = useListCompetencies(activeFrameworkId ?? 0, {
    query: {
      enabled: !!activeFrameworkId,
      queryKey: getListCompetenciesQueryKey(activeFrameworkId ?? 0),
    },
  });
  const { data: links } = useListCrosswalkLinks(projectId, {
    query: {
      enabled: !!projectId,
      queryKey: getListCrosswalkLinksQueryKey(projectId),
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCrosswalkLinksQueryKey(projectId) });

  const createLink = useCreateCrosswalkLink({
    mutation: {
      onSuccess: () => invalidate(),
      onError: () =>
        toast({ title: "Could not map competency", description: "Please try again.", variant: "destructive" }),
    },
  });
  const deleteLink = useDeleteCrosswalkLink({
    mutation: {
      onSuccess: () => invalidate(),
      onError: () =>
        toast({ title: "Could not remove mapping", description: "Please try again.", variant: "destructive" }),
    },
  });

  const linksByObjective = useMemo(() => {
    const m = new Map<number, NonNullable<typeof links>>();
    for (const l of links ?? []) {
      if (l.objectiveId == null) continue;
      const arr = m.get(l.objectiveId) ?? [];
      arr.push(l);
      m.set(l.objectiveId, arr);
    }
    return m;
  }, [links]);

  if (objectives.length === 0) return null;

  const competencyList = competencies ?? [];
  const mappedObjectiveCount = objectives.filter(
    (o) => (linksByObjective.get(o.id) ?? []).length > 0,
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitCompare className="h-5 w-5" aria-hidden="true" /> Standards alignment
        </CardTitle>
        <CardDescription>
          Map each objective to one or more framework competencies. These mappings drive the
          Standards Alignment QA score and the accreditation crosswalk &mdash; {mappedObjectiveCount} of{" "}
          {objectives.length} objectives mapped.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(frameworks?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Framework</span>
            <Select
              value={activeFrameworkId ? String(activeFrameworkId) : undefined}
              onValueChange={(v) => setFrameworkId(Number(v))}
            >
              <SelectTrigger className="w-[340px]">
                <SelectValue placeholder="Select a framework" />
              </SelectTrigger>
              <SelectContent>
                {(frameworks ?? []).map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.acronym ? `${f.acronym} — ${f.name}` : f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Objective</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mapped competencies</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Map a competency</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {objectives.map((obj, i) => {
                const objLinks = linksByObjective.get(obj.id) ?? [];
                const mappedIds = new Set(objLinks.map((l) => l.competencyId));
                const available = competencyList.filter((c) => !mappedIds.has(c.id));
                return (
                  <tr key={obj.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-xs text-muted-foreground">
                        LO{i + 1}
                      </span>
                      <span className="text-sm">{obj.text}</span>
                    </td>
                    <td className="px-4 py-3">
                      {objLinks.length === 0 ? (
                        <span className="text-xs italic text-amber-700">Not mapped to any standard</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {objLinks.map((l) => (
                            <Badge key={l.id} variant="secondary" className="gap-1" title={l.competencyDescription ?? undefined}>
                              {l.competencyCode ?? `#${l.competencyId}`}
                              <button
                                type="button"
                                aria-label={`Remove ${l.competencyCode ?? "competency"} mapping`}
                                className="ml-0.5 inline-flex rounded-full hover:bg-foreground/10"
                                onClick={() => deleteLink.mutate({ id: l.id })}
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value=""
                        disabled={available.length === 0 || createLink.isPending}
                        onValueChange={(v) =>
                          createLink.mutate({
                            projectId,
                            data: { competencyId: Number(v), objectiveId: obj.id },
                          })
                        }
                      >
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder={available.length ? "Add competency…" : "All mapped"} />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {c.code} {c.description ? `— ${c.description.slice(0, 64)}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
