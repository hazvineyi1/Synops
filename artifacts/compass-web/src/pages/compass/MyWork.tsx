import { Link } from "wouter";
import { useGetMyAllocations, type Allocation } from "@workspace/compass-api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Briefcase, ArrowRight } from "lucide-react";

function scopeHref(a: Allocation): string {
  if (a.scopeType === "project") return `/projects/${a.scopeId}`;
  if (a.projectId) return `/projects/${a.projectId}`;
  return "/projects";
}

function scopeBadgeVariant(type: string): "default" | "secondary" | "outline" {
  if (type === "project") return "default";
  if (type === "course") return "secondary";
  return "outline";
}

export default function MyWork() {
  const { data: allocations, isLoading } = useGetMyAllocations();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Briefcase className="h-7 w-7" aria-hidden="true" /> My work
        </h1>
        <p className="mt-1 text-muted-foreground">
          These are the scopes you have been granted. You can read and build
          within each scope and everything beneath it. Parent context is visible
          for alignment but read only.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading your scopes...</div>
      ) : !allocations || allocations.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          You have no active allocations yet. A school administrator needs to
          grant you access before you can build.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {allocations.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2 text-xl">
                  <span>{a.scopeTitle}</span>
                  <Badge variant={scopeBadgeVariant(a.scopeType)}>{a.scopeType}</Badge>
                </CardTitle>
                {a.projectTitle && (
                  <CardDescription>Project: {a.projectTitle}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto flex items-center justify-between">
                {a.notes ? (
                  <span className="text-sm text-muted-foreground">{a.notes}</span>
                ) : (
                  <span />
                )}
                <Link
                  href={scopeHref(a)}
                  className="flex items-center text-sm text-primary hover:underline"
                >
                  Open <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
