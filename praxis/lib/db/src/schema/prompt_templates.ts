import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Per-org reusable Socratic prompt templates (super-admin upgrade SA-3; pattern adapted
 * from Sokratify's org_prompt_templates). Facilitators and super admins save reusable
 * system-prompt snippets scoped to an organisation, so an org's tutoring voice/framing
 * can be standardised and reused.
 */
export const promptTemplatesTable = pgTable("org_prompt_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdByName: text("created_by_name"),
  title: text("title").notNull(),
  category: text("category").notNull().default("Our templates"),
  description: text("description").notNull().default(""),
  promptText: text("prompt_text").notNull(),
  // Review gate: a template only shapes live AI tutoring once a super admin approves it.
  // draft -> (approved | retired). An org author's edit sends an approved template back to
  // draft so changed wording can never reach learners un-reviewed.
  status: text("status").notNull().default("draft"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PromptTemplate = typeof promptTemplatesTable.$inferSelect;
