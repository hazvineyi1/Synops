/**
 * Renders a course gradebook matrix to a downloadable Excel workbook or CSV.
 * XLSX via ExcelJS (dynamic import, externalised in build.mjs). Replaced SheetJS/xlsx, which is
 * stuck on 0.18.5 on npm and carries unpatched CVEs (prototype pollution, ReDoS).
 */

export interface GbExportCell {
  fraction: number | null;
  earned: number | null;
  note: string | null;
}
export interface GbExportLearner {
  name: string;
  email: string;
  cells: Record<string, GbExportCell>;
  overallPercent: number | null;
  letterGrade: string | null;
}
export interface GbExportColumn {
  key: string;
  title: string;
  category: string;
  itemType: "formative" | "summative";
  pointsPossible: number;
}
export interface GbExportReport {
  courseTitle: string;
  cohortName: string | null;
  generatedAt: string;
  lettersEnabled: boolean;
  columns: GbExportColumn[];
  learners: GbExportLearner[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function matrixRows(report: GbExportReport): { header: (string | number)[]; rows: (string | number)[][] } {
  const header = [
    "Learner",
    "Email",
    ...report.columns.map((c) => `${c.title} (${c.pointsPossible}${c.itemType === "formative" ? ", practice" : ""})`),
    "Overall %",
    ...(report.lettersEnabled ? ["Grade"] : []),
  ];
  const rows = report.learners.map((l) => [
    l.name,
    l.email,
    ...report.columns.map((c) => {
      const cell = l.cells[c.key];
      return cell?.earned == null ? "" : r1(cell.earned);
    }),
    l.overallPercent == null ? "" : r1(l.overallPercent),
    ...(report.lettersEnabled ? [l.letterGrade ?? ""] : []),
  ]);
  return { header, rows };
}

export async function buildGradebookWorkbook(report: GbExportReport): Promise<Buffer> {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();

  const { header, rows } = matrixRows(report);
  const sheet = wb.addWorksheet("Gradebook");
  sheet.addRow([report.courseTitle + (report.cohortName ? ` - ${report.cohortName}` : "")]);
  sheet.addRow(["Generated", new Date(report.generatedAt).toLocaleString()]);
  sheet.addRow([]);
  sheet.addRow(header);
  for (const r of rows) sheet.addRow(r);
  const widths = [24, 28, ...report.columns.map(() => 16), 10, ...(report.lettersEnabled ? [8] : [])];
  widths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  // Notes sheet.
  const noteRows: string[][] = [];
  for (const l of report.learners) {
    for (const c of report.columns) {
      const note = l.cells[c.key]?.note;
      if (note) noteRows.push([l.name, c.title, note]);
    }
  }
  if (noteRows.length) {
    const ns = wb.addWorksheet("Notes");
    ns.addRow(["Learner", "Item", "Feedback note"]);
    for (const nr of noteRows) ns.addRow(nr);
    [24, 30, 60].forEach((w, i) => { ns.getColumn(i + 1).width = w; });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export function buildGradebookCsv(report: GbExportReport): string {
  const { header, rows } = matrixRows(report);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return lines.join("\n");
}
