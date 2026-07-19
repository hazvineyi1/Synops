import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Platform-level contract / MOU filing cabinet (super admin). Distinct from partner_documents:
 * these are the platform provider's own agreements with partners (MSAs, MOUs, DPAs, funder
 * agreements), filed centrally. Metadata + status; file bytes belong to object storage.
 */
export const platformFilingsTable = pgTable("platform_filings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  docType: text("doc_type").notNull().default("MOU"),
  partner: text("partner").default("Platform"),
  counterparty: text("counterparty"),
  status: text("status").notNull().default("active"),
  signed: text("signed"),
  expires: text("expires"),
  size: text("size"),
  fileUrl: text("file_url"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PlatformFiling = typeof platformFilingsTable.$inferSelect;
