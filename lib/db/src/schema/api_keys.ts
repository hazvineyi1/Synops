import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Developer API keys. Only the SHA-256 hash is stored; the plaintext key is shown
// to the developer exactly once at creation. `prefix` is a short, safe display
// fragment (e.g. "coach_sk_ab12cd").
export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(), // the user the key acts as
  name: text("name").notNull().default("API key"),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
