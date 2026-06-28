import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Session store table for `connect-pg-simple`. The column layout must match
 * what connect-pg-simple expects (sid / sess / expire). Defined here so it is
 * created via `drizzle-kit push` in every environment, instead of relying on
 * connect-pg-simple's `createTableIfMissing` (which reads a SQL file that is
 * not present in the esbuild server bundle).
 */
export const userSessionsTable = pgTable(
  "user_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, withTimezone: false }).notNull(),
  },
  (table) => [index("IDX_user_sessions_expire").on(table.expire)],
);
