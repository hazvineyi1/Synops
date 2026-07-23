# EU migration tools

Operator tooling for the US -> EU (Frankfurt / eu-central-1) region cutover, in
service of POPIA data residency. Run by a human in a maintenance window - nothing
here runs automatically, and nothing writes to the source (US) database.

Follow the full runbook: [`../../EU-CUTOVER-CHECKLIST.md`](../../EU-CUTOVER-CHECKLIST.md).

## Files

- `dump.sh` - `pg_dump -Fc` the current (US) database to `prod.dump` (read-only).
- `restore.sh` - `pg_restore --no-owner --no-privileges` into the new empty EU database.
- `verify.ts` - compare row counts table-by-table between old and new; non-zero exit on any mismatch.
- `copy-storage.ts` - copy every Supabase Storage bucket old -> new via the Storage REST API (service-role keys).

## Running the TypeScript scripts

These are standalone (not part of the monorepo install). From this folder:

```bash
npm install
OLD_DATABASE_URL=... NEW_EU_DATABASE_URL=... npm run verify
OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... npm run copy-storage
```

Run `verify` once per database being moved (Praxis, then Coach/Paideia) with the
matching OLD/NEW pair. `copy-storage` only matters where Supabase Storage is used
(Praxis); Coach/Paideia stores files as text in Postgres, so it has no buckets.
