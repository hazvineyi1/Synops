import { toFile } from "openai";
import { promises as dns } from "node:dns";
import net from "node:net";
import { openai, PRIMARY_MODEL } from "./openai.js";

const URL_FETCH_TIMEOUT_MS = 15_000;
const RESEARCH_TIMEOUT_MS = 60_000;

/**
 * Reject URLs that could be used for SSRF: non-http(s) schemes, embedded
 * credentials, hostnames that resolve to loopback, link-local, private, or
 * other reserved ranges, and bare IP literals in those same ranges.
 */
async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (u.username || u.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  const host = u.hostname;
  if (!host) throw new Error("URL is missing a hostname.");

  const ipsToCheck: string[] = [];
  if (net.isIP(host)) {
    ipsToCheck.push(host);
  } else {
    const lower = host.toLowerCase();
    if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal")) {
      throw new Error("URL hostname is not publicly addressable.");
    }
    try {
      const records = await dns.lookup(host, { all: true });
      for (const r of records) ipsToCheck.push(r.address);
    } catch {
      throw new Error(`Could not resolve hostname: ${host}`);
    }
  }
  for (const ip of ipsToCheck) {
    if (isBlockedAddress(ip)) {
      throw new Error("URL resolves to a non-public address and cannot be fetched.");
    }
  }
  return u;
}

function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map((p) => Number(p));
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("ff")) return true; // multicast
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice(7);
      if (net.isIPv4(mapped)) return isBlockedAddress(mapped);
    }
    return false;
  }
  return true;
}

export interface ExtractedContent {
  text: string;
  kind: "pdf" | "docx" | "txt" | "image" | "audio" | "video" | "url";
  // The page's own title, when we can read one (used to auto-name URL materials).
  title?: string;
}

function extractHtmlTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return undefined;
  const decoded = (m[1] ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return decoded.length > 0 ? decoded.slice(0, 200) : undefined;
}

const MAX_TEXT_CHARS = 50000;

function sanitizeText(text: string): string {
  // Postgres TEXT cannot store NUL (0x00). Also strip other C0 control chars
  // (except tab/LF/CR) that some PDFs embed and which break downstream tools.
  // Normalise line endings to \n.
  return text
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n");
}

function clamp(text: string): string {
  const cleaned = sanitizeText(text);
  return cleaned.length > MAX_TEXT_CHARS ? cleaned.slice(0, MAX_TEXT_CHARS) : cleaned;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // Import the inner implementation directly. The top-level `pdf-parse`
  // entry has a debug block that tries to read a bundled test PDF from
  // the CWD when bundled, which throws ENOENT in production.
  const mod: any = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = mod.default ?? mod;
  const data = await pdfParse(buffer);
  return (data.text ?? "").trim();
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return (result.value ?? "").trim();
}

async function extractImage(buffer: Buffer, mimetype: string): Promise<string> {
  const b64 = buffer.toString("base64");
  const dataUrl = `data:${mimetype};base64,${b64}`;
  const response = await openai.chat.completions.create({
    model: PRIMARY_MODEL,
    max_completion_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "You are a study assistant that extracts the full educational content of an image. Transcribe any text exactly, then describe diagrams, tables, charts, or formulas in clear study-note form. Output plain text only - no preamble.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract all text and explain any diagrams or visuals in this study material." },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as any,
      },
    ],
  });
  return (response.choices[0]?.message?.content ?? "").trim();
}

async function extractAudio(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const file = await toFile(buffer, filename || "audio.bin", {
    type: mimetype || "application/octet-stream",
  });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
    response_format: "json",
  });
  return (result.text ?? "").trim();
}

export async function extractFromFile(args: {
  buffer: Buffer;
  mimetype: string;
  filename: string;
}): Promise<ExtractedContent> {
  const { buffer, mimetype, filename } = args;
  const lowerName = filename.toLowerCase();
  const mt = (mimetype || "").toLowerCase();

  // PDF
  if (mt === "application/pdf" || lowerName.endsWith(".pdf")) {
    return { text: clamp(await extractPdf(buffer)), kind: "pdf" };
  }
  // DOCX / DOC
  if (
    mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mt === "application/msword" ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".doc")
  ) {
    return { text: clamp(await extractDocx(buffer)), kind: "docx" };
  }
  // Plain text
  if (mt.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return { text: clamp(buffer.toString("utf8").trim()), kind: "txt" };
  }
  // Image
  if (mt.startsWith("image/")) {
    return { text: clamp(await extractImage(buffer, mt || "image/png")), kind: "image" };
  }
  // Audio
  if (mt.startsWith("audio/")) {
    return { text: clamp(await extractAudio(buffer, filename, mt)), kind: "audio" };
  }
  // Video - send to Whisper; it accepts mp4/mov/webm and pulls the audio track
  if (mt.startsWith("video/")) {
    return { text: clamp(await extractAudio(buffer, filename, mt)), kind: "video" };
  }
  throw new Error(`Unsupported file type: ${mimetype || filename}`);
}

