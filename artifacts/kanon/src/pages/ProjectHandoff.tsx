import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLedgerReport,
  getGetLedgerReportQueryKey,
  useCreateLedgerEntry,
  getListLedgerEntriesQueryKey,
  useGetLatestQAReport,
  getGetLatestQAReportQueryKey,
  type LedgerEntry,
  type LedgerReport,
  type LedgerEntryInput,
  type Project,
} from "@workspace/kanon-api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Download,
  FileText,
  FileType2,
  ShieldCheck,
  Sparkles,
  GitCompare,
  Plus,
  User,
  AlertTriangle,
} from "lucide-react";
import { ProjectWorkspace } from "@/components/engine/ProjectWorkspace";
import { getMethod } from "@/lib/instructional-methods";
import { useToast } from "@/hooks/use-toast";

type SectionKey = "accessibility" | "design" | "ai" | "standards";

interface SectionConfig {
  key: SectionKey;
  reportKey: keyof Pick<
    LedgerReport,
    "accessibilityConformance" | "designRationale" | "aiDisclosure" | "standardsCrosswalk"
  >;
  entryType: string;
  icon: typeof FileText;
  accent: string;
  addLabel: string;
  addTitle: string;
  purpose: string;
  placeholder: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: "accessibility",
    reportKey: "accessibilityConformance",
    entryType: "accessibility_finding",
    icon: ShieldCheck,
    accent: "text-green-600",
    addLabel: "Record finding",
    addTitle: "Record accessibility finding",
    purpose:
      "Log automated (axe) and manual WCAG 2.1 AA audit results, plus the remediation taken for each issue.",
    placeholder:
      "Example: Manual audit found 3 images without alt text on the lecture deck. Alt text added and re-verified.",
  },
  {
    key: "design",
    reportKey: "designRationale",
    entryType: "design_decision",
    icon: FileText,
    accent: "text-blue-600",
    addLabel: "Record decision",
    addTitle: "Record design decision",
    purpose:
      "Capture the decisions and tradeoffs behind this build: the method chosen, sequencing, modality, and why.",
    placeholder:
      "Example: Chose a flipped sequence so live sessions can focus on application rather than lecture.",
  },
  {
    key: "ai",
    reportKey: "aiDisclosure",
    entryType: "ai_disclosure",
    icon: Sparkles,
    accent: "text-purple-600",
    addLabel: "Disclose AI use",
    addTitle: "Disclose AI-assisted content",
    purpose:
      "Document any AI-assisted content and how a qualified human reviewed it before use.",
    placeholder: "Example: Draft quiz items generated with AI, then reviewed and edited by the lead designer.",
  },
  {
    key: "standards",
    reportKey: "standardsCrosswalk",
    entryType: "standards_crosswalk",
    icon: GitCompare,
    accent: "text-amber-600",
    addLabel: "Record alignment",
    addTitle: "Record standards alignment",
    purpose:
      "Record how objectives and assessments map to the target standards or accreditation framework.",
    placeholder:
      "Example: Objective 2 maps to CAEP Standard 1.1; evidenced by the summative project rubric.",
  },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function buildReportMarkdown(report: LedgerReport, project: Project): string {
  const lines: string[] = [];
  lines.push(`# Evidence Ledger: ${mdEscape(project.title)}`);
  lines.push("");
  lines.push(`Generated: ${formatDate(report.generatedAt)}`);
  lines.push("");

  const sectionFor = (cfg: SectionConfig) => report[cfg.reportKey];

  for (const cfg of SECTIONS) {
    const section = sectionFor(cfg);
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(section.summary);
    lines.push("");
    if (section.entries.length === 0) {
      lines.push("No entries recorded.");
    } else {
      for (const entry of section.entries) {
        const author = entry.authorName ? ` (${mdEscape(entry.authorName)})` : "";
        lines.push(`- [${formatDate(entry.createdAt)}]${author} ${mdEscape(entry.content)}`);
        if (entry.aiGenerated && entry.aiDisclosure) {
          lines.push(`  - AI disclosure: ${mdEscape(entry.aiDisclosure)}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  return (
    <li className="rounded-lg border bg-card p-3">
      <p className="text-sm text-foreground">{entry.content}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" aria-hidden="true" />
          {entry.authorName || "Unattributed"}
        </span>
        <span>{formatDate(entry.createdAt)}</span>
        {entry.aiGenerated && (
          <Badge variant="outline" className="gap-1 border-purple-200 bg-purple-50 text-purple-800">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            AI assisted
          </Badge>
        )}
      </div>
      {entry.aiGenerated && entry.aiDisclosure && (
        <p className="mt-2 rounded bg-purple-50 p-2 text-xs text-purple-900">
          AI disclosure: {entry.aiDisclosure}
        </p>
      )}
    </li>
  );
}

/** Pull the server-suggested filename out of a Content-Disposition header. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match ? match[1] : null;
}

export default function ProjectHandoff() {
  const params = useParams();
  const projectId = parseInt(params.id || "0", 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: report, isLoading } = useGetLedgerReport(projectId, {
    query: { enabled: !!projectId, queryKey: getGetLedgerReportQueryKey(projectId) },
  });

  const createEntry = useCreateLedgerEntry();

  // The QA report drives only the packet's contextual note (the export itself is
  // never blocked): no report -> "not yet evaluated" hint; gate-blocked -> draft note.
  const { data: qaReport } = useGetLatestQAReport(projectId, {
    query: { enabled: !!projectId, queryKey: getGetLatestQAReportQueryKey(projectId) },
  });
  const hasQaReport = !!qaReport;
  const qaGateBlocked = qaReport?.gateBlock === true;

  const pdfHref = `/api/compass/projects/${projectId}/evidence-packet.pdf`;
  const docxHref = `/api/compass/projects/${projectId}/evidence-packet.docx`;

  const [, navigate] = useLocation();
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [exportUpgrade, setExportUpgrade] = useState<string | null>(null);

  // The export is a Professional+ feature. Fetch it (rather than a plain link) so
  // a 402 can surface an upgrade prompt instead of navigating the browser to a
  // raw error body; a 200 streams the binary into a client-triggered download.
  async function downloadPacket(format: "pdf" | "docx") {
    const href = format === "pdf" ? pdfHref : docxHref;
    setDownloading(format);
    try {
      const res = await fetch(href, { credentials: "include" });
      if (res.status === 402) {
        let message =
          "Evidence packet export is not included in your current plan. Contact us to unlock it.";
        try {
          const body = (await res.json()) as { message?: unknown };
          if (typeof body.message === "string" && body.message.length > 0) message = body.message;
        } catch {
          // Keep the default upgrade message when the body is not JSON.
        }
        setExportUpgrade(message);
        toast({ title: "Upgrade required", description: message, variant: "destructive" });
        return;
      }
      if (!res.ok) {
        toast({ title: "Could not download the packet", variant: "destructive" });
        return;
      }
      setExportUpgrade(null);
      const blob = await res.blob();
      const filename =
        filenameFromDisposition(res.headers.get("content-disposition")) ?? `evidence-packet.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Could not download the packet", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  const [activeKey, setActiveKey] = useState<SectionKey | null>(null);
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [aiDisclosure, setAiDisclosure] = useState("");

  const activeSection = SECTIONS.find((s) => s.key === activeKey) ?? null;
  const requiresDisclosure = activeSection?.key === "ai" || aiAssisted;

  function openDialog(section: SectionConfig, project: Project) {
    setActiveKey(section.key);
    setAuthorName("");
    setAiAssisted(section.key === "ai");
    setAiDisclosure("");
    if (section.key === "design" && project.designMethod) {
      const method = getMethod(project.designMethod);
      setContent(method ? `Selected design method: ${method.name}. ` : "");
    } else {
      setContent("");
    }
  }

  function closeDialog() {
    setActiveKey(null);
    setContent("");
    setAuthorName("");
    setAiAssisted(false);
    setAiDisclosure("");
  }

  function submitEntry() {
    if (!activeSection) return;
    const trimmed = content.trim();
    if (!trimmed) {
      toast({ title: "Add a description", variant: "destructive" });
      return;
    }
    if (requiresDisclosure && !aiDisclosure.trim()) {
      toast({ title: "Describe how AI was used and reviewed", variant: "destructive" });
      return;
    }

    const data: LedgerEntryInput = {
      entryType: activeSection.entryType,
      content: trimmed,
      aiGenerated: requiresDisclosure,
    };
    if (requiresDisclosure) data.aiDisclosure = aiDisclosure.trim();
    if (authorName.trim()) data.authorName = authorName.trim();

    createEntry.mutate(
      { projectId, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLedgerReportQueryKey(projectId) });
          queryClient.invalidateQueries({ queryKey: getListLedgerEntriesQueryKey(projectId) });
          toast({ title: "Entry recorded" });
          closeDialog();
        },
        onError: () => toast({ title: "Could not record entry", variant: "destructive" }),
      },
    );
  }

  function exportReport(project: Project) {
    if (!report) return;
    const markdown = buildReportMarkdown(report, project);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-ledger-project-${projectId}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <ProjectWorkspace
      stageId={3}
      actions={(ctx) => (
        <Button onClick={() => exportReport(ctx.project)} disabled={isLoading || !report}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export ledger report
        </Button>
      )}
    >
      {(ctx) => (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Accreditation evidence packet</CardTitle>
              <CardDescription>
                A CCNE-aligned, tenant-branded packet that combines the standards alignment matrix,
                the learning objectives table, and the QA summary in one document. Download it to share
                with reviewers or attach to a self-study.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => downloadPacket("pdf")}
                  disabled={downloading !== null}
                  aria-label="Download evidence packet as PDF"
                >
                  <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
                  {downloading === "pdf" ? "Preparing PDF..." : "Download PDF"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => downloadPacket("docx")}
                  disabled={downloading !== null}
                  aria-label="Download evidence packet as DOCX"
                >
                  <FileType2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  {downloading === "docx" ? "Preparing DOCX..." : "Download DOCX"}
                </Button>
              </div>
              {exportUpgrade && (
                <div
                  role="alert"
                  className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <p>{exportUpgrade}</p>
                  <Button
                    variant="link"
                    className="mt-1 h-auto p-0 text-amber-900 underline"
                    onClick={() => navigate("~/contact")}
                  >
                    Contact us
                  </Button>
                </div>
              )}
              {!hasQaReport ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  QA has not been run for this project yet, so the packet's quality section will read
                  "not yet evaluated." The standards alignment matrix is still included. Run QA on the
                  QA stage to add the quality summary.
                </p>
              ) : qaGateBlocked ? (
                <p className="mt-3 flex items-start gap-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    This project has unresolved QA blocking issues, so the packet is labeled DRAFT until
                    they are resolved on the QA stage.
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Evidence ledger</CardTitle>
              <CardDescription>
                The handoff record of how this curriculum was built: accessibility conformance,
                design decisions, AI disclosures, and standards alignment. Record an entry under each
                heading, then export the full report to share with the client.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-32 animate-pulse rounded bg-muted" />
              ) : !report ? (
                <div className="py-8 text-center text-muted-foreground">Report unavailable.</div>
              ) : (
                <div className="space-y-8">
                  {SECTIONS.map((cfg) => {
                    const section = report[cfg.reportKey];
                    const Icon = cfg.icon;
                    return (
                      <section key={cfg.key}>
                        <div className="flex items-start justify-between gap-4 border-b pb-2">
                          <h3 className="flex items-center text-lg font-semibold">
                            <Icon className={`mr-2 h-5 w-5 ${cfg.accent}`} aria-hidden="true" />
                            {section.title}
                            <Badge variant="secondary" className="ml-3">
                              {section.entries.length}
                            </Badge>
                          </h3>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog(cfg, ctx.project)}
                          >
                            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {cfg.addLabel}
                          </Button>
                        </div>
                        <p className="mt-3 text-sm text-muted-foreground">{cfg.purpose}</p>
                        {section.entries.length === 0 ? (
                          <p className="mt-3 text-sm italic text-muted-foreground">
                            No entries recorded yet.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {section.entries.map((entry) => (
                              <EntryRow key={entry.id} entry={entry} />
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={activeKey !== null} onOpenChange={(open) => !open && closeDialog()}>
            <DialogContent>
              {activeSection && (
                <>
                  <DialogHeader>
                    <DialogTitle>{activeSection.addTitle}</DialogTitle>
                    <DialogDescription>{activeSection.purpose}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="entry-content">Description</Label>
                      <Textarea
                        id="entry-content"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder={activeSection.placeholder}
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entry-author">Recorded by (optional)</Label>
                      <Input
                        id="entry-author"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        placeholder="Name or role"
                      />
                    </div>
                    {activeSection.key !== "ai" && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="entry-ai"
                          checked={aiAssisted}
                          onCheckedChange={(v) => setAiAssisted(v === true)}
                        />
                        <Label htmlFor="entry-ai" className="font-normal">
                          AI assisted this work
                        </Label>
                      </div>
                    )}
                    {requiresDisclosure && (
                      <div className="space-y-2">
                        <Label htmlFor="entry-ai-disclosure">AI disclosure</Label>
                        <Textarea
                          id="entry-ai-disclosure"
                          value={aiDisclosure}
                          onChange={(e) => setAiDisclosure(e.target.value)}
                          placeholder="How was AI used, and how did a qualified human review it?"
                          rows={3}
                        />
                      </div>
                    )}
                  </div>
                  <Separator />
                  <DialogFooter>
                    <Button variant="outline" onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button onClick={submitEntry} disabled={createEntry.isPending}>
                      {createEntry.isPending ? "Saving..." : "Record entry"}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </ProjectWorkspace>
  );
}
