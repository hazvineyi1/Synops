import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import {
  useListQAChecks,
  useCreateQACheck,
  useUpdateQACheck,
  getListQAChecksQueryKey,
  useGetLatestQAReport,
  getGetLatestQAReportQueryKey,
  useEvaluateProjectQA,
  getListObjectivesQueryKey,
  type QACheck,
} from "@workspace/compass-api-client";
import { useQueryClient } from "@tanstack/react-query";
import { RULE_CATEGORY_LABELS, type RuleCategory } from "@workspace/compass-curriculum-engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck, AlertTriangle, Clock, Wrench, Download, CircleDashed, Sparkles, Loader2, Gauge,
} from "lucide-react";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { QaReportView } from "@/components/engine/QaReportView";
import { cn } from "@/lib/utils";

type StatusValue = "pending" | "pass" | "fail" | "in_remediation";

// Human-review items the deterministic engine cannot judge. The engine now scores
// measurability, standards alignment, assessment coverage, clarity, and structure;
// these remain a manual reviewer sign-off for the rest.
const CHECK_ITEMS: { value: string; label: string; description: string }[] = [
  {
    value: "oedi_rubric",
    label: "OEDI Rubric",
    description: "Course meets the open educational design integrity rubric.",
  },
  {
    value: "accessibility_auto",
    label: "Accessibility (Automated)",
    description: "Automated WCAG 2.1 AA scan passes with no blocking issues.",
  },
  {
    value: "accessibility_manual",
    label: "Accessibility (Manual)",
    description: "Manual review of keyboard access, screen reader, and contrast.",
  },
  {
    value: "udl",
    label: "Universal Design for Learning",
    description: "Multiple means of engagement, representation, and action.",
  },
  {
    value: "brand",
    label: "Brand Consistency",
    description: "Visuals, tone, and templates match brand guidelines.",
  },
];

const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "in_remediation", label: "In remediation" },
];

const REPORT_STATUS_WORD: Record<string, string> = {
  pass: "Ready for handoff",
  warn: "Needs attention",
  fail: "Blocking issues",
};

const statusLabel = (v: string) => STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v.replace(/_/g, " ");

function StatusIcon({ status }: { status: string }) {
  if (status === "pass") return <ShieldCheck className="h-5 w-5 text-green-700" aria-hidden="true" />;
  if (status === "fail") return <AlertTriangle className="h-5 w-5 text-red-700" aria-hidden="true" />;
  if (status === "in_remediation") return <Wrench className="h-5 w-5 text-amber-700" aria-hidden="true" />;
  return <CircleDashed className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
}

// Active selection colors chosen to meet WCAG 2.1 AA contrast against white text.
function statusButtonClass(option: StatusValue, active: boolean): string {
  if (!active) return "";
  switch (option) {
    case "pass":
      return "border-green-700 bg-green-700 text-white hover:bg-green-700/90 hover:text-white";
    case "fail":
      return "border-red-700 bg-red-700 text-white hover:bg-red-700/90 hover:text-white";
    case "in_remediation":
      return "border-amber-700 bg-amber-700 text-white hover:bg-amber-700/90 hover:text-white";
    default:
      return "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background";
  }
}

