import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// A cohort is a group of learners inside an institution, all preparing for the
// same exam. Learners join with the cohort's join code.
export const cohortsTable = pgTable("cohorts", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id").notNull(),
  name: text("name").notNull(),
  examName: text("exam_name"), // target exam (maps to a domain pack)
  joinCode: text("join_code").notNull().unique(),
  ownerId: text("owner_id").notNull(), // instructor (userId)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Cohort = typeof cohortsTable.$inferSelect;
