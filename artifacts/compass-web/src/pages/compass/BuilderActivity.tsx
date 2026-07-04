import { Link } from "wouter";
import { useGetBuilderActivity } from "@workspace/compass-api-client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Activity } from "lucide-react";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BuilderActivity({ id }: { id: number }) {
  const { data: events, isLoading } = useGetBuilderActivity(id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <Link
          href="/builders"
          className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to builders
        </Link>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Activity className="h-7 w-7" aria-hidden="true" /> Builder activity
        </h1>
        <p className="mt-1 text-muted-foreground">
          A record of what this builder has created or changed across the
          curriculum.
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading activity...</div>
      ) : !events || events.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No recorded activity yet.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Project</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTimestamp(event.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{event.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{event.entityTitle}</div>
                    <div className="text-xs text-muted-foreground">{event.entityType}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{event.projectTitle}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
