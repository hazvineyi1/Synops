import { pgTable, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const draftStatusEnum = pgEnum("draft_status", [
  "generating",
  "ready",
  "published",
]);

export const scriptDraftsTable = pgTable("script_drafts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  sourceText: text("source_text").notNull(),
  status: draftStatusEnum("draft_status").notNull().default("generating"),
  beatsData: jsonb("beats_data").notNull().default([]),
  tenantId: text("tenant_id").notNull(),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertScriptDraftSchema = createInsertSchema(scriptDraftsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScriptDraft = z.infer<typeof insertScriptDraftSchema>;
export type ScriptDraft = typeof scriptDraftsTable.$inferSelect;
