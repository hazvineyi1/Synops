import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, API } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, FileSpreadsheet, ShieldCheck, AlertTriangle } from "lucide-react";

interface Deliverable { type: string; id: string; name: string; courseTitle?: string | null }
interface StandardRow {
  unitStandardId: string; code: string; title: string; framework: string; nqfLevel: number | null; credits: number | null;
  deliverables: Deliverable[]; coverageLevel: string;
  enrolledLearners: number; learnersCompleted: number; completionPct: number | null;
  learnersAssessed: number; masteryPct: number | null; passRatePct: number | null; evidenceCount: number;
  status: "strong" | "adequate" | "thin" | "gap";
}
interface Report {
  org: { id: string; name: string };
  generatedAt: string;
  frameworks: string[];
  summary: {
    standardsInScope: number; standardsCovered: number; standardsAssessed: number; standardsWithGaps: number;
    coveragePct: number; assessedPct: number; overallMasteryPct: number | null; learnersEvaluated: number;
    coursesInScope: number; coursesUnmapped: number;
  };
  standards: StandardRow[];
  gaps: { noEvidence: { code: string; title: string }[]; unmappedCourses: { id: string; title: string }[] };
}

const statusChip = (s: string) =>
  s === "strong" ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
    : s === "adequate" ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      : s === "thin" ? "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
        : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300";

export function Accreditation() {
  const [orgId, setOrgId] = useState("");

  const orgs = useQuery({ queryKey: ["accred-orgs"], queryFn: () => apiFetch<{ id: string; name: string }[]>("/accreditation/organisations") });
  useEffect(() => { if (!orgId && orgs.data?.length) setOrgId(orgs.data[0].id); }, [orgs.data, orgId]);

  const report = useQuery({
    queryKey: ["accred-report", orgId],
    queryFn: () => apiFetch<Report>(`/organisations/${orgId}/accreditation-report`),
    enabled: !!orgId,
  });

  const dl = (ext: "pdf" | "xlsx") => window.open(`${API}/organisations/${orgId}/accreditation-export.${ext}`, "_blank");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><ShieldCheck className="h-6 w-6 text-primary" /> Accreditation Readiness</h1>
          <p className="text-sm text-muted-foreground">Every unit standard your organisation delivers, with coverage and learner-outcome evidence — one-click self-study export.</p>
        </div>
        <div className="flex items-center gap-2">
          {orgs.data && orgs.data.length > 1 && (
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {orgs.data.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" disabled={!orgId} onClick={() => dl("pdf")}><FileText className="h-4 w-4" /> PDF</Button>
          <Button size="sm" className="gap-1.5" disabled={!orgId} onClick={() => dl("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {report.isLoading && <Skeleton className="h-64" />}
      {report.error && <p className="text-sm text-red-600">Could not load the readiness report.</p>}

      {report.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Standards in scope" value={String(report.data.summary.standardsInScope)} sub={report.data.frameworks.map((f) => f.toUpperCase()).join(" · ") || "—"} />
            <Kpi label="Covered" value={`${report.data.summary.coveragePct}%`} sub={`${report.data.summary.standardsCovered} of ${report.data.summary.standardsInScope}`} tone={report.data.summary.coveragePct >= 80 ? "good" : "warn"} />
            <Kpi label="Assessed with outcomes" value={`${report.data.summary.assessedPct}%`} sub={`${report.data.summary.standardsAssessed} standards`} tone={report.data.summary.assessedPct >= 60 ? "good" : "warn"} />
            <Kpi label="Overall mastery" value={report.data.summary.overallMasteryPct === null ? "—" : `${report.data.summary.overallMasteryPct}%`} sub={`${report.data.summary.learnersEvaluated} learners evaluated`} tone={(report.data.summary.overallMasteryPct ?? 0) >= 70 ? "good" : "warn"} />
          </div>

          {(report.data.gaps.noEvidence.length > 0 || report.data.gaps.unmappedCourses.length > 0) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/20">
              <div className="mb-1 flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-amber-600" /> Gaps to address before a site visit</div>
              {report.data.gaps.noEvidence.length > 0 && (
                <p className="text-sm text-muted-foreground"><b>{report.data.gaps.noEvidence.length}</b> standard(s) mapped but with no learner evidence yet: {report.data.gaps.noEvidence.slice(0, 6).map((g) => g.code).join(", ")}{report.data.gaps.noEvidence.length > 6 ? "…" : ""}</p>
              )}
              {report.data.gaps.unmappedCourses.length > 0 && (
                <p className="text-sm text-muted-foreground"><b>{report.data.gaps.unmappedCourses.length}</b> published course(s) not mapped to any standard: {report.data.gaps.unmappedCourses.slice(0, 5).map((c) => c.title).join(", ")}{report.data.gaps.unmappedCourses.length > 5 ? "…" : ""}</p>
              )}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Standard</th>
                  <th className="px-3 py-2 font-medium">Coverage</th>
                  <th className="px-3 py-2 font-medium text-center">Mastery</th>
                  <th className="px-3 py-2 font-medium text-center">Pass</th>
                  <th className="px-3 py-2 font-medium text-center">Assessed</th>
                  <th className="px-3 py-2 font-medium text-center">Evidence</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.data.standards.map((r) => (
                  <tr key={r.unitStandardId} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{r.code} <span className="font-normal text-muted-foreground">{r.title}</span></div>
                      <div className="text-xs text-muted-foreground">{r.framework.toUpperCase()}{r.nqfLevel !== null ? ` · NQF ${r.nqfLevel}` : ""}{r.credits !== null ? ` · ${r.credits} cr` : ""} · {r.deliverables.length} deliverable{r.deliverables.length === 1 ? "" : "s"}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.coverageLevel}</td>
                    <td className="px-3 py-2 text-center font-mono">{r.masteryPct === null ? "—" : `${r.masteryPct}%`}</td>
                    <td className="px-3 py-2 text-center font-mono">{r.passRatePct === null ? "—" : `${r.passRatePct}%`}</td>
                    <td className="px-3 py-2 text-center">{r.learnersAssessed}</td>
                    <td className="px-3 py-2 text-center">{r.evidenceCount}</td>
                    <td className="px-3 py-2"><span className={cn("rounded px-2 py-0.5 text-xs font-medium uppercase", statusChip(r.status))}>{r.status}</span></td>
                  </tr>
                ))}
                {report.data.standards.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No unit standards are mapped to this organisation's courses yet. Map standards on the Compliance page first.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Generated {new Date(report.data.generatedAt).toLocaleString()}. The PDF and Excel exports contain the full per-standard evidence detail.</p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", tone === "good" ? "text-green-600" : tone === "warn" ? "text-amber-600" : "text-foreground")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
