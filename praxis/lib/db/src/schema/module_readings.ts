import { pgTable, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

/**
 * Readings attached to a module.
 *
 * Two kinds:
 *   - "document": a file staff uploaded (PDF/docx/pptx/xlsx/txt/...). We do NOT store the
 *     binary -- there is no object storage in this stack. We run it through extractText and
 *     persist the PARSED TEXT so learners can read it online (and, later, have it read aloud).
 *   - "link": an external URL. We store the URL so it opens in a new window, and best-effort
 *     parse its text too; if parsing fails the link still works.
 *
 * `content` is capped at 200k chars by extractText, so `chars` lets the UI say when a very
 * long document was truncated.
 */
export const moduleReadingsTable = pgTable(
  "module_readings",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    moduleId: text("module_id").notNull(),
    courseId: text("course_id"),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("document"),
    sourceUrl: text("source_url"),
    filename: text("filename"),
    content: text("content"),
    chars: integer("chars").notNull().default(0),
    order: integer("order").notNull().default(0),
    published: boolean("published").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byModule: index("module_readings_module_idx").on(t.moduleId),
  }),
);

export type ModuleReading = typeof moduleReadingsTable.$inferSelect;
