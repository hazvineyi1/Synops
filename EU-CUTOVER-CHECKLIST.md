# EU region cutover checklist (POPIA data residency)

Moves Synops production data (Praxis and Coach/Paideia) from the current US
Supabase region to the EU (Frankfurt, eu-central-1). This is the runbook a human
operator follows during a maintenance window. The repo ships the surrounding
tooling (dump/restore/copy-storage/verify scripts and a MAINTENANCE_MODE flag);
a person performs the dashboard actions and runs the scripts.

Plain hyphens only. No destructive or migration operations run automatically -
every step below is deliberate and operator-initiated.

## Ground rules

- A paying partner (Enza) runs on the live Praxis database. Treat the US
  database as read-only during this process (dump only). Nothing here alters or
  drops production data.
- Do a full rehearsal against a throwaway EU project first, with a recent dump,
  before the real window.
- Keep `prod.dump` private - it contains personal information. Delete it from
  any local machine once cutover is verified.

## Prerequisites (before the window)

- [ ] `pg_dump` / `pg_restore` v16+ installed locally, and `node`/`pnpm` for the TS scripts.
- [ ] Access to the Railway project and the Supabase dashboard for both the US (old) and a to-be-created EU (new) project.
- [ ] The current (US) `DATABASE_URL`, `SUPABASE_URL`, anon key, and service-role key.
- [ ] A short customer comms note ready ("scheduled maintenance") for partners.

## Cutover sequence

### 1. Create the EU Supabase project (human, dashboard)

- [ ] In Supabase, create a new project in region **Frankfurt (eu-central-1)**.
- [ ] Record the new project's `DATABASE_URL`, `SUPABASE_URL`, anon key, and service-role key.
- [ ] Recreate the same Storage buckets in the new project (or let `copy-storage.ts` create them - confirm it does before relying on it).

### 2. Freeze writes (operator)

- [ ] Set `MAINTENANCE_MODE=1` on every Railway service (Praxis api, Paideia api, and any web service that mutates). Redeploy or let it hot-reload.
- [ ] Confirm each app now returns 503 on writes and shows the maintenance banner, and that `/readyz` still reports the service is up. Reads may continue; no new writes must land after this point.

### 3. Dump the US database (operator, read-only)

```bash
OLD_DATABASE_URL="<us database url>" ./scripts/eu-migration/dump.sh
# -> prod.dump
```

### 4. Restore into the EU database (operator)

```bash
NEW_EU_DATABASE_URL="<eu database url>" ./scripts/eu-migration/restore.sh prod.dump
```

### 5. Copy Storage buckets US -> EU (operator)

```bash
OLD_SUPABASE_URL="<us supabase url>"      OLD_SUPABASE_SERVICE_ROLE_KEY="<us service role>" \
NEW_SUPABASE_URL="<eu supabase url>"      NEW_SUPABASE_SERVICE_ROLE_KEY="<eu service role>" \
  pnpm tsx scripts/eu-migration/copy-storage.ts
```

### 6. Verify parity (operator)

```bash
OLD_DATABASE_URL="<us database url>" NEW_EU_DATABASE_URL="<eu database url>" \
  pnpm tsx scripts/eu-migration/verify.ts
```

- [ ] Row counts match on every key table (users/learners, enrolments, submissions, grades, consent, and the Coach study tables). Investigate any non-zero diff before continuing.
- [ ] Spot-check a few Storage objects downloaded from the EU bucket.

### 7. Point the apps at EU (human, Railway dashboard)

- [ ] Set each Railway service's **region to EU** (redeploys the service in-region).
- [ ] Swap env vars on every service to the EU project: `DATABASE_URL`, `SUPABASE_URL`, the anon key, the service-role key, and any storage/bucket config.
- [ ] Redeploy.

### 8. Unfreeze and validate

- [ ] Remove `MAINTENANCE_MODE` (or set to 0) on every service; redeploy.
- [ ] Hit `/api/version` on each service and confirm the expected commit is live.
- [ ] Hit `/readyz` on each service and confirm it reports the database is reachable (now the EU one).
- [ ] Log in as a test learner and a test admin; confirm data (enrolments, grades, materials) is present and writes succeed.
- [ ] Confirm a Storage-backed file (e.g. an uploaded document) loads from the EU bucket.

## Rollback

If verification fails at step 6 or 8, cutover has NOT happened yet from users'
point of view (the apps still point at US until step 7). To roll back:

- [ ] Re-point every Railway service's env vars back to the US project and set region back to US; redeploy.
- [ ] Remove `MAINTENANCE_MODE`; confirm `/readyz` and `/api/version`.
- [ ] Discard the partial EU project (or keep it for the next rehearsal). No US data was modified, so nothing needs restoring there.

## After cutover

- [ ] Delete `prod.dump` from all local machines.
- [ ] Update the sub-processor register and privacy policy to state the EU (Frankfurt) region.
- [ ] Note the cutover date and the verified row counts for the compliance file.
