import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Partner filing cabinet — a persistent register of paperwork (invoices, contracts, funder
 * agreements, compliance records) per partner. Stores metadata + status; the actual file bytes are
 * kept in object storage (fileUrl) when configured, otherwise the row is a metadata-only filing
 * entry. Backs the Partner Documents & Filing page.
 */
export const partnerDocumentsTable = pgTable("partner_documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  orgId: text("org_id"),
  orgName: text("org_name"),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  status: text("status").notNull().default("pending"),
  size: text("size"),
  fileUrl: text("file_url"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PartnerDocument = typeof partnerDocumentsTable.$inferSelect;
