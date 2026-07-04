import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Compass runs against its OWN database, separate from the host (paideia) DB it
// is embedded in. 31 of its 35 table names collide with tables owned by other
// apps in the shared Postgres (notably kanon-db, the twin curriculum schema), so
// it must never share that instance's public schema. Prefer COMPASS_DATABASE_URL;
// fall back to DATABASE_URL only for standalone/legacy use.
const connectionString =
  process.env.COMPASS_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "COMPASS_DATABASE_URL (or DATABASE_URL) must be set. Did you forget to provision the Compass database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
