import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// An institution is the B2B owner of cohorts (a school, bootcamp, employer, or
// tutoring center). Seat-based Pro is left as a future billing extension.
export const institutionsTable = pgTable("institutions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(), // userId of the admin who created it
  plan: text("plan").notNull().default("free"), // free | pro (seat-based, future)
  seats: integer("seats").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Institution = typeof institutionsTable.$inferSelect;
