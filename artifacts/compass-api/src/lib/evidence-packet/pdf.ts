import PDFDocument from "pdfkit";
import type { EvidencePacket } from "@workspace/compass-evidence-packet";
import { clean, formatDate } from "./text";

const INK = "#111111";
const MUTED = "#555555";
const SUBTLE = "#333333";
const COVERED = "#1a7f37";
const GAP = "#b3261e";

type Doc = PDFKit.PDFDocument;

function heading(doc: Doc, text: string, accent: string): void {
  if (doc.y > 690) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(13).text(clean(text));
  const y = doc.y + 2;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(1)
    .strokeColor(accent)
    .stroke();
  doc.moveDown(0.5);
  doc.fillColor(INK).font("Helvetica").fontSize(10);
}

function body(doc: Doc): Doc {
  return doc.font("Helvetica").fontSize(10).fillColor(SUBTLE);
}

function buildCover(doc: Doc, p: EvidencePacket): void {
  const accent = p.branding.accentColor;
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(22).text(clean(p.branding.organizationName));
  if (p.branding.tagline) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(clean(p.branding.tagline));
  }
  doc.moveDown(1.2);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(clean(p.meta.title));
  doc.moveDown(0.6);

  body(doc);
  const acronym = p.meta.accreditorAcronym ? ` (${clean(p.meta.accreditorAcronym)})` : "";
  doc.text(`Accreditor: ${clean(p.meta.accreditorName)}${acronym}`);
  doc.text(`Project: ${clean(p.meta.projectTitle)}`);
  const inst = p.meta.institution ? ` - ${clean(p.meta.institution)}` : "";
  doc.text(`Client: ${clean(p.meta.clientName)}${inst}`);
  if (p.meta.courseTitles.length > 0) {
    doc.text(`Courses: ${p.meta.courseTitles.map(clean).join("; ")}`);
  }
  doc.text(`Generated: ${formatDate(p.meta.generatedAt)}`);

  if (p.meta.isDraft) {
    doc.moveDown(0.8);
    doc
      .fillColor(GAP)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`DRAFT - ${clean(p.meta.draftReason ?? "QA gate blocked")}`);
  }
  doc.fillColor(INK);
}

function buildSummary(doc: Doc, p: EvidencePacket, accent: string): void {
  heading(doc, "Summary", accent);
  const s = p.summary;
  doc.text(`Competency coverage: ${s.coveragePercent}% (${s.mappedCompetencyCount} of ${s.competencyCount} mapped)`);
  doc.text(`Learning objectives: ${s.objectiveCount}    Assessments: ${s.assessmentCount}`);
  doc.text(
    `Objective measurability: ${s.measurableCount} measurable, ${s.vagueCount} vague, ` +
      `${s.unmeasurableCount} unmeasurable, ${s.unclassifiedCount} unclassified`,
  );
  if (s.qa) {
    doc.text(
      `QA: score ${s.qa.score}/100, status ${s.qa.status.toUpperCase()} ` +
        `(pass ${s.qa.counts.pass} / warn ${s.qa.counts.warn} / fail ${s.qa.counts.fail})`,
    );
  } else {
    doc.text("QA: not yet evaluated");
  }
}

function buildMatrix(doc: Doc, p: EvidencePacket, accent: string): void {
  heading(doc, "Standards alignment matrix", accent);
  for (const domain of p.matrix) {
    if (doc.y > 680) doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(INK)
      .text(`${clean(domain.domain)}  (${domain.coveredCount}/${domain.totalCount} covered)`);
    doc.moveDown(0.2);
    for (const row of domain.rows) {
      if (doc.y > 700) doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(INK)
        .text(`${clean(row.competencyCode)}  ${clean(row.competencyDescription)}`);
      doc.font("Helvetica").fontSize(9).fillColor(SUBTLE);
      const objs = row.mappedObjectives.length
        ? row.mappedObjectives.map((o) => o.ref).join(", ")
        : "None";
      const assess = row.mappedAssessments.length
        ? row.mappedAssessments.map(clean).join("; ")
        : "None";
      doc.text(`Objectives: ${objs}    Assessments: ${assess}`, { indent: 12 });
      if (row.notes.length > 0) {
        doc.text(`Notes: ${row.notes.map(clean).join("; ")}`, { indent: 12 });
      }
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(row.covered ? COVERED : GAP)
        .text(row.covered ? "Status: Covered" : "Status: GAP - not yet mapped", { indent: 12 });
      doc.moveDown(0.3);
    }
    doc.moveDown(0.2);
  }
}

