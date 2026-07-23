import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, contentTranslationsTable } from "@workspace/db";
import { translateTexts } from "./caseEngine";

/**
 * Static translation cache + review-aware read path.
 *
 * A translation is computed by the AI once per (source string, language), stored, and then
 * served from cache forever after - no repeated model calls for the same content, and one
 * place for a native reviewer to correct it. The read path is review-aware:
 *
 *   - "approved" rows are the canonical translation (a native speaker signed off).
 *   - "machine" rows are AI drafts: fine for UI chrome and learning content, but flagged so
 *     the client can badge them "pending review", and NEVER served for legal content.
 *   - "rejected" rows are withheld; the original English is shown until a corrected,
 *     approved translation exists.
 *
 * Everything here fails safe: any DB or model error falls back to the original English text
 * so a translation hiccup can never block a reader.
 */

export type ContentType = "general" | "legal" | "ui" | "course" | "case";

export function sourceHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface TranslatedItem {
  /** The text to display: an approved/machine translation, or the original on any miss. */
  text: string;
  /** True only when a native speaker approved this exact string in this language. */
  reviewed: boolean;
}

/**
 * Translate an ordered list of strings into `lang`, using the cache and filling misses via
 * the AI translator (which itself applies the terminology glossary). Order + length are
 * preserved so callers can zip results back onto their inputs.
 *
 * For `legal` content only approved translations are returned; an un-reviewed legal string
 * falls back to English rather than showing an unverified machine draft.
 */
export async function translateCached(
  texts: string[],
  lang: string,
  contentType: ContentType = "general"
): Promise<TranslatedItem[]> {
  if (!texts.length || lang === "en") return texts.map((t) => ({ text: t, reviewed: true }));

  // Dedupe identical strings so we translate each distinct source once.
  const hashes = texts.map(sourceHash);
  const uniqueHashes = Array.from(new Set(hashes));

  const existing = new Map<string, { text: string; status: string }>();
  try {
    const rows = await db
      .select({
        sourceHash: contentTranslationsTable.sourceHash,
        translatedText: contentTranslationsTable.translatedText,
        status: contentTranslationsTable.status,
      })
      .from(contentTranslationsTable)
      .where(and(eq(contentTranslationsTable.lang, lang), inArray(contentTranslationsTable.sourceHash, uniqueHashes)));
    for (const r of rows) existing.set(r.sourceHash, { text: r.translatedText, status: r.status });
  } catch {
    // Cache unreadable: fall through and translate live (no persistence).
  }

  // Which distinct sources still need a machine draft (never cached, or previously rejected).
  const missIdx: number[] = [];
  const missHashSeen = new Set<string>();
  texts.forEach((t, i) => {
    const h = hashes[i];
    const hit = existing.get(h);
    if ((!hit || hit.status === "rejected") && !missHashSeen.has(h)) {
      missHashSeen.add(h);
      missIdx.push(i);
    }
  });

  if (missIdx.length) {
    const missTexts = missIdx.map((i) => texts[i]);
    const drafts = await translateTexts(missTexts, lang); // glossary-aware; never throws
    const toInsert: (typeof contentTranslationsTable.$inferInsert)[] = [];
    missIdx.forEach((i, k) => {
      const h = hashes[i];
      const draft = drafts[k] ?? texts[i];
      // Record as a machine draft in the read map (status stays "machine" until reviewed).
      if (!existing.has(h) || existing.get(h)!.status === "rejected") {
        existing.set(h, { text: draft, status: "machine" });
      }
      // Only persist genuinely new rows; leave rejected rows for the reviewer to re-translate.
      if (!existing.has(h) || draft !== texts[i]) {
        toInsert.push({ sourceHash: h, lang, sourceText: texts[i], translatedText: draft, status: "machine", contentType });
      }
    });
    if (toInsert.length) {
      try {
        await db.insert(contentTranslationsTable).values(toInsert).onConflictDoNothing();
      } catch {
        // Persistence is best-effort; the live draft is still returned this request.
      }
    }
  }

  return texts.map((t, i) => {
    const hit = existing.get(hashes[i]);
    if (!hit || hit.status === "rejected") return { text: t, reviewed: false };
    // Legal content must be reviewer-approved before it is ever shown.
    if (contentType === "legal" && hit.status !== "approved") return { text: t, reviewed: false };
    return { text: hit.text, reviewed: hit.status === "approved" };
  });
}