export default function ProjectQA() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Computed engine report (authoritative, persisted server-side).
  const { data: reportRecord, isLoading: reportLoading } = useGetLatestQAReport(projectId, {
    query: { enabled: !!projectId, queryKey: getGetLatestQAReportQueryKey(projectId) },
  });
  const evaluate = useEvaluateProjectQA();

  const { data: checks } = useListQAChecks(projectId, {
    query: { enabled: !!projectId, queryKey: getListQAChecksQueryKey(projectId) },
  });

  const createCheck = useCreateQACheck();
  const updateCheck = useUpdateQACheck();

  // Holds locally created/updated checks so the UI reflects them before the list
  // query refetches; pendingCreate guarantees one create per type in flight.
  const [localChecks, setLocalChecks] = useState<Record<string, QACheck>>({});
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, string>>({});
  const [findingsDraft, setFindingsDraft] = useState<Record<string, string>>({});
  const pendingCreate = useRef<Map<string, Promise<QACheck>>>(new Map());

  // wouter reuses this component instance across /projects/:id/qa, so reset all
  // per-type local state when the project changes to avoid leaking rows or
  // PATCHing the previous project's checks.
  useEffect(() => {
    setLocalChecks({});
    setOptimisticStatus({});
    setFindingsDraft({});
    pendingCreate.current.clear();
  }, [projectId]);

  const projectChecks = useMemo(
    () => (checks || []).filter((c) => c.projectId === projectId),
    [checks, projectId],
  );

  // The effective check for each standard checklist item: the server list wins,
  // falling back to a locally created/updated row (list is ordered createdAt asc).
  const byType = useMemo(() => {
    const map: Record<string, QACheck> = { ...localChecks };
    for (const c of projectChecks) {
      if (CHECK_ITEMS.some((i) => i.value === c.checkType)) map[c.checkType] = c;
    }
    return map;
  }, [projectChecks, localChecks]);

  const resolvedStatus = (type: string): string =>
    optimisticStatus[type] ?? byType[type]?.status ?? "pending";

  const counts = useMemo(() => {
    const statuses = CHECK_ITEMS.map((i) => optimisticStatus[i.value] ?? byType[i.value]?.status ?? "pending");
    return {
      pass: statuses.filter((s) => s === "pass").length,
      fail: statuses.filter((s) => s === "fail").length,
      in_remediation: statuses.filter((s) => s === "in_remediation").length,
      pending: statuses.filter((s) => s === "pending").length,
    };
  }, [byType, optimisticStatus]);

  const a11yStatuses = ["accessibility_auto", "accessibility_manual"].map(resolvedStatus);
  const a11yStatus = a11yStatuses.every((s) => s === "pending")
    ? "Not yet assessed"
    : a11yStatuses.some((s) => s === "fail")
      ? "Issues found"
      : a11yStatuses.some((s) => s === "in_remediation")
        ? "In remediation"
        : a11yStatuses.every((s) => s === "pass")
          ? "Meets WCAG 2.1 AA target"
          : "In progress";

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListQAChecksQueryKey(projectId) });
  }

  function runQa() {
    evaluate.mutate(
      { id: projectId },
      {
        onSuccess: (rec) => {
          queryClient.setQueryData(getGetLatestQAReportQueryKey(projectId), rec);
          // The evaluate backfills each objective's Bloom level and measurability,
          // so refresh objective-backed views.
          queryClient.invalidateQueries({ queryKey: getListObjectivesQueryKey(projectId) });
          toast({ title: "QA report generated", description: `Overall score ${rec.score} of 100.` });
        },
        onError: () => toast({ title: "Could not run QA", variant: "destructive" }),
      },
    );
  }

  function clearOptimistic(type: string) {
    setOptimisticStatus((prev) => {
      if (!(type in prev)) return prev;
      const next = { ...prev };
      delete next[type];
      return next;
    });
  }

  function runUpdate(id: number, type: string, patch: { status?: StatusValue; findings?: string }) {
    updateCheck.mutate(
      { id, data: patch },
      {
        onSuccess: (updated) => {
          setLocalChecks((prev) => ({ ...prev, [type]: updated }));
          clearOptimistic(type);
          invalidate();
        },
        onError: () => {
          clearOptimistic(type);
          toast({ title: "Could not save QA result", variant: "destructive" });
        },
      },
    );
  }

  // Single-flight per type: existing row -> PATCH; create in flight -> chain a
  // PATCH onto it; otherwise start exactly one create. This prevents duplicate
  // rows and lost findings when status and findings are saved close together.
  function persist(type: string, patch: { status?: StatusValue; findings?: string }) {
    const existing = byType[type];
    if (existing) {
      runUpdate(existing.id, type, patch);
      return;
    }
    const inFlight = pendingCreate.current.get(type);
    if (inFlight) {
      inFlight.then((created) => runUpdate(created.id, type, patch)).catch(() => clearOptimistic(type));
      return;
    }
    const createData = {
      checkType: type,
      status: (patch.status ?? "pending") as string,
      ...(patch.findings !== undefined ? { findings: patch.findings } : {}),
    };
    const p = createCheck.mutateAsync({ projectId, data: createData });
    pendingCreate.current.set(type, p);
    p.then((created) => {
      setLocalChecks((prev) => ({ ...prev, [type]: created }));
      clearOptimistic(type);
      invalidate();
    })
      .catch(() => {
        clearOptimistic(type);
        toast({ title: "Could not save QA result", variant: "destructive" });
      })
      .finally(() => {
        pendingCreate.current.delete(type);
      });
  }

  function setStatus(type: string, status: StatusValue) {
    setOptimisticStatus((prev) => ({ ...prev, [type]: status }));
    persist(type, { status });
  }

  function saveFindings(type: string, value: string) {
    const stored = byType[type]?.findings ?? "";
    if (value === stored) return;
    persist(type, { findings: value });
  }

  function mdEscape(text: string): string {
    return String(text)
      .replace(/\r?\n|\r/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/!/g, "\\!")
      .replace(/\|/g, "&#124;")
      .replace(/`/g, "\\`")
      .replace(/\*/g, "\\*")
      .replace(/#/g, "\\#");
  }

  function exportReport(projectTitle: string) {
    const lines: string[] = [];
    lines.push("# QA and Accessibility Report");
    lines.push("");
    lines.push(`Project: ${mdEscape(projectTitle)}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push("");

    if (reportRecord) {
      const r = reportRecord.report;
      lines.push("## Automated QA (curriculum engine)");
      lines.push(`Overall score: ${reportRecord.score} of 100`);
      lines.push(`Status: ${REPORT_STATUS_WORD[reportRecord.status] ?? reportRecord.status}`);
      lines.push(`Checks passed: ${r.counts.pass}; warnings: ${r.counts.warn}; failing: ${r.counts.fail}`);
      if (reportRecord.gateBlock) {
        lines.push("Gate: blocking issues must be resolved before handoff.");
      }
      lines.push(`Last run: ${new Date(reportRecord.runAt).toLocaleString()}`);
      lines.push("");
      lines.push("### Category scores");
      r.categoryScores.forEach((c) => {
        lines.push(
          `- ${RULE_CATEGORY_LABELS[c.category as RuleCategory] ?? c.category}: ${c.score} of 100 (${c.passed} of ${c.total} passed)`,
        );
      });
      lines.push("");
      if (r.bloomDistribution.length > 0) {
        lines.push("### Cognitive level distribution");
        r.bloomDistribution.forEach((b) => lines.push(`- ${b.level}: ${b.count}`));
        lines.push("");
      }
      const issues = r.findings.filter((f) => f.severity !== "pass");
      if (issues.length > 0) {
        lines.push("### Issues to resolve");
        issues.forEach((f) => {
          lines.push(`- [${f.severity.toUpperCase()}] ${mdEscape(f.targetLabel)}: ${mdEscape(f.message)}`);
          if (f.remediation) lines.push(`   Remediation: ${mdEscape(f.remediation)}`);
        });
        lines.push("");
      }
    }

    lines.push("## Manual reviewer sign-off");
    lines.push(`Total checks: ${CHECK_ITEMS.length}`);
    lines.push(`Pass: ${counts.pass}`);
    lines.push(`Fail: ${counts.fail}`);
    lines.push(`In remediation: ${counts.in_remediation}`);
    lines.push(`Pending: ${counts.pending}`);
    lines.push(`Accessibility status: ${a11yStatus}`);
    lines.push("");
    lines.push("### Checklist");
    CHECK_ITEMS.forEach((item, i) => {
      const check = byType[item.value];
      lines.push(`${i + 1}. ${item.label} - ${statusLabel(resolvedStatus(item.value))}`);
      if (check?.findings) lines.push(`   Findings: ${mdEscape(check.findings)}`);
      if (check?.remediationNotes) lines.push(`   Remediation: ${mdEscape(check.remediationNotes)}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-report-${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const completed = counts.pass + counts.fail + counts.in_remediation;
  const running = evaluate.isPending;

  return (
    <ProjectWorkspace
      stageId={2}
      actions={({ project }) => (
        <div className="flex flex-wrap gap-2">
          <Button onClick={runQa} disabled={running}>
            {running ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Running</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> Run QA</>
            )}
          </Button>
          <Button variant="outline" onClick={() => exportReport(project.title)}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export report
          </Button>
        </div>
      )}
    >
      {() => (
        <>
          {/* AUTOMATED ENGINE REPORT */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Automated QA report</h2>
              <p className="text-sm text-muted-foreground">
                The curriculum engine scores objectives, standards alignment, assessment coverage, clarity,
                and structure. Run it any time to refresh the score and findings.
              </p>
            </div>

            {reportLoading ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">Loading report...</CardContent>
              </Card>
            ) : reportRecord ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Last run {new Date(reportRecord.runAt).toLocaleString()}.
                </p>
                <QaReportView
                  report={reportRecord.report}
                  status={reportRecord.status}
                  gateBlock={reportRecord.gateBlock}
                />
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Gauge className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-lg font-semibold">No QA report yet</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    Run the curriculum engine to score this course against measurability, standards alignment,
                    assessment coverage, clarity, and structure.
                  </p>
                  <Button className="mt-5" onClick={runQa} disabled={running}>
                    {running ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Running</>
                    ) : (
                      <><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" /> Run QA</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </section>

          {/* MANUAL REVIEWER SIGN-OFF */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Manual reviewer sign-off</h2>
              <p className="text-sm text-muted-foreground">
                Items that need human review and are not scored by the automated engine. Capture your
                assessment and findings here.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-green-700" aria-hidden="true" /> Pass
                  </div>
                  <div className="mt-1 text-2xl font-bold">{counts.pass}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-700" aria-hidden="true" /> Fail
                  </div>
                  <div className="mt-1 text-2xl font-bold">{counts.fail}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" /> Remediation
                  </div>
                  <div className="mt-1 text-2xl font-bold">{counts.in_remediation}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Pending
                  </div>
                  <div className="mt-1 text-2xl font-bold">{counts.pending}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Accessibility</div>
                  <div className="mt-1 text-sm font-semibold">{a11yStatus}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Quality assurance checklist</CardTitle>
                <CardDescription>
                  Work through each manual check. Set a result and capture findings as you go.
                  {" "}
                  {completed} of {CHECK_ITEMS.length} assessed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {CHECK_ITEMS.map((item) => {
                    const status = resolvedStatus(item.value);
                    const check = byType[item.value];
                    const findingsValue = findingsDraft[item.value] ?? check?.findings ?? "";
                    const findingsId = `findings-${item.value}`;
                    return (
                      <li key={item.value} className="rounded-md border p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5">
                              <StatusIcon status={status} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{item.label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                            </div>
                          </div>
                          <div
                            role="group"
                            aria-label={`Result for ${item.label}`}
                            className="flex flex-wrap gap-1.5 sm:justify-end"
                          >
                            {STATUS_OPTIONS.map((opt) => {
                              const active = status === opt.value;
                              return (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  aria-pressed={active}
                                  className={cn(statusButtonClass(opt.value, active))}
                                  onClick={() => setStatus(item.value, opt.value)}
                                >
                                  {opt.label}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="mt-3">
                          <Label htmlFor={findingsId} className="text-xs text-muted-foreground">
                            Findings (optional)
                          </Label>
                          <Textarea
                            id={findingsId}
                            rows={2}
                            className="mt-1"
                            placeholder="Summarize what was checked and any issues found."
                            value={findingsValue}
                            onChange={(e) =>
                              setFindingsDraft((prev) => ({ ...prev, [item.value]: e.target.value }))
                            }
                            onBlur={(e) => saveFindings(item.value, e.target.value)}
                          />
                          {check?.remediationNotes && (
                            <div className="mt-2 rounded border bg-muted/50 p-3 text-sm">
                              <span className="mb-1 block font-semibold">Remediation notes:</span>
                              {check.remediationNotes}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </ProjectWorkspace>
  );
}
