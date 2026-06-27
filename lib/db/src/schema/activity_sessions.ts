import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

// A visit/session. The client sends heartbeats while the app is open; a gap longer
// than the session window starts a new row. startedAt is effectively a login time;
// (lastSeenAt - startedAt) is the time spent in that session.
export const activitySessionsTable = pgTable(
  "activity_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    // Where/how the session originated (captured once, when the session starts).
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    device: text("device"), // parsed "Chrome · Windows · Desktop"
    country: text("country"),
    region: text("region"),
    city: text("city"),
  },
  (t) => ({
    byUser: index("activity_sessions_user_idx").on(t.userId),
  }),
);

export type ActivitySession = typeof activitySessionsTable.$inferSelect;
