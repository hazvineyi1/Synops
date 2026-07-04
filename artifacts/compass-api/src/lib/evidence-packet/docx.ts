import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import type { EvidencePacket } from "@workspace/compass-evidence-packet";
import { clean, formatDate } from "./text";

const INK = "111111";
const MUTED = "555555";
const COVERED = "1a7f37";
const GAP = "b3261e";

function hex(accent: string): string {
  return accent.replace("#", "");
}

function text(value: string, opts: { bold?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: clean(value), bold: opts.bold, color: opts.color, size: opts.size })],
  });
}

function sectionHeading(value: string, accent: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: clean(value), bold: true, color: accent })],
  });
}

function cell(value: string, opts: { bold?: boolean; color?: string } = {}): TableCell {
  return new TableCell({
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: clean(value), bold: opts.bold, color: opts.color, size: 18 })],
      }),
    ],
  });
}

function matrixTable(p: EvidencePacket, accent: string): Table {
  const rows: TableRow[] = [];
  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        cell("Competency", { bold: true, color: accent }),
        cell("Objectives", { bold: true, color: accent }),
        cell("Assessments", { bold: true, color: accent }),
        cell("Status", { bold: true, color: accent }),
      ],
    }),
  );
  for (const domain of p.matrix) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 4,
            shading: { fill: "eef1f5" },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: clean(`${domain.domain}  (${domain.coveredCount}/${domain.totalCount} covered)`),
                    bold: true,
                    color: INK,
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
    for (const row of domain.rows) {
      const objs = row.mappedObjectives.length ? row.mappedObjectives.map((o) => o.ref).join(", ") : "None";
      const assess = row.mappedAssessments.length ? row.mappedAssessments.map(clean).join("; ") : "None";
      rows.push(
        new TableRow({
          children: [
            cell(`${row.competencyCode}  ${row.competencyDescription}`),
            cell(objs),
            cell(assess),
            cell(row.covered ? "Covered" : "GAP", { bold: true, color: row.covered ? COVERED : GAP }),
          ],
        }),
      );
    }
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [3600, 1800, 2400, 1200],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "dddddd" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "dddddd" },
    },
    rows,
  });
}

function objectivesTable(p: EvidencePacket, accent: string): Table {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        cell("Ref", { bold: true, color: accent }),
        cell("Bloom", { bold: true, color: accent }),
        cell("Measurability", { bold: true, color: accent }),
        cell("Objective", { bold: true, color: accent }),
      ],
    }),
  ];
  for (const o of p.objectives) {
    rows.push(
      new TableRow({
        children: [
          cell(o.ref),
          cell(o.bloom ?? "Unclassified"),
          cell(o.measurability ?? "unclassified"),
          cell(o.text),
        ],
      }),
    );
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [900, 1500, 1800, 4800],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "cccccc" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "dddddd" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "dddddd" },
    },
    rows,
  });
}

/** Render an EvidencePacket to a .docx (Office Open XML) Buffer. */
export async function renderEvidencePacketDocx(packet: EvidencePacket): Promise<Buffer> {
  const accent = hex(packet.branding.accentColor);
  const children: (Paragraph | Table)[] = [];

  // Cover
  children.push(
    new Paragraph({
      children: [new TextRun({ text: clean(packet.branding.organizationName), bold: true, color: accent, size: 44 })],
    }),
  );
  if (packet.branding.tagline) {
    children.push(text(packet.branding.tagline, { color: MUTED, size: 22 }));
  }
  children.push(
    new Paragraph({
      spacing: { before: 240, after: 120 },
      children: [new TextRun({ text: clean(packet.meta.title), bold: true, color: INK, size: 36 })],
    }),
  );
  const acronym = packet.meta.accreditorAcronym ? ` (${packet.meta.accreditorAcronym})` : "";
  children.push(text(`Accreditor: ${packet.meta.accreditorName}${acronym}`));
  children.push(text(`Project: ${packet.meta.projectTitle}`));
  const inst = packet.meta.institution ? ` - ${packet.meta.institution}` : "";
  children.push(text(`Client: ${packet.meta.clientName}${inst}`));
  if (packet.meta.courseTitles.length > 0) {
    children.push(text(`Courses: ${packet.meta.courseTitles.join("; ")}`));
  }
  children.push(text(`Generated: ${formatDate(packet.meta.generatedAt)}`));
  if (packet.meta.isDraft) {
    children.push(text(`DRAFT - ${packet.meta.draftReason ?? "QA gate blocked"}`, { bold: true, color: GAP }));
  }

  // Summary
  const s = packet.summary;
  children.push(sectionHeading("Summary", accent));
  children.push(text(`Competency coverage: ${s.coveragePercent}% (${s.mappedCompetencyCount} of ${s.competencyCount} mapped)`));
  children.push(text(`Learning objectives: ${s.objectiveCount}    Assessments: ${s.assessmentCount}`));
  children.push(
    text(
      `Objective measurability: ${s.measurableCount} measurable, ${s.vagueCount} vague, ` +
        `${s.unmeasurableCount} unmeasurable, ${s.unclassifiedCount} unclassified`,
    ),
  );
  if (s.qa) {
    children.push(
      text(
        `QA: score ${s.qa.score}/100, status ${s.qa.status.toUpperCase()} ` +
          `(pass ${s.qa.counts.pass} / warn ${s.qa.counts.warn} / fail ${s.qa.counts.fail})`,
      ),
    );
  } else {
    children.push(text("QA: not yet evaluated"));
  }

  // Matrix
  children.push(sectionHeading("Standards alignment matrix", accent));
  children.push(matrixTable(packet, accent));

  // Objectives
  children.push(sectionHeading("Learning objectives", accent));
  if (packet.objectives.length === 0) {
    children.push(text("No learning objectives have been defined for this project."));
  } else {
    children.push(objectivesTable(packet, accent));
  }

  // QA
  children.push(sectionHeading("Quality assurance", accent));
  if (!packet.qa || !packet.summary.qa) {
    children.push(
      text("QA has not been run for this project. Run a QA evaluation to include scored findings in this packet."),
    );
  } else {
    const q = packet.summary.qa;
    children.push(
      text(
        `Score: ${q.score}/100    Status: ${q.status.toUpperCase()}    ` +
          `Pass ${q.counts.pass} / Warn ${q.counts.warn} / Fail ${q.counts.fail}`,
      ),
    );
    if (q.gateBlock) {
      children.push(text("QA gate is blocked by unresolved failures.", { bold: true, color: GAP }));
    }
    children.push(text("Category scores", { bold: true }));
    for (const cs of packet.qa.categoryScores) {
      children.push(text(`- ${cs.label}: ${cs.score}/100 (${cs.passed}/${cs.total})`));
    }
    if (packet.qa.topFindings.length > 0) {
      children.push(text("Top findings", { bold: true }));
      for (const f of packet.qa.topFindings) {
        children.push(text(`- [${f.severity.toUpperCase()}] ${f.targetLabel}: ${f.message}`));
        if (f.remediation) {
          children.push(text(`    Fix: ${f.remediation}`, { color: MUTED }));
        }
      }
    }
  }

  // Gaps
  children.push(sectionHeading("Coverage gaps", accent));
  if (packet.gaps.length === 0) {
    children.push(text("All competencies are mapped to at least one objective or assessment."));
  } else {
    for (const g of packet.gaps) {
      const dom = g.domain ? ` (${g.domain})` : "";
      children.push(text(`- ${g.competencyCode} ${g.competencyDescription}${dom}`));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
