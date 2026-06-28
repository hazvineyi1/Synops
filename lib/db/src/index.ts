import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Hosted Postgres (Supabase, Railway external, etc.) requires TLS. Enable SSL
// for any non-local host; skip it for localhost so local dev still works.
// rejectUnauthorized:false because managed providers often present a cert chain
// node-postgres won't verify by default.
function sslFor(connectionString: string): false | { rejectUnauthorized: false } {
  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host === "127.0.0.1") return false;
  } catch {
    /* fall through to SSL on */
  }
  return { rejectUnauthorized: false };
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslFor(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
