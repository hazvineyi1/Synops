// EU migration - verification: compare row counts between the old (US) and new
// (EU) databases, table by table, and print a diff. Run AFTER restore.sh, BEFORE
// flipping the apps to EU. A clean run (no MISMATCH lines, exit 0) means every
// table restored with the same number of rows.
//
// Read-only: it only runs COUNT(*) against both databases; it never writes.
//
// Usage:
//   OLD_DATABASE_URL=... NEW_EU_DATABASE_URL=... npx tsx verify.ts
//
// Run once per database being migrated (Praxis, then Coach/Paideia) with the
// matching OLD/NEW pair. See ../../EU-CUTOVER-CHECKLIST.md.
import pg from "pg";

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.NEW_EU_DATABASE_URL;
if (!OLD || !NEW) {
  console.error("Set OLD_DATABASE_URL and NEW_EU_DATABASE_URL");
  process.exit(2);
}

// Tables whose parity matters most for POPIA sign-off; surfaced first if present.
const KEY_TABLES = [
  "users",
  "study_users",
  "enrolments",
  "submissions",
  "assignment_submissions",
  "gradebook_entries",
  "consent_events",
  "study_consents",
  "deletion_requests",
  "study_deletion_requests",
  "study_materials",
  "study_tutor_messages",
  "audit_events",
  "study_admin_audit_log",
];

async function tableNames(client: pg.Client): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  return rows.map((r) => r.table_name);
}

async function count(client: pg.Client, table: string): Promise<number | null> {
  try {
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from "${table.replace(/"/g, '""')}"`,
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null; // table absent on this side
  }
}

async function main() {
  const oldClient = new pg.Client({ connectionString: OLD });
  const newClient = new pg.Client({ connectionString: NEW });
  await oldClient.connect();
  await newClient.connect();
  try {
    const oldTables = await tableNames(oldClient);
    const newTables = new Set(await tableNames(newClient));
    // Order: key tables first (if present in old), then the rest alphabetically.
    const ordered = [
      ...KEY_TABLES.filter((t) => oldTables.includes(t)),
      ...oldTables.filter((t) => !KEY_TABLES.includes(t)),
    ];

    let mismatches = 0;
    let missing = 0;
    console.log(`Comparing ${ordered.length} tables (old -> new)\n`);
    console.log(`${"table".padEnd(40)} ${"old".padStart(10)} ${"new".padStart(10)}  status`);
    for (const t of ordered) {
      const o = await count(oldClient, t);
      const n = newTables.has(t) ? await count(newClient, t) : null;
      let status = "ok";
      if (n === null) {
        status = "MISSING in EU";
        missing++;
      } else if (o !== n) {
        status = `MISMATCH (diff ${((o ?? 0) - (n ?? 0))})`;
        mismatches++;
      }
      console.log(
        `${t.padEnd(40)} ${String(o ?? "-").padStart(10)} ${String(n ?? "-").padStart(10)}  ${status}`,
      );
    }
    // Tables that exist only in EU (unexpected - flag them).
    const extra = [...newTables].filter((t) => !oldTables.includes(t));
    if (extra.length) console.log(`\nTables present only in EU (unexpected): ${extra.join(", ")}`);

    console.log(
      `\n${mismatches} mismatch(es), ${missing} missing table(s).` +
        (mismatches || missing ? " Investigate before cutover." : " Parity verified."),
    );
    process.exit(mismatches || missing ? 1 : 0);
  } finally {
    await oldClient.end();
    await newClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
