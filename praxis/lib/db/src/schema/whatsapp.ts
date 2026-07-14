import { pgTable, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Two-way WhatsApp channel (via Twilio).
 * conversation state maps an inbound phone number to a learner + the
 * live Socratic session they are answering through WhatsApp.
 */
export const whatsappModeEnum = pgEnum("whatsapp_mode", [
  "idle",
  "session",
]);

export const whatsappConversationsTable = pgTable("whatsapp_conversations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  phone: text("phone").notNull().unique(),
  mode: whatsappModeEnum("whatsapp_mode").notNull().default("idle"),
  currentSessionId: text("current_session_id"),
  currentModuleId: text("current_module_id"),
  currentBeatId: text("current_beat_id"),
  context: jsonb("context"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;
export type WhatsappConversation = typeof whatsappConversationsTable.$inferSelect;

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id"),
  phone: text("phone").notNull(),
  direction: text("direction", { enum: ["in", "out"] }).notNull(),
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessagesTable.$inferSelect;
