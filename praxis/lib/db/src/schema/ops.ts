import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Ops-agent anomaly feed. The always-on ops agent scans platform signals (error rate, DB health
 * and latency, login-failure spikes) on an interval and records anomalies here so a super admin
 * sees problems flagged instead of having to watch dashboards. One ACTIVE row per kind (deduped):
 * a recurring problem updates last_seen_at rather than piling up duplicates, and clears to
 * "resolved" automatically once the signal returns to normal.
 *
 * Managed by the boot-time CREATE-IF-NOT-EXISTS heal in lib/dbHardening.ts.
 */
export const opsAnomaliesTable = pgTable(
  "ops_anomalies",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    // Stable identifier for the type of problem, so we can dedupe an active occurrence.
    kind: text("kind").notNull(),
    severity: text("severity").notNull().default("warning"), // warning | critical
    status: text("status").notNull().default("active"), // active | resolved
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    statusIdx: index("ops_anomalies_status_idx").on(t.status, t.lastSeenAt),
  })
);

export type OpsAnomaly = typeof opsAnomaliesTable.$inferSelect;
