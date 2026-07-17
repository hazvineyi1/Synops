import type { PublicBrand } from "./brandResolve";

/**
 * Tenant-branded credential certificate (landscape A4 PDF).
 *
 * Uses pdfkit (already an external dep; dynamically imported like accreditationExport). Every
 * colour, the wordmark/logo and the mark title come from the tenant's PublicBrand, so a partner's
 * certificate carries their identity, not Synops'. Best-effort logo embed: a remote PNG/JPEG logo
 * is fetched and drawn; anything else (SVG, fetch failure, timeout) falls back to the name wordmark.
 */

export interface CredentialCertData {
  holderName: string;
  moduleTitle: string;
  issuedAt: Date;
  decayDate: Date | null;
  masteryScore: number | null; // 0..1
  status: string;
  credentialId: string;
  verificationUrl: string;
  brand: PublicBrand;
}

/** Pick black/white text for legibility on a given hex background. */
function contrastInk(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6 || /[^0-9a-f]/i.test(full)) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#14231f" : "#ffffff";
}

/** Fetch a logo as an image buffer pdfkit can embed (PNG/JPEG only). Never throws. */
async function fetchLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!r.ok) return null;
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!/(png|jpe?g)/.test(ct)) return null;
    const ab = await r.arrayBuffer();
    if (ab.byteLength > 2_000_000) return null; // sanity cap
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function buildCredentialPdf(data: CredentialCertData): Promise<Buffer> {
  const mod: any = await import("pdfkit");
  const PDFDocument = mod.default ?? mod;
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; // 842
  const H = doc.page.height; // 595
  const primary = data.brand.primaryColor || "#1a1f36";
  const accent = data.brand.accentColor || "#10b981";
  const ink = "#14231f";
  const soft = "#5b6b66";
  const line = "#d9e0dd";
  const cx = W / 2;
  const textLeft = 90;
  const textWidth = W - 180;
  const centered = { width: textWidth, align: "center" as const };

  const logo = await fetchLogo(data.brand.logoUrl);

  // Background + frames.
  doc.rect(0, 0, W, H).fill("#ffffff");
  doc.rect(0, 0, W, 10).fill(primary);
  doc.lineWidth(2).strokeColor(primary).rect(28, 28, W - 56, H - 56).stroke();
  doc.lineWidth(0.8).strokeColor(accent).rect(38, 38, W - 76, H - 76).stroke();

  // Header: logo or wordmark.
  if (logo) {
    try {
      doc.image(logo, cx - 90, 62, { fit: [180, 44], align: "center", valign: "center" });
    } catch {
      doc.fillColor(primary).font("Helvetica-Bold").fontSize(20).text(data.brand.displayName, textLeft, 70, centered);
    }
  } else {
    doc.fillColor(primary).font("Helvetica-Bold").fontSize(20).text(data.brand.displayName, textLeft, 70, centered);
  }

  // Mark title + preamble.
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(11).text((data.brand.credentialTitle || "PraxisMark").toUpperCase(), textLeft, 128, { ...centered, characterSpacing: 3 });
  doc.fillColor(soft).font("Helvetica").fontSize(12).text("This certifies that", textLeft, 158, centered);

  // Holder.
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(38).text(data.holderName, textLeft, 182, centered);

  // Achievement line.
  doc.fillColor(soft).font("Helvetica").fontSize(12).text("has demonstrated mastery of", textLeft, 244, centered);
  doc.fillColor(primary).font("Helvetica-Bold").fontSize(22).text(data.moduleTitle, textLeft, 266, centered);

  // Mastery pill.
  if (typeof data.masteryScore === "number" && !Number.isNaN(data.masteryScore)) {
    const pct = `Mastery ${Math.round(data.masteryScore * 100)}%`;
    doc.font("Helvetica-Bold").fontSize(12);
    const pw = doc.widthOfString(pct) + 28;
    const px = cx - pw / 2;
    const py = 312;
    doc.roundedRect(px, py, pw, 26, 13).fill(accent);
    doc.fillColor(contrastInk(accent)).text(pct, px, py + 7, { width: pw, align: "center" });
  }

  // Divider.
  doc.moveTo(cx - 150, 366).lineTo(cx + 150, 366).lineWidth(0.8).strokeColor(line).stroke();

  // Dates row.
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—");
  const colW = 220;
  const issuedX = cx - colW - 20;
  const validX = cx + 20;
  const dy = 384;
  doc.fillColor(soft).font("Helvetica-Bold").fontSize(8).text("ISSUED", issuedX, dy, { width: colW, align: "center", characterSpacing: 1 });
  doc.fillColor(ink).font("Helvetica").fontSize(12).text(fmt(data.issuedAt), issuedX, dy + 12, { width: colW, align: "center" });
  const validLabel = data.status === "revoked" ? "REVOKED" : data.status === "expired" ? "EXPIRED" : "VALID THROUGH";
  doc.fillColor(soft).font("Helvetica-Bold").fontSize(8).text(validLabel, validX, dy, { width: colW, align: "center", characterSpacing: 1 });
  doc.fillColor(ink).font("Helvetica").fontSize(12).text(fmt(data.decayDate), validX, dy + 12, { width: colW, align: "center" });

  // Footer: issuer + verification.
  doc.fillColor(soft).font("Helvetica").fontSize(9)
    .text(`Issued by ${data.brand.displayName}`, textLeft, H - 96, centered);
  doc.fillColor(primary).font("Helvetica-Bold").fontSize(9)
    .text(`Verify at ${data.verificationUrl}`, textLeft, H - 82, centered);
  doc.fillColor(soft).font("Helvetica").fontSize(7.5)
    .text(`Credential ID ${data.credentialId}`, textLeft, H - 66, centered);

  doc.end();
  return done;
}
