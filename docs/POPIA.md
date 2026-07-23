# POPIA compliance

Features and operational tooling that make Synops's platforms trustworthy and
sellable to South African institutions: clear answers to "where does our
learners' data live, and how is it protected?". Covers both products that hold
learner personal information - Praxis (the LMS) and Coach (the Paideia study
app).

## What ships in the code

### Consent capture (both products)

- A single source of truth for the current policy version: `PRIVACY_POLICY_VERSION`
  (server constant, currently `2026-07`) in each API (`praxis .../lib/popia.ts`,
  `paideia-api .../lib/popia.ts`). Bump it after a material policy change and every
  user is re-prompted on their next authenticated load.
- An append-only consent audit: `consent_events` (Praxis) / `study_consents`
  (Coach), each row recording user, app, policy version, timestamp, IP and user
  agent. The user's latest accepted version is denormalised onto the user row
  (`consent_version` / `consented_at`) so the gate is a single-row check.
- `POST /api/consent` records acceptance. The signed-in user's state is exposed
  on their profile response (`consentRequired`, `privacyPolicyVersion`), which
  drives a blocking consent gate in each SPA. The gate re-appears automatically
  whenever the version constant changes.

### Data-subject rights (both products)

- `GET /api/me/data-export` - the signed-in user downloads all of their own
  personal information as JSON (profile, enrolments/materials, submissions/
  practice, grades, coaching interactions, consent history, audit summary).
  Strictly self-scoped.
- `POST /api/me/deletion-request` - records a pending erasure request. Never an
  immediate wipe.
- Admin fulfilment screen (super_admin in Praxis, study admin in Coach): approve
  runs a de-identify routine (anonymise identifying fields, purge sessions,
  retain legally required records) and logs what was kept and why; reject
  declines with a reason. In Praxis, a learner who belongs to a partner
  organisation is routed to the partner (the responsible party) instead of being
  deleted by the platform.
- Every request and decision is written to the existing audit log
  (`audit_events` / `study_admin_audit_log`).
- A "Privacy and my data" page in each app (`/privacy/data`) surfaces export and
  deletion to the user.

### Maintenance / read-only mode (both products)

- `MAINTENANCE_MODE=1` makes each API reject mutating requests (POST/PUT/PATCH/
  DELETE) with `503`, sets an `X-Maintenance-Mode` response header, and reports
  `maintenance: true` on `/api/version`; each SPA shows a banner. Reads and the
  health/version/readyz probes keep working. Used to freeze writes during the EU
  cutover. No-op when unset.

## EU region migration (data residency)

Prepared tooling; a human executes the cutover in a maintenance window (see
[`../EU-CUTOVER-CHECKLIST.md`](../EU-CUTOVER-CHECKLIST.md) and
[`../scripts/eu-migration/`](../scripts/eu-migration/)):

- `dump.sh` / `restore.sh` - `pg_dump -Fc` then `pg_restore --no-owner
  --no-privileges` into a new EU (Frankfurt) database.
- `copy-storage.ts` - copy Supabase Storage buckets old -> new.
- `verify.ts` - row-count parity check, table by table.

Nothing runs against production automatically. All Supabase config is env-driven
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`) - there are no
hard-coded region strings or endpoints to change, only env values.

## New environment variables

| Variable | Where | Purpose |
|---|---|---|
| `MAINTENANCE_MODE` | Praxis api, Coach api | `1`/`true` freezes writes (503) during a cutover window. Unset = normal. |

The EU-migration scripts read their own env at run time (`OLD_DATABASE_URL`,
`NEW_EU_DATABASE_URL`, `OLD_SUPABASE_URL`/`_SERVICE_ROLE_KEY`, `NEW_SUPABASE_URL`/
`_SERVICE_ROLE_KEY`) - see the checklist.

## Schema management

- Praxis: new tables/columns are added to the Drizzle schema AND healed at boot
  via `ensureIntegrityConstraints()` (CREATE/ALTER IF NOT EXISTS), matching the
  existing no-migration-runner pattern, so they exist the instant a build
  deploys.
- Coach: schema is reconciled with `drizzle-kit push`; a small boot heal
  (`ensurePopiaSchema()`) creates the POPIA tables/columns if a push has not run
  yet, so a deploy is never left querying a missing table.

Both are additive and non-destructive - safe to deploy against the live database.
