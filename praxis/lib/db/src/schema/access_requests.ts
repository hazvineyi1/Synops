import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

/**
 * Access requests (super-admin upgrade SA-2; pattern adapted from Sokratify's
 * access_requests). A prospective facilitator / instructional designer submits a request
 * from the public form; a super admin reviews it (approve / deny) from the platform
 * console. Approval records the reviewer; provisioning the actual account is then done
 * through the existing member / funder flows.
 */
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "denied",
]);

export const accessRequestsTable = pgTable("access_requests", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email").notNull(),
  organisationName: text("organisation_name"),
  requestedRole: text("requested_role").notNull().default("org_admin"),
  message: text("message"),
  status: accessRequestStatusEnum("status").notNull().default("pending"),
  reviewedById: text("reviewed_by_id"),
  reviewerNote: text("reviewer_note"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AccessRequest = typeof accessRequestsTable.$inferSelect;
