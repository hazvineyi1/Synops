import type { AccreditationReport, StandardRow } from "./accreditationEngine";
import { drawLetterheadHeader, drawLetterheadFooters, LETTERHEAD } from "./letterhead";

/**
 * Renders an AccreditationReport to downloadable files.
 *  - Excel via ExcelJS — Summary, Standards coverage matrix, Gaps sheets. (Replaced SheetJS/xlsx,
 *    which is stuck on 0.18.5 on npm with unpatched CVEs.)
 *  - PDF via pdfkit — a formatted self-study document organised by framework + standard.
 * Both libraries are dynamically imported and externalised in build.mjs.
 */

const val = (v: number | null | undefined, suffix = ""): string =>
  v === null || v === undefined ? "-" : `${v}${suffix}`;

// ── Excel ──────────────────────────────────────────────────────────────────────
export async function buildWorkbook(report: AccreditationReport): Promise<Buffer> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();

  const s = report.summary;
  const summaryAoa: (string | number)[][] = [
    [LETTERHEAD.providerName],
    ["Accreditation Readiness Report"],
    ["Organisation", report.org.name],
    ["Generated", new Date(report.generatedAt).toLocaleString()],
    ["Frameworks", report.frameworks.join(", ") || "-"],
    [],
    ["Standards in scope", s.standardsInScope],
    ["Standards covered", `${s.standardsCovered} (${s.coveragePct}%)`],
    ["Standards assessed", `${s.standardsAssessed} (${s.assessedPct}%)`],
    ["Standards with gaps", s.standardsWithGaps],
    ["Overall mastery", s.overallMasteryPct === null ? "-" : `${s.overallMasteryPct}%`],
    ["Learners evaluated", s.learnersEvaluated],
    ["Courses in scope", s.coursesInScope],
    ["Courses unmapped to any standard", s.coursesUnmapped],
  ];
  const summary = wb.addWorksheet("Summary");
  for (const row of summaryAoa) summary.addRow(row);

  const header = [
    "Framework", "Code", "Title", "NQF", "Credits", "Coverage", "Status",
    "Enrolled", "Completed", "Completion %", "Learners assessed", "Mastery %", "Pass %", "Evidence records", "Delivered by",
  ];
  const rows = report.standards.map((r: StandardRow) => [
    r.framework.toUpperCase(), r.code, r.title, r.nqfLevel ?? "", r.credits ?? "",
    r.coverageLevel, r.status,
    r.enrolledLearners, r.learnersCompleted, r.completionPct ?? "",
    r.learnersAssessed, r.masteryPct ?? "", r.passRatePct ?? "", r.evidenceCount,
    r.deliverables.map((d) => d.name).join("; "),
  ]);
  const stdSheet = wb.addWorksheet("Standards coverage");
  stdSheet.addRow(header);
  for (const r of rows) stdSheet.addRow(r);
  [10, 14, 40, 6, 8, 12, 10, 9, 10, 12, 16, 10, 8, 15, 50].forEach((w, i) => { stdSheet.getColumn(i + 1).width = w; });

  const gapsAoa: (string | number)[][] = [
    ["Standards covered on paper but with no learner evidence yet"],
    ["Code", "Title"],
    ...report.gaps.noEvidence.map((g) => [g.code, g.title]),
    [],
    ["Published courses not mapped to any unit standard"],
    ["Course"],
    ...report.gaps.unmappedCourses.map((c) => [c.title]),
  ];
  const gaps = wb.addWorksheet("Gaps");
  for (const row of gapsAoa) gaps.addRow(row);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

// ── PDF ──────────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  strong: "#0F6E56",
  adequate: "#93590B",
  thin: "#C4441F",
  gap: "#B00020",
};

