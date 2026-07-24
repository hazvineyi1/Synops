import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { ensureIntegrityConstraints } from "./dbHardening";

/**
 * Boot-heal regression: the credentials integrity heal must actually create the partial unique index
 * credentials(user_id, module_id) WHERE credential_status = 'valid'. Two bugs previously made the
 * heal throw and silently skip that index on a fresh database - the column was referenced as `status`
 * (it is credential_status) and the dedupe demoted to 'superseded' (not a value of the enum). Missing
 * the index is what made credential issuance's old ON CONFLICT raise 42P10 and roll back the
 * checkpoint. This test drops the index, runs the heal, and asserts it comes back - so the fix can't
 * silently regress. DB-backed; skips with no database.
 */

let dbMod: typeof import("@workspace/db");
let hasDb = false;

beforeAll(async () => {
  try {
    dbMod = await import("@workspace/db");
    await dbMod.db.execute(sql`select 1`);
    hasDb = true;
  } catch {
    hasDb = false;
  }
});

describe("ensureIntegrityConstraints - credentials index", () => {
  it("has a database (else skipped)", () => {
    if (!hasDb) console.warn("dbHardening: no DATABASE_URL, skipping");
    expect(true).toBe(true);
  });

  it("(re)creates the credentials partial unique index without erroring on the credentials heal", async () => {
    if (!hasDb) return;
    const { db } = dbMod;
    await db.execute(sql`DROP INDEX IF EXISTS credentials_user_module_valid_uidx`);
    await ensureIntegrityConstraints(); // must not throw; must heal the index back
    const res = await db.execute(
      sql`SELECT 1 AS ok FROM pg_indexes WHERE indexname = 'credentials_user_module_valid_uidx'`,
    ) as unknown as { rows?: unknown[] };
    const rows = (res.rows ?? (res as unknown as unknown[])) as unknown[];
    expect(rows.length).toBe(1);
  });
});
