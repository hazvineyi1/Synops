/**
 * Extract plain text from an uploaded document (PDF / Word / PowerPoint / Excel / text) or a
 * URL, so the AI activity generator can work from real course material, not just pasted text.
 *
 * Parsers are pure-JS and loaded lazily (dynamic import) so a single missing/broken parser
 * never breaks module load. Everything funnels to a single string the generator consumes.
 */

const MAX_CHARS = 200000; // plenty for the generator; keeps payloads sane

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

const ext = (name: string) => (name.split(".").pop() || "").toLowerCase();
const TEXT_EXTS = ["txt", "md", "markdown", "csv", "tsv", "json", "rtf", "log"];

async function pdfToText(buf: Buffer): Promise<string> {
  // Import the lib file directly to avoid pdf-parse's index.js debug/test harness.
  const mod: any = await import("pdf-parse/lib/pdf-parse.js");
  const pdf = mod.default ?? mod;
  const data = await pdf(buf);
  return String(data?.text ?? "");
}
async function docxToText(buf: Buffer): Promise<string> {
  const mod: any = await import("mammoth");
  const mammoth = mod.default ?? mod;
  const r = await mammoth.extractRawText({ buffer: buf });
  return String(r?.value ?? "");
}
async function xlsxToText(buf: Buffer): Promise<string> {
  const mod: any = await import("xlsx");
  const XLSX = mod.default ?? mod;
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((n: string) => "# " + n + "\n" + XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n\n");
}
async function pptxToText(buf: Buffer): Promise<string> {
  const mod: any = await import("jszip");
  const JSZip = mod.default ?? mod;
  const zip = await JSZip.loadAsync(buf);
  const slideNames = Object.keys(zip.files).filter((f) => /ppt\/slides\/slide\d+\.xml$/.test(f)).sort();
  const parts: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    const runs = xml.match(/<a:t>[\s\S]*?<\/a:t>/g);
    const text = runs ? runs.map((run) => run.replace(/<[^>]+>/g, "")).join(" ") : stripHtml(xml);
    if (text.trim()) parts.push(text.trim());
  }
  return parts.join("\n\n");
}

/** Extract text from a document buffer, dispatched by file extension. */
export async function extractFromBuffer(filename: string, buf: Buffer): Promise<string> {
  const e = ext(filename);
  let text = "";
  if (TEXT_EXTS.includes(e)) text = buf.toString("utf8");
  else if (e === "pdf") text = await pdfToText(buf);
  else if (e === "docx") text = await docxToText(buf);
  else if (e === "xlsx" || e === "xls") text = await xlsxToText(buf);
  else if (e === "pptx") text = await pptxToText(buf);
  else if (e === "html" || e === "htm") text = stripHtml(buf.toString("utf8"));
  else text = buf.toString("utf8"); // best-effort for unknown types
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("No readable text was found in that file.");
  return text.slice(0, MAX_CHARS);
}

/** Turn a Google Docs/Sheets/Slides share URL into a plain-text/csv export URL, else null. */
function googleExport(url: string): string | null {
  const doc = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
  if (doc) return "https://docs.google.com/document/d/" + doc[1] + "/export?format=txt";
  const sheet = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (sheet) return "https://docs.google.com/spreadsheets/d/" + sheet[1] + "/export?format=csv";
  const slide = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/);
  if (slide) return "https://docs.google.com/presentation/d/" + slide[1] + "/export/txt";
  return null;
}

/** Reject obviously-internal hosts (basic SSRF guard). Staff-only endpoint, but still. */
function safeHost(u: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

/** Fetch a URL (or a Google Docs export of it) and extract text. */
export async function extractFromUrl(rawUrl: string): Promise<string> {
  let target = rawUrl.trim();
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  const g = googleExport(target);
  if (g) target = g;
  let u: URL;
  try { u = new URL(target); } catch { throw new Error("That does not look like a valid URL."); }
  if (!safeHost(u)) throw new Error("That URL host is not allowed.");

  const res = await fetch(target, { redirect: "follow", headers: { "user-agent": "SynopsPraxis/1.0 content-import" } });
  if (!res.ok) throw new Error("Could not fetch that URL (" + res.status + ").");
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());

  let text: string;
  if (ct.includes("pdf")) text = await pdfToText(buf);
  else if (ct.includes("wordprocessingml") || ct.includes("msword")) text = await docxToText(buf);
  else if (ct.includes("spreadsheetml") || ct.includes("ms-excel")) text = await xlsxToText(buf);
  else if (ct.includes("presentationml")) text = await pptxToText(buf);
  else if (ct.includes("html")) text = stripHtml(buf.toString("utf8"));
  else text = buf.toString("utf8"); // txt / csv / google export
  text = text.replace(/\r\n/g, "\n").trim();
  if (!text) throw new Error("No readable text was found at that URL.");
  return text.slice(0, MAX_CHARS);
}