export async function buildPdf(report: AccreditationReport): Promise<Buffer> {
  const mod: any = await import("pdfkit");
  const PDFDocument = mod.default ?? mod;
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ink = "#14231F";
  const soft = "#4B5B57";
  const teal = "#0F6E56";
  const line = "#DCE4E1";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom) doc.addPage();
  };

  // Standard Synops Consulting Group letterhead (single source of truth), then the title.
  drawLetterheadHeader(doc as never, { name: teal, sub: soft, line });
  doc.fillColor(ink).fontSize(24).font("Helvetica-Bold").text("Accreditation Readiness Report");
  doc.moveDown(0.2);
  doc.fillColor(soft).fontSize(12).font("Helvetica").text(report.org.name);
  doc.fontSize(9).text(`Generated ${new Date(report.generatedAt).toLocaleString()}`);
  doc.text(`Frameworks: ${report.frameworks.map((f) => f.toUpperCase()).join(", ") || "-"}`);
  doc.moveDown(0.8);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(line).stroke();
  doc.moveDown(0.8);

  // Summary
  const s = report.summary;
  doc.fillColor(ink).fontSize(14).font("Helvetica-Bold").text("Summary");
  doc.moveDown(0.4);
  const metrics: [string, string][] = [
    ["Standards in scope", String(s.standardsInScope)],
    ["Covered", `${s.standardsCovered} (${s.coveragePct}%)`],
    ["Assessed with learner outcomes", `${s.standardsAssessed} (${s.assessedPct}%)`],
    ["Overall mastery", s.overallMasteryPct === null ? "-" : `${s.overallMasteryPct}%`],
    ["Learners evaluated", String(s.learnersEvaluated)],
    ["Courses in scope", String(s.coursesInScope)],
    ["Courses unmapped to any standard", String(s.coursesUnmapped)],
    ["Standards with gaps", String(s.standardsWithGaps)],
  ];
  const colW = width / 2;
  doc.fontSize(10).font("Helvetica");
  for (let i = 0; i < metrics.length; i += 2) {
    ensure(20);
    const y = doc.y;
    for (let j = 0; j < 2 && i + j < metrics.length; j++) {
      const [k, v] = metrics[i + j];
      const x = left + j * colW;
      doc.fillColor(soft).font("Helvetica").text(`${k}: `, x, y, { continued: true, width: colW - 8 });
      doc.fillColor(ink).font("Helvetica-Bold").text(v);
    }
    doc.moveDown(0.3);
  }
  doc.moveDown(0.6);

  // Standards, grouped by framework
  let lastFramework = "";
  for (const r of report.standards) {
    if (r.framework !== lastFramework) {
      ensure(40);
      doc.moveDown(0.4);
      doc.fillColor(teal).fontSize(13).font("Helvetica-Bold").text(r.framework.toUpperCase());
      doc.moveTo(left, doc.y + 2).lineTo(right, doc.y + 2).strokeColor(line).stroke();
      doc.moveDown(0.5);
      lastFramework = r.framework;
    }
    ensure(74);
    doc.fillColor(ink).fontSize(11).font("Helvetica-Bold").text(`${r.code} — ${r.title}`, { width });
    const meta = [
      r.nqfLevel !== null ? `NQF ${r.nqfLevel}` : null,
      r.credits !== null ? `${r.credits} credits` : null,
      `Coverage: ${r.coverageLevel}`,
    ].filter(Boolean).join("  ·  ");
    doc.fillColor(soft).fontSize(9).font("Helvetica").text(meta, { continued: true });
    doc.fillColor(STATUS_COLOR[r.status] ?? soft).font("Helvetica-Bold").text(`   [${r.status.toUpperCase()}]`);
    doc.fillColor(soft).font("Helvetica").fontSize(9).text(
      `Mastery ${val(r.masteryPct, "%")}  ·  Pass ${val(r.passRatePct, "%")}  ·  Learners assessed ${r.learnersAssessed}  ·  Completion ${val(r.completionPct, "%")}  ·  Evidence records ${r.evidenceCount}`,
    );
    const delivered = r.deliverables.map((d) => `${d.name}${d.type === "case" ? " (case)" : d.type === "module" ? " (module)" : ""}`).join(", ") || "no mapped content";
    doc.fillColor("#6b7a76").fontSize(8.5).text(`Delivered by: ${delivered}`, { width });
    doc.moveDown(0.5);
  }

  // Gaps
  doc.addPage();
  doc.fillColor(ink).fontSize(14).font("Helvetica-Bold").text("Gaps to address");
  doc.moveDown(0.4);
  doc.fillColor(soft).fontSize(11).font("Helvetica-Bold").text("Standards covered but without learner evidence");
  doc.fontSize(9.5).font("Helvetica");
  if (report.gaps.noEvidence.length === 0) doc.fillColor("#6b7a76").text("None — every covered standard has evidence.");
  else report.gaps.noEvidence.forEach((g) => { ensure(16); doc.fillColor(ink).text(`• ${g.code} — ${g.title}`); });
  doc.moveDown(0.6);
  doc.fillColor(soft).fontSize(11).font("Helvetica-Bold").text("Published courses not mapped to any unit standard");
  doc.fontSize(9.5).font("Helvetica");
  if (report.gaps.unmappedCourses.length === 0) doc.fillColor("#6b7a76").text("None — every published course maps to at least one standard.");
  else report.gaps.unmappedCourses.forEach((c) => { ensure(16); doc.fillColor(ink).text(`• ${c.title}`); });

  // Standard letterhead footer on every page (provider name + doc title + page X of Y).
  drawLetterheadFooters(doc as never, `Accreditation Readiness Report — ${report.org.name}`);

  doc.end();
  return done;
}
