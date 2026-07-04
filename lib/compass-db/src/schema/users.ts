import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  // Legacy free-text affiliation (display only). The tenant boundary is
  // `organizationId` below.
  organization: text("organization"),
  // Tenant binding for curriculum (Compass) actors. Nullable because global
  // actors (admin/super_admin) and the seeded internal client are not bound to
  // an external tenant. school_admin/builder MUST have one; admin/super_admin
  // are global.
  organizationId: integer("organization_id"),
  role: text("role").notNull().default("client"),
  // Account lifecycle. "deactivated" users are provisioned but blocked from
  // authenticating (rejected at login/me and at every product/admin/actor gate).
  // School admins toggle this for the builders they manage.
  status: text("status").notNull().default("active"),
  // When the user's email address was confirmed. NULL means unverified: a
  // self-serve trial registrant cannot sign in or start their trial until they
  // click the verification link. The column DEFAULTs to now() so that every
  // pre-existing, seeded, or admin-provisioned account is treated as already
  // verified (a backfill at migration time); ONLY the /auth/register path writes
  // an explicit NULL to create an unverified user.
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }).default(sql`now()`),
  // Which product this user belongs to. Currently the only product is
  // "compass" (user-facing label "Curriculum Builder"); admins/super_admins can
  // access every product regardless of this value. Keep in sync with
  // PRODUCT_KEYS and the OpenAPI ProductKey enum.
  productKey: text("product_key").notNull().default("compass"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UserRow = typeof usersTable.$inferSelect;
