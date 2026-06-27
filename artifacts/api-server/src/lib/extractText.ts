import { Buffer } from "node:buffer";
import zlib from "node:zlib";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

// Hard ceiling for any uploaded file.
export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

// Minimum amount of usable text before we consider a document "text-extractable".
const MIN_USEFUL_TEXT = 200;

// Anthropic input ceilings we are willing to use for the vision/OCR fallbacks.
const MAX_PDF_VISION_BYTES = 25 * 1024 * 1024; // scanned-PDF -> Claude document block
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // image -> Claude image block

// Lightweight error type so the route can map a clean status + message to the client.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// The model can be fed either plain text or a set of Anthropic content blocks
// (used for images and scanned PDFs that Claude reads directly).
export type ExtractionInput =
  | { mode: "text"; text: string }
  | { mode: "blocks"; blocks: any[] };

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "log",
  "rtf",
]);

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function ext(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Readability-lite: pull the main readable text out of an HTML page without a
// DOM library. Drops boilerplate regions (nav, header, footer, aside, scripts),
// prefers the <article>/<main> content when present, and keeps paragraph breaks
// so the concept extractor sees clean prose instead of menu/footer noise.
export function htmlToReadableText(html: string): string {
  let h = html;
  // Remove comments and non-content regions entirely (with their inner text).
  h = h.replace(/<!--[\s\S]*?-->/g, " ");
  h = h.replace(
    /<(script|style|noscript|nav|header|footer|aside|form|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  // Prefer the primary article/main region if the page marks one.
  const main = h.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].length > 200) h = main[2];
  // Turn block-level boundaries into newlines so paragraphs survive.
  h = h.replace(/<br\s*\/?>/gi, "\n");
  h = h.replace(/<\/(p|div|li|h[1-6]|section|tr|blockquote)\s*>/gi, "\n");
  // Strip any remaining tags, then decode common entities.
  h = h
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
  // Collapse whitespace but preserve paragraph breaks.
  return h
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Minimal ZIP reader (stored + deflate) built on node:zlib only.
// .pptx (and other OOXML files) are ZIP archives, so this lets us pull the
// slide XML out without adding a third-party dependency.
function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const EOCD_SIG = 0x06054b50;

  // Find the End Of Central Directory record by scanning backwards.
  let eocd = -1;
  const minPos = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return entries;

  const cdCount = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);

  let p = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    // Use the local header to find the true start of the file data
    // (its name/extra lengths can differ from the central directory).
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);

    let content: Buffer;
    try {
      content = method === 8 ? zlib.inflateRawSync(comp) : Buffer.from(comp);
    } catch {
      continue;
    }
    entries.set(name, content);
  }
  return entries;
}

function pptxToText(buf: Buffer): string {
  const entries = readZipEntries(buf);
  const slideNames = [...entries.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });
  const noteNames = [...entries.keys()]
    .filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/notesSlide(\d+)\.xml/)?.[1] ?? 0);
      const nb = Number(b.match(/notesSlide(\d+)\.xml/)?.[1] ?? 0);
      return na - nb;
    });

  const parts: string[] = [];
  for (const name of [...slideNames, ...noteNames]) {
    const xml = entries.get(name)!.toString("utf8");
    const runs = xml.match(/<a:t>([\s\S]*?)<\/a:t>/g) || [];
    const slideText = runs
      .map((t) => t.replace(/<a:t>/, "").replace(/<\/a:t>/, ""))
      .map(decodeXmlEntities)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (slideText) parts.push(slideText);
  }
  return parts.join("\n\n");
}

// Turn an uploaded file into something the concept extractor can consume:
// either plain text, or Anthropic content blocks for the image / scanned-PDF paths.
export async function extractMaterial(
  buffer: Buffer,
  mimetype: string,
  originalname: string,
): Promise<ExtractionInput> {
  const e = ext(originalname);
  const mt = (mimetype || "").toLowerCase();

  // Plain-text family.
  if (TEXT_EXTENSIONS.has(e) || (mt.startsWith("text/") && !mt.includes("html"))) {
    return { mode: "text", text: buffer.toString("utf8") };
  }

  // HTML.
  if (e === "html" || e === "htm" || mt.includes("html")) {
    return { mode: "text", text: htmlToReadableText(buffer.toString("utf8")) };
  }

  // Word documents.
  if (e === "docx" || mt.includes("officedocument.wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer });
    if (value.trim().length < MIN_USEFUL_TEXT) {
      throw new HttpError(
        400,
        "Could not read enough text from this Word document. Try pasting the content directly.",
      );
    }
    return { mode: "text", text: value };
  }

  // PowerPoint.
  if (e === "pptx" || mt.includes("officedocument.presentationml")) {
    const text = pptxToText(buffer);
    if (text.trim().length < MIN_USEFUL_TEXT) {
      throw new HttpError(
        400,
        "Could not read text from this presentation. If the slides are mostly images, export them as a PDF or paste the text directly.",
      );
    }
    return { mode: "text", text };
  }

  // PDF: try real text first, fall back to Claude reading the PDF (handles scans).
  if (e === "pdf" || mt.includes("pdf")) {
    let text = "";
    try {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text || "";
      await parser.destroy();
    } catch {
      text = "";
    }
    if (text.trim().length >= MIN_USEFUL_TEXT) {
      return { mode: "text", text };
    }
    if (buffer.length <= MAX_PDF_VISION_BYTES) {
      return {
        mode: "blocks",
        blocks: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: "This document was uploaded as study material. Read it carefully, including any scanned or handwritten text, and extract concepts.",
          },
        ],
      };
    }
    throw new HttpError(
      400,
      "This looks like a scanned PDF and is too large to read by image (max 25MB for scanned files). Try a smaller file or paste the text directly.",
    );
  }

  // Images / photographs: let Claude read the text and content directly.
  if (IMAGE_MIME[e] || mt.startsWith("image/")) {
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new HttpError(
        400,
        "That image is too large to process (max 5MB). Please upload a smaller or compressed image.",
      );
    }
    const media = IMAGE_MIME[e] || mt;
    return {
      mode: "blocks",
      blocks: [
        {
          type: "image",
          source: { type: "base64", media_type: media, data: buffer.toString("base64") },
        },
        {
          type: "text",
          text: "This image was uploaded as study material (a photo of notes, slides, a textbook page, or a diagram). Read all visible text and extract concepts.",
        },
      ],
    };
  }

  // Last resort: if the bytes look like text, treat them as text.
  const guess = buffer.toString("utf8");
  const printable = guess.replace(/[^\x20-\x7e]/g, "");
  if (printable.length > MIN_USEFUL_TEXT) {
    return { mode: "text", text: guess };
  }

  throw new HttpError(
    400,
    `Unsupported file type${e ? ` (.${e})` : ""}. Supported formats: PDF, Word (.docx), PowerPoint (.pptx), text files, and images.`,
  );
}
