/**
 * Standard Synops Consulting Group letterhead for platform-generated documents.
 *
 * This is the single source of truth for the letterhead so every Word/PDF the platform
 * emits on Synops's own behalf (reports, filings, business documents) carries one
 * consistent, client-safe identity. It uses the registered provider name - never an
 * internal codename ("Praxis"/"Compass") or infrastructure detail.
 *
 * Exception by design: learner CREDENTIALS/certificates carry the issuing partner's
 * brand, not Synops's, so they do not use this letterhead. Everything else the platform
 * generates should.
 */

/** Registered, client-facing provider identity. Keep in sync with the document templates. */
export const LETTERHEAD = {
  providerName: "Synops Consulting Group",
  strapline: "Skills development, training and coaching",
  confidentiality: "Confidential — prepared by Synops Consulting Group.",
};

/** pdfkit doc surface we depend on (kept loose because pdfkit is imported dynamically). */
interface PdfLike {
  page: { width: number; height: number; margins: { left: number; right: number } };
  y: number;
  fillColor(c: string): PdfLike;
  fontSize(n: number): PdfLike;
  font(f: string): PdfLike;
  text(t: string, x?: number | Record<string, unknown>, y?: number, opts?: Record<string, unknown>): PdfLike;
  moveDown(n?: number): PdfLike;
  moveTo(x: number, y: number): PdfLike;
  lineTo(x: number, y: number): PdfLike;
  strokeColor(c: string): PdfLike;
  stroke(): PdfLike;
  bufferedPageRange(): { start: number; count: number };
  switchToPage(n: number): PdfLike;
}

export interface LetterheadColors {
  name?: string; // provider name colour
  sub?: string; // strapline / footer colour
  line?: string; // divider colour
}

/**
 * Draw the standard letterhead band at the top of the current page: provider name,
 * strapline and a divider. Leaves the cursor below the divider ready for the document
 * title. Call this before writing the document's own title.
 */
export function drawLetterheadHeader(doc: PdfLike, colors: LetterheadColors = {}): void {
  const name = colors.name ?? "#0F6E56";
  const sub = colors.sub ?? "#4B5B57";
  const line = colors.line ?? "#DCE4E1";
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  doc.fillColor(name).fontSize(13).font("Helvetica-Bold").text(LETTERHEAD.providerName, { characterSpacing: 0.5 });
  doc.fillColor(sub).fontSize(9).font("Helvetica").text(LETTERHEAD.strapline);
  doc.moveDown(0.6);
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor(line).stroke();
  doc.moveDown(0.8);
}

/**
 * Stamp a consistent footer on every buffered page: a confidentiality line with the
 * document title and page X of Y. Requires the document to have been created with
 * `bufferPages: true`. Call once, immediately before doc.end().
 */
export function drawLetterheadFooters(doc: PdfLike, docTitle: string, colors: LetterheadColors = {}): void {
  const sub = colors.sub ?? "#8a9995";
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fillColor(sub).fontSize(8).font("Helvetica").text(
      `${LETTERHEAD.providerName} — ${docTitle} — page ${i + 1} of ${range.count}`,
      left, doc.page.height - 34, { width, align: "center" },
    );
  }
}