function buildObjectives(doc: Doc, p: EvidencePacket, accent: string): void {
  heading(doc, "Learning objectives", accent);
  if (p.objectives.length === 0) {
    doc.text("No learning objectives have been defined for this project.");
    return;
  }
  for (const o of p.objectives) {
    if (doc.y > 710) doc.addPage();
    const bloom = o.bloom ?? "Unclassified";
    const meas = o.measurability ?? "unclassified";
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(`${o.ref}  [${clean(bloom)} | ${clean(meas)}]`);
    doc.font("Helvetica").fontSize(9).fillColor(SUBTLE).text(clean(o.text), { indent: 12 });
    doc.moveDown(0.2);
  }
}

function buildQa(doc: Doc, p: EvidencePacket, accent: string): void {
  heading(doc, "Quality assurance", accent);
  if (!p.qa || !p.summary.qa) {
    doc.text(
      "QA has not been run for this project. Run a QA evaluation to include scored findings in this packet.",
    );
    return;
  }
  const q = p.summary.qa;
  doc.text(
    `Score: ${q.score}/100    Status: ${q.status.toUpperCase()}    ` +
      `Pass ${q.counts.pass} / Warn ${q.counts.warn} / Fail ${q.counts.fail}`,
  );
  if (q.gateBlock) {
    doc.fillColor(GAP).font("Helvetica-Bold").text("QA gate is blocked by unresolved failures.");
    body(doc);
  }
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fillColor(INK).text("Category scores");
  body(doc);
  for (const cs of p.qa.categoryScores) {
    doc.text(`- ${clean(cs.label)}: ${cs.score}/100 (${cs.passed}/${cs.total})`, { indent: 12 });
  }
  if (p.qa.topFindings.length > 0) {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fillColor(INK).text("Top findings");
    body(doc);
    for (const f of p.qa.topFindings) {
      if (doc.y > 710) doc.addPage();
      doc.text(`- [${f.severity.toUpperCase()}] ${clean(f.targetLabel)}: ${clean(f.message)}`, { indent: 12 });
      if (f.remediation) {
        doc.fillColor(MUTED).text(`  Fix: ${clean(f.remediation)}`, { indent: 18 });
        doc.fillColor(SUBTLE);
      }
    }
  }
}

function buildGaps(doc: Doc, p: EvidencePacket, accent: string): void {
  heading(doc, "Coverage gaps", accent);
  if (p.gaps.length === 0) {
    doc.text("All competencies are mapped to at least one objective or assessment.");
    return;
  }
  for (const g of p.gaps) {
    if (doc.y > 710) doc.addPage();
    const dom = g.domain ? ` (${clean(g.domain)})` : "";
    doc.text(`- ${clean(g.competencyCode)} ${clean(g.competencyDescription)}${dom}`);
  }
}

/** Render an EvidencePacket to a PDF Buffer. */
export function renderEvidencePacketPdf(packet: EvidencePacket): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      const accent = packet.branding.accentColor;
      buildCover(doc, packet);
      buildSummary(doc, packet, accent);
      buildMatrix(doc, packet, accent);
      buildObjectives(doc, packet, accent);
      buildQa(doc, packet, accent);
      buildGaps(doc, packet, accent);
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}
