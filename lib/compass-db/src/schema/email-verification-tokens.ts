import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Single-use, expiring email-verification tokens for self-serve trial signups.
 *
 * The raw token is emailed to the user; only its sha256 hash is stored here, so a
 * leak of this table cannot be replayed against the verify endpoint. A row is
 * consumed (its `usedAt` set) the first time the matching token is presented; a
 * row with `usedAt` set or `expiresAt` in the past is no longer valid. There is
 * no FK constraint to keep the dev `push` workflow simple; the userId is resolved
 * and validated by the auth route.
 */
export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailVerificationTokenRow = typeof emailVerificationTokensTable.$inferSelect;
