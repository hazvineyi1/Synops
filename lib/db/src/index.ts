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
  // keepAlive stops a hosted proxy (Railway/Supabase) from silently dropping an
  // idle TCP socket; without it, a connection that sat unused between requests is
  // dead by the next checkout and the query throws "Connection terminated
  // unexpectedly" — an intermittent 500 that looks random.
  keepAlive: true,
  // Recycle idle clients before the proxy's own idle cutoff.
  idleTimeoutMillis: 30_000,
  // Fail fast on a hung connect instead of hanging the request.
  connectionTimeoutMillis: 10_000,
  // Bound the pool so a burst can't exhaust the database's connection limit.
  max: 10,
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
