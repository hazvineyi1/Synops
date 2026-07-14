import { pgTable, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Support / helpdesk tickets.
 *
 * A ticket is a thread: an opening request (on the ticket) plus a series of messages.
 * Modelled on discussions + discussion_replies. Staff (coach/org_admin/partner_admin/
 * super_admin) work a queue; a learner sees only their own tickets. Reply notifications
 * reuse the existing notifications table (type "system", link /support/:id).
 */

export const supportTicketStatusEnum = pgEnum("support_ticket_status", [
  "open", // needs a first staff response
  "pending", // staff replied, waiting on the requester
  "resolved", // staff considers it handled
  "closed", // done, archived
]);

export const supportTicketPriorityEnum = pgEnum("support_ticket_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const supportTicketsTable = pgTable("support_tickets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  subject: text("subject").notNull(),
  // The opening message. Subsequent turns live in support_ticket_messages.
  body: text("body").notNull().default(""),
  requesterId: text("requester_id").notNull(),
  assigneeId: text("assignee_id"),
  status: supportTicketStatusEnum("status").notNull().default("open"),
  priority: supportTicketPriorityEnum("priority").notNull().default("normal"),
  // Tenant scoping, stamped from the requester so tenant staff can see their tickets.
  partnerId: text("partner_id"),
  organisationId: text("organisation_id"),
  replyCount: integer("reply_count").notNull().default(0),
  lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTicketsTable).omit({
  id: true,
  status: true,
  replyCount: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;

export const supportTicketMessagesTable = pgTable("support_ticket_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull(),
  body: text("body").notNull(),
  // True when written by staff (as opposed to the requester).
  isStaffReply: boolean("is_staff_reply").notNull().default(false),
  // Internal notes are visible to staff only, never to the requester.
  isInternalNote: boolean("is_internal_note").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSupportTicketMessageSchema = createInsertSchema(supportTicketMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSupportTicketMessage = z.infer<typeof insertSupportTicketMessageSchema>;
export type SupportTicketMessage = typeof supportTicketMessagesTable.$inferSelect;
