import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// TLS is opt-in so we never change a working connection: enable it only when the
// connection string asks for it (sslmode=require) or PGSSL=true is set. Managed
// providers often present a chain node-postgres won't verify by default, hence
// rejectUnauthorized:false. Railway's internal networking connects without TLS,
// so defaulting off keeps existing deployments working.
function sslFor(connectionString: string): false | { rejectUnauthorized: false } {
  if (process.env.PGSSL === "true" || /sslmode=require/.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return false;
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslFor(process.env.DATABASE_URL),
});

// An idle pooled client can emit 'error' when a hosted provider drops the socket
// (Railway/Supabase close idle connections aggressively). Without a listener,
// node's default handling of an unhandled 'error' event would crash the process.
// Log it and let the pool re-establish connections on demand.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
