import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Saved immigration situations for the Immigration portal. Stores the user's
// described situation and the informational guidance that was generated, so they
// can revisit it. This is NOT legal advice or a case-management record.
export const immigrationCasesTable = pgTable("immigration_cases", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("My case"),
  situation: text("situation").notNull(),
  guidance: text("guidance").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ImmigrationCase = typeof immigrationCasesTable.$inferSelect;
