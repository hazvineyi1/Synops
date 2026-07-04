import { useState } from "react";
import {
  useGetSchoolReport,
  getGetSchoolReportQueryKey,
  getSchoolReportMarkdown,
  type GetSchoolReportParams,
  type SchoolReport as SchoolReportData,
} from "@workspace/compass-api-client";
import { useToast } from "@/hooks/use-toast";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { isGlobalAdmin } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileBarChart, Printer, Download } from "lucide-react";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SchoolReport() {
  const { user } = useAuth();
  const global = isGlobalAdmin(user?.role);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  // School administrators get their own organization automatically. Global
  // administrators are not bound to one organization, so they pick a tenant by
  // ID (there is no organization directory endpoint to populate a dropdown).
  const [orgInput, setOrgInput] = useState("");
  const [orgId, setOrgId] = useState<number | undefined>(undefined);

  const params: GetSchoolReportParams | undefined =
    global && orgId !== undefined ? { organizationId: orgId } : undefined;
  const enabled = global ? orgId !== undefined : true;

  const {
    data: report,
    isLoading,
    isError,
    error,
  } = useGetSchoolReport(params, {
    query: { enabled, queryKey: getGetSchoolReportQueryKey(params) },
  });

  function applyOrg() {
    const parsed = Number(orgInput);
    if (!orgInput.trim() || Number.isNaN(parsed) || parsed <= 0) {
      toast({ title: "Enter a valid organization ID", variant: "destructive" });
      return;
    }
    setOrgId(parsed);
  }

  async function download() {
    setDownloading(true);
    try {
      const markdown = await getSchoolReportMarkdown(params);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "school-report.md";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Could not download report",
        description: authErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  const orgPicker = global ? (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 print:hidden">
      <div className="space-y-1">
        <Label htmlFor="org-id">Organization ID</Label>
        <Input
          id="org-id"
          inputMode="numeric"
          className="w-48"
          value={orgInput}
          onChange={(e) => setOrgInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyOrg();
          }}
          placeholder="e.g. 2"
        />
      </div>
      <Button variant="outline" onClick={applyOrg}>
        View report
      </Button>
      <p className="text-sm text-muted-foreground">
        Global administrators choose which tenant to view. School administrators
        see their own organization automatically.
      </p>
    </div>
  ) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <FileBarChart className="h-7 w-7" aria-hidden="true" /> School report
          </h1>
          {report ? (
            <p className="mt-1 text-muted-foreground">
              {report.organization.name} (generated {formatTimestamp(report.generatedAt)})
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              Curriculum and builder rollup for an organization.
            </p>
          )}
        </div>
        {report && (
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button onClick={download} disabled={downloading}>
              <Download className="mr-2 h-4 w-4" />
              {downloading ? "Preparing..." : "Download markdown"}
            </Button>
          </div>
        )}
      </div>

      {orgPicker}

      {global && orgId === undefined ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Enter an organization ID above to view its report.
        </div>
      ) : isLoading ? (
        <div className="text-muted-foreground">Loading report...</div>
      ) : isError ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {authErrorMessage(error) || "No report is available for that organization."}
        </div>
      ) : !report ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No report is available for your organization yet.
        </div>
      ) : (
        <ReportBody report={report} />
      )}
    </div>
  );
}

function ReportBody({ report }: { report: SchoolReportData }) {
  const totals = report.totals;
  const totalCards = [
    { label: "Clients", value: totals.clients },
    { label: "Projects", value: totals.projects },
    { label: "Active projects", value: totals.activeProjects },
    { label: "Courses", value: totals.courses },
    { label: "Classes", value: totals.classes },
    { label: "Builders", value: totals.builders },
    { label: "Active allocations", value: totals.activeAllocations },
  ];
  const stageMax = Math.max(...report.projectsByStage.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {totalCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold">{card.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Projects by stage</CardTitle>
        </CardHeader>
        <CardContent>
          {report.projectsByStage.length === 0 ? (
            <div className="text-muted-foreground">No projects yet.</div>
          ) : (
            <div className="space-y-3">
              {report.projectsByStage.map((stage) => {
                const width = Math.round((stage.count / stageMax) * 100);
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 text-sm">
                      <span className="text-muted-foreground">Stage {stage.stage}</span>{" "}
                      {stage.label}
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="w-8 text-right text-sm font-medium">{stage.count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Builders</CardTitle>
        </CardHeader>
        <CardContent>
          {report.builders.length === 0 ? (
            <div className="text-muted-foreground">No builders yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Active scopes</TableHead>
                  <TableHead>Breakdown</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.builders.map((builder) => (
                  <TableRow key={builder.id}>
                    <TableCell className="font-medium">{builder.name}</TableCell>
                    <TableCell className="text-muted-foreground">{builder.email}</TableCell>
                    <TableCell>
                      <Badge variant={builder.status === "active" ? "secondary" : "destructive"}>
                        {builder.status === "active" ? "Active" : "Deactivated"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{builder.activeAllocations}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {builder.allocationsByScope.project > 0 && (
                          <Badge variant="default">
                            {builder.allocationsByScope.project} project
                          </Badge>
                        )}
                        {builder.allocationsByScope.course > 0 && (
                          <Badge variant="secondary">
                            {builder.allocationsByScope.course} course
                          </Badge>
                        )}
                        {builder.allocationsByScope.class > 0 && (
                          <Badge variant="outline">
                            {builder.allocationsByScope.class} class
                          </Badge>
                        )}
                        {builder.activeAllocations === 0 && (
                          <span className="text-sm text-muted-foreground">None</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
