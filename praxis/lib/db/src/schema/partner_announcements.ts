import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Partner broadcast announcements — the sent history for the Partner Communications page. Records
 * what was sent, to which audience, on which channel, and the recipient count at send time. Actual
 * in-app / email delivery is a separate messaging step; this persists the record + audit trail.
 */
export const partnerAnnouncementsTable = pgTable("partner_announcements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  audienceLabel: text("audience_label").notNull().default("All organisations"),
  channel: text("channel").notNull().default("both"),
  recipients: integer("recipients").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PartnerAnnouncement = typeof partnerAnnouncementsTable.$inferSelect;
