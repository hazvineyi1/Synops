import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Outbound webhooks. Payloads are signed with `secret` (HMAC-SHA256) so the
// receiver can verify them. `events` is a comma-separated list, or "*" for all.
export const webhooksTable = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").notNull().default("*"), // csv of event names, or "*"
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Webhook = typeof webhooksTable.$inferSelect;
