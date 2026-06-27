import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull().unique(),
  name: text("name"),
  assessmentComplete: boolean("assessment_complete").notNull().default(false),
  // Billing / subscription state (Stripe). Tier drives feature gates and rate caps.
  stripeCustomerId: text("stripe_customer_id"),
  subscriptionStatus: text("subscription_status").notNull().default("none"), // none | trialing | active | past_due | canceled
  subscriptionTier: text("subscription_tier").notNull().default("free"), // free | pro
  trialEndsAt: timestamp("trial_ends_at"), // 7-day free trial of Pro, set on signup
  // Referral / distribution loop.
  referralCode: text("referral_code").unique(), // this user's own invite code
  referredBy: text("referred_by"), // userId of the referrer (set once, on claim)
  referralCount: integer("referral_count").notNull().default(0), // friends who joined via this user
  lastSeenAt: timestamp("last_seen_at"), // updated on heartbeat; powers "active" + last-seen stats
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable);
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
