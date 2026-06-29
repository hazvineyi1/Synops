import { pgTable, text, timestamp, boolean, serial } from "drizzle-orm/pg-core";

// Broadcast announcements an admin posts to learners. Audience targets a tier
// ("all", "free", "pro"). Soft-controlled via the `active` flag and optional
// expiry rather than deletion.
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("all"), // all | free | pro
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by"), // admin Clerk user id
  createdByEmail: text("created_by_email"),
  expiresAt: timestamp("expires_at"), // optional auto-expiry
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Announcement = typeof announcementsTable.$inferSelect;
