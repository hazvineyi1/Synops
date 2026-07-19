import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Which learners occupy a funding agreement's funded seats. Links a learner to a specific funder
 * agreement so completion/outcome evidence attributes back to the right grant. Capacity is the
 * agreement's seatsFunded; the count of rows here for an agreement is the "used" seats.
 */
export const fundedSeatAssignmentsTable = pgTable("funded_seat_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text("partner_id").notNull(),
  agreementId: text("agreement_id").notNull(),
  learnerId: text("learner_id").notNull(),
  learnerName: text("learner_name"),
  assignedBy: text("assigned_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FundedSeatAssignment = typeof fundedSeatAssignmentsTable.$inferSelect;
