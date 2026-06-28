import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error(
          "DATABASE_URL must be set. Did you forget to provision a database?",
        );
}

// Hosted Postgres (Supabase, Neon, RDS, ...) requires TLS, and node-postgres does
// NOT enable SSL by default, so without this every query fails at runtime against
// a hosted DB. Enable TLS for any non-local host; rejectUnauthorized:false accepts
// the provider certificate chain. Opt out with PGSSL=false for a plain local DB.
const isLocalHost = /@(localhost|127\.0\.0\.1)([:/]|$)/.test(connectionString);
const useSsl =
    process.env.PGSSL === "true" ||
    /sslmode=require/.test(connectionString) ||
    (!isLocalHost && process.env.PGSSL !== "false");

export const pool = new Pool({
    connectionString,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on("error", (err) => {
    console.error("[db] idle client error:", err);
});

// One-shot boot connectivity probe: logs the REAL driver error (code + message)
// so a misconfigured connection is diagnosable instead of only surfacing as
// opaque "Failed query" wrappers at request time.
void pool
  .query("select 1")
  .then(() => console.log("[db] connectivity OK"))
  .catch((err) =>
        console.error("[db] connectivity FAILED:", err?.code, err?.message),
           );

export const db = drizzle(pool, { schema });

export * from "./schema";
