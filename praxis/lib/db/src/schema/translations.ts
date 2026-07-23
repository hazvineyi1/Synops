import { pgTable, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Content-translation cache + native-speaker review workflow (localization pipeline).
 *
 * Every distinct source string translated into a South-African language is stored
 * once here, keyed by (source_hash, lang), so a translation is computed by the AI a
 * single time and then served statically from cache on every later read - no repeated
 * model calls, and a stable rendering that a reviewer can correct in one place.
 *
 * status is the review gate:
 *   machine  - AI draft, not yet seen by a human. Safe to show for UI chrome and
 *              learning content, but flagged "pending review" in the response.
 *   approved - a native speaker checked (and possibly edited) the text. This is the
 *              canonical translation and the only status legal/document content will serve.
 *   rejected - a reviewer marked the machine draft wrong; it is withheld and the
 *              original English is shown until a corrected translation is approved.
 *
 * Managed by the boot-time CREATE-IF-NOT-EXISTS heal in lib/dbHardening.ts, like the
 * rest of the schema (no migration runner), so it exists the instant the build deploys.
 */
export const contentTranslationsTable = pgTable(
  "content_translations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // sha-256 of the exact source string; lets us dedupe identical content across surfaces.
    sourceHash: text("source_hash").notNull(),
    lang: text("lang").notNull(), // zu | xh | af (never "en" - English is the source)
    sourceText: text("source_text").notNull(),
    translatedText: text("translated_text").notNull(),
    // machine | approved | rejected
    status: text("status").notNull().default("machine"),
    // Content class, so legal/document strings can be held to approved-only while UI
    // chrome may serve machine drafts. general | legal | ui | course | case
    contentType: text("content_type").notNull().default("general"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    keyUidx: uniqueIndex("content_translations_key_uidx").on(t.sourceHash, t.lang),
    statusIdx: index("content_translations_status_idx").on(t.status, t.lang),
  })
);

export type ContentTranslation = typeof contentTranslationsTable.$inferSelect;