export async function extractFromUrl(url: string): Promise<ExtractedContent> {
  const safe = await assertSafePublicUrl(url);

  const res = await fetch(safe.toString(), {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SynopsCoach/1.0; +https://synops-consulting.com)",
      Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
  });

  // Auth-required / forbidden pages must NOT be silently replaced with a
  // public-web summary, that would mislead the user.
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `This page requires authentication (HTTP ${res.status}). Paste the content directly, or pick a public URL.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${res.status}).`);
  }

  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  const pageTitle = contentType.includes("html") ? extractHtmlTitle(body) : undefined;
  const directText = contentType.includes("html")
    ? stripHtml(body)
    : body.replace(/\s+/g, " ").trim();

  // The page loaded successfully but had little extractable text (likely a
  // JS-rendered SPA or a thin landing page). Use grounded web research that
  // focuses on this URL so we still produce real, cited study content.
  if (directText.length < 400) {
    const researched = await researchTopic(
      `Summarize the educational content of this page so a learner can study from it: ${safe.toString()}`,
      { preferredUrl: safe.toString() },
    );
    return { ...researched, title: pageTitle ?? researched.title };
  }
  return { text: clamp(directText), kind: "url", title: pageTitle };
}

/**
 * Use the LLM's built-in `web_search` tool to research a topic against the
 * live web and return a study-ready writeup grounded in real sources, with
 * citations appended. Falls back with a clear error if the proxy does not
 * support web search.
 */
export async function researchTopic(
  query: string,
  opts: { preferredUrl?: string } = {},
): Promise<ExtractedContent> {
  const focus = opts.preferredUrl
    ? `Focus on the page ${opts.preferredUrl} and closely related authoritative pages from the same source.`
    : "Prefer authoritative sources (official documentation, peer-reviewed articles, recognised standards bodies, established educational publishers, reputable encyclopedias).";

  const prompt = [
    `You are a careful research assistant building study material for a learner.`,
    ``,
    `Topic / request: ${query}`,
    ``,
    `Use the web_search tool to gather REAL information. Do NOT invent facts,`,
    `examples, dates, names, or citations. If you cannot find evidence for a`,
    `claim, omit it. ${focus}`,
    ``,
    `Produce a study-ready reference in plain prose with this structure:`,
    `1. Overview (2-3 paragraphs of what this topic is and why it matters)`,
    `2. Key concepts (each with a 2-5 sentence explanation grounded in your sources)`,
    `3. Important terminology and definitions`,
    `4. Common misconceptions, exam traps, or pitfalls (if any)`,
    `5. A short "Sources used" list of the most relevant URLs you actually consulted`,
    ``,
    `Cite specific claims inline by including the source URL in parentheses.`,
    `Do not include marketing copy. Do not address the reader. Plain text only.`,
  ].join("\n");

  let response: any;
  try {
    response = await (openai as any).responses.create(
      {
        model: PRIMARY_MODEL,
        input: prompt,
        tools: [{ type: "web_search" }],
        tool_choice: { type: "web_search" },
      },
      { signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS) },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Web research failed (the upstream model could not run a web search): ${msg}`,
    );
  }

  let text: string = typeof response?.output_text === "string" ? response.output_text : "";
  const citationUrls = new Set<string>();
  let webSearchInvoked = false;
  const output: any[] = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    if (item?.type === "web_search_call" || item?.type === "tool_call") {
      webSearchInvoked = true;
    }
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (!text && c?.type === "output_text" && typeof c.text === "string") {
          text = c.text;
        }
        const annotations = Array.isArray(c?.annotations) ? c.annotations : [];
        for (const a of annotations) {
          if (a?.type === "url_citation" && typeof a.url === "string") {
            citationUrls.add(a.url);
          }
        }
      }
    }
  }

  if (!text || text.trim().length < 200) {
    throw new Error(
      "Web research returned no usable content for this topic. Try a more specific query or paste source material directly.",
    );
  }
  // Enforce the grounding contract: we promised real, cited sources. If the
  // model answered from memory without invoking web_search or returning any
  // citation, treat it as a failure rather than silently shipping ungrounded
  // text.
  if (!webSearchInvoked && citationUrls.size === 0) {
    throw new Error(
      "Could not retrieve cited web sources for this topic. Try a more specific query, or paste source material directly.",
    );
  }

  if (citationUrls.size > 0) {
    const block = `\n\n---\nSources consulted:\n${[...citationUrls]
      .map((u) => `- ${u}`)
      .join("\n")}`;
    text = text + block;
  }

  return { text: clamp(text), kind: "url" };
}
