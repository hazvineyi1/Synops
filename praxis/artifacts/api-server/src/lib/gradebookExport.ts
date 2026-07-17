/**
 * Renders a course gradebook matrix to a downloadable Excel workbook or CSV.
 * XLSX via SheetJS (dynamic import, already externalised in build.mjs).
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
  const mod: any = await import("xlsx");
  const XLSX = mod.default ?? mod;
  const wb = XLSX.utils.book_new();

  const { header, rows } = matrixRows(report);
  const info: (string | number)[][] = [
    [report.courseTitle + (report.cohortName ? ` - ${report.cohortName}` : "")],
    ["Generated", new Date(report.generatedAt).toLocaleString()],
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet([...info, header, ...rows]);
  sheet["!cols"] = [{ wch: 24 }, { wch: 28 }, ...report.columns.map(() => ({ wch: 16 })), { wch: 10 }, ...(report.lettersEnabled ? [{ wch: 8 }] : [])];
  XLSX.utils.book_append_sheet(wb, sheet, "Gradebook");

  // Notes sheet.
  const noteRows: (string)[][] = [];
  for (const l of report.learners) {
    for (const c of report.columns) {
      const note = l.cells[c.key]?.note;
      if (note) noteRows.push([l.name, c.title, note]);
    }
  }
  if (noteRows.length) {
    const ns = XLSX.utils.aoa_to_sheet([["Learner", "Item", "Feedback note"], ...noteRows]);
    ns["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ns, "Notes");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildGradebookCsv(report: GbExportReport): string {
  const { header, rows } = matrixRows(report);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return lines.join("\n");
}
