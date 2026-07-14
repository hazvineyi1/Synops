import { pgTable, text, timestamp, pgEnum, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * First-party authentication, replacing Clerk.
 *
 * Why we own identity: the platform console requires impersonating any user, issuing
 * master password resets, forcing sign-out everywhere, and a first-class login-activity
 * trail. With a third-party identity provider every one of those is vendor-mediated
 * (and partly paid) -- you can only ask their API and hope. Owning sessions makes all
 * of it a local database write.
 *
 * NOTE: the table is `auth_sessions`, NOT `sessions`. `sessions` is already taken by
 * LEARNING sessions (the Socratic dialogue). Colliding those two would be a genuinely
 * dangerous mistake -- a bug in one would silently corrupt the other.
 */

/** Opaque session tokens. The cookie holds the token; this row is the source of truth. */
export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    token: text("token").notNull().unique(),
    userId: text("user_id").notNull(),
    /**
     * Set when a super_admin is impersonating this user. Holds the ADMIN's user id.
     *
     * This is what makes impersonation safe and auditable: every request made while
     * impersonating knows who is really behind it, so actions can be attributed to the
     * admin rather than silently blamed on the learner.
     */
    impersonatorId: text("impersonator_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("auth_sessions_user_idx").on(t.userId),
    expiryIdx: index("auth_sessions_expires_idx").on(t.expiresAt),
  }),
);

/**
 * One-time password reset tokens. Only a SHA-256 HASH of the token is stored, never
 * the token itself, so a database leak cannot be turned into an account takeover.
 * `issuedBy` distinguishes a user-requested reset from an admin-issued ("master") one.
 */
export const passwordResetsTable = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    issuedBy: text("issued_by", { enum: ["self_service", "admin"] })
      .notNull()
      .default("self_service"),
    /** The admin who issued it, when issuedBy = 'admin'. */
    issuedByUserId: text("issued_by_user_id"),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("password_resets_user_idx").on(t.userId) }),
);

export const loginOutcomeEnum = pgEnum("login_outcome", [
  "success",
  "bad_password",
  "unknown_email",
  "suspended",
  "impersonated",
]);

/**
 * Login activity. Records FAILURES as well as successes -- a login trail that only
 * shows successes is useless for spotting a credential-stuffing attempt, and useless
 * to a support agent asking "why can't this user get in?".
 */
export const loginEventsTable = pgTable(
  "login_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id"),
    /** Captured even when no user matches, so unknown-email attempts are visible. */
    email: text("email"),
    outcome: loginOutcomeEnum("outcome").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** Set when the "login" was an admin impersonating this user. */
    impersonatorId: text("impersonator_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("login_events_user_idx").on(t.userId),
    createdIdx: index("login_events_created_idx").on(t.createdAt),
  }),
);

/**
 * Platform API keys. Stores only a hash; the plaintext key is shown exactly once at
 * creation. `prefix` is the visible, non-secret first few characters so a key can be
 * identified in a list (and in logs) without ever storing the secret.
 */
export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    /** Scope to a tenant. Null = platform-wide (super_admin only). */
    partnerId: text("partner_id"),
    organisationId: text("organisation_id"),
    createdByUserId: text("created_by_user_id"),
    scopes: text("scopes").array().notNull().default([]),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ partnerIdx: index("api_keys_partner_idx").on(t.partnerId) }),
);

export const insertAuthSessionSchema = createInsertSchema(authSessionsTable).omit({ id: true });
export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({ id: true });

export type AuthSession = typeof authSessionsTable.$inferSelect;
export type PasswordReset = typeof passwordResetsTable.$inferSelect;
export type LoginEvent = typeof loginEventsTable.$inferSelect;
export type ApiKey = typeof apiKeysTable.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
