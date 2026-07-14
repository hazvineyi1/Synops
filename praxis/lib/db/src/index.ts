import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // keepAlive stops the OS/proxy from silently dropping an idle TCP connection.
  // Railway's public proxy closes idle sockets aggressively; without this, a
  // connection that sat unused between requests is dead by the time the next query
  // checks it out, and that query throws "Connection terminated unexpectedly" -- a
  // 500 that looks random ("worked a minute ago"). This was the intermittent
  // /analytics/overview failure.
  keepAlive: true,
  // Recycle idle clients before the proxy's own idle cutoff rather than after.
  idleTimeoutMillis: 30_000,
  // Fail fast on a hung connect instead of hanging the request thread.
  connectionTimeoutMillis: 10_000,
  max: 10,
});

// A pg Pool emits 'error' on a client that dies WHILE IDLE (i.e. not during a query).
// With no listener, Node treats that as an unhandled error event and can take the
// whole process down. Swallowing it here is correct: the pool discards the bad client
// and hands out a fresh one on the next checkout. We log so it is visible, not silent.
pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[db] idle client error (connection dropped, will reconnect):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
