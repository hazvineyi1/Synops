import { type QaReportData } from "@workspace/compass-api-client";
import { RULE_CATEGORY_LABELS, type RuleCategory } from "@workspace/compass-curriculum-engine";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; text: string; bg: string; border: string }> = {
  pass: { label: "Ready for handoff", text: "text-green-800", bg: "bg-green-50", border: "border-green-700/30" },
  warn: { label: "Needs attention", text: "text-amber-900", bg: "bg-amber-50", border: "border-amber-700/30" },
  fail: { label: "Blocking issues", text: "text-red-800", bg: "bg-red-50", border: "border-red-700/30" },
};

function barColor(score: number): string {
  if (score >= 80) return "bg-green-600";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-600";
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "fail") return <AlertCircle className="h-4 w-4 text-red-700" aria-hidden="true" />;
  if (severity === "warn") return <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />;
  return <CheckCircle2 className="h-4 w-4 text-green-700" aria-hidden="true" />;
}

const categoryLabel = (c: string) => RULE_CATEGORY_LABELS[c as RuleCategory] ?? c;

/**
 * Presentational view of a persisted curriculum QA report (the engine output).
 * Renders the overall score, per-category scores, the Bloom (cognitive level)
 * distribution, and findings grouped by severity. Pure: no data fetching.
 */
export function QaReportView({
  report,
  status,
  gateBlock,
}: {
  report: QaReportData;
  status: string;
  gateBlock: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.warn;
  const failWarn = report.findings.filter((f) => f.severity !== "pass");
  const passed = report.findings.filter((f) => f.severity === "pass");
  const maxBloom = report.bloomDistribution.reduce((m, b) => Math.max(m, b.count), 1);

  return (
    <div className="space-y-4">
      {/* Score summary */}
      <Card className={cn("border", meta.border)}>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex flex-col items-center justify-center"
                aria-label={`Overall QA score ${report.score} out of 100`}
              >
                <span className="text-4xl font-bold tabular-nums">{report.score}</span>
                <span className="text-xs text-muted-foreground">of 100</span>
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-0.5 text-sm font-semibold",
                    meta.border,
                    meta.bg,
                    meta.text,
                  )}
                >
                  {meta.label}
                </span>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {report.counts.pass} passed, {report.counts.warn} warnings, {report.counts.fail} failing
                </p>
              </div>
            </div>
          </div>
          {gateBlock && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {report.counts.fail} automated {report.counts.fail === 1 ? "check is" : "checks are"} failing and
                lowering the score. Resolve them to improve quality. Advancing to Handoff is governed by the gate
                requirements on the project overview, not this automated score.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category scores */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category scores</CardTitle>
          <CardDescription>How the course performs across the five quality dimensions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.categoryScores.map((c) => (
            <div key={c.category}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{categoryLabel(c.category)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {c.score} of 100 ({c.passed} of {c.total})
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn("h-full rounded-full", barColor(c.score))} style={{ width: `${c.score}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bloom distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cognitive level distribution</CardTitle>
          <CardDescription>Bloom levels detected across the measurable outcomes.</CardDescription>
        </CardHeader>
        <CardContent>
          {report.bloomDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No measurable outcomes detected yet. Rewrite outcomes with observable verbs to populate this.
            </p>
          ) : (
            <ul className="space-y-2">
              {report.bloomDistribution.map((b) => (
                <li key={b.level} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 font-medium">{b.level}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(b.count / maxBloom) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{b.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Findings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Findings</CardTitle>
          <CardDescription>
            {failWarn.length === 0
              ? "No issues found. Every automated check passed."
              : `${failWarn.length} item${failWarn.length === 1 ? "" : "s"} to review.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {failWarn.length > 0 && (
            <ul className="space-y-2">
              {failWarn.map((f) => (
                <li key={f.id} className="flex gap-2.5 rounded-md border p-3">
                  <span className="mt-0.5">
                    <SeverityIcon severity={f.severity} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{f.targetLabel}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {categoryLabel(f.category)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{f.message}</p>
                    {f.remediation && (
                      <p className="mt-1 text-sm">
                        <span className="font-medium">Fix: </span>
                        {f.remediation}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {passed.length > 0 && (
            <details className={cn("rounded-md border p-3", failWarn.length > 0 && "mt-3")}>
              <summary className="cursor-pointer text-sm font-medium">
                {passed.length} check{passed.length === 1 ? "" : "s"} passed
              </summary>
              <ul className="mt-2 space-y-1.5">
                {passed.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-700" aria-hidden="true" />
                    <span>
                      <span className="font-medium text-foreground">{f.targetLabel}:</span> {f.message}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
