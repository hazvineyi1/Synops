# Operations Runbook

Operational reference for running the four Synops services in production. Pairs
with the deploy guides (`DEPLOY.md`, `DEPLOY-KANON.md`) and the env references
(`.env.example`, `.env.paideia.example`, `praxis/.env.example`).

## Services and deploy targets

| Service | Image | Railway config | Healthcheck | What it serves |
|---|---|---|---|---|
| Coach | `Dockerfile` | `railway.json` | `/api/healthz` | api-server + arete SPA |
| Kanon | `Dockerfile.kanon` | `railway.kanon.json` | `/api/healthz` | kanon-api + kanon SPA |
| Paideia | `Dockerfile.paideia` | `railway.paideia.json` | `/api/healthz` | paideia-api + marketing/study/app + Compass builder |
| Praxis | `Dockerfile.praxis` | `railway.praxis.json` | `/api/readyz` | praxis api-server + praxis SPA |

All four images pin `NODE_ENV=production`, run as the non-root `node` user, and
fail fast at boot when a required env var is missing (see each env example).

## Health, readiness, and version endpoints

Every service exposes the same three endpoints, mounted ahead of auth so they
never depend on an external provider:

- `GET /api/healthz` — liveness. Process is up. Does not touch the database, so a
  transient DB blip never triggers a restart. This is the container healthcheck.
- `GET /api/readyz` — readiness. Pings the DB with a bounded 3s timeout; returns
  `200 {"status":"ready","db":"up"}` or `503` when the DB is unreachable. Gate
  traffic / uptime monitors on this, not `/healthz`.
- `GET /api/version` — build identity: `commit` (Railway git SHA), `deploymentId`,
  `env`, `node`, `startedAt`, `uptimeSeconds`. First thing to check during triage
  and the confirmation that a rollback took.

Quick check for any service:

```bash
curl -s https://<host>/api/healthz     # {"status":"ok"}
curl -s https://<host>/api/readyz      # {"status":"ready","db":"up"}
curl -s https://<host>/api/version     # which build is live
```

## Monitoring and log correlation

- **Structured logs**: all services log JSON via pino. Filter by `req.id`.
- **Request IDs**: every response carries an `x-request-id` header (an inbound
  `X-Request-Id` is honoured, otherwise a UUID is minted). A user reporting an
  error can quote it; search the logs for that id to find the exact request.
- **Error monitoring (Sentry)**: all four services report 5xx errors to Sentry
  when `SENTRY_DSN` is set (no-op otherwise). Set `SENTRY_DSN` (and optionally
  `SENTRY_ENVIRONMENT`) as a Railway service variable to enable alerting.

## Incident triage

1. Hit `/api/version` on the affected service — confirm which build is live.
2. Hit `/api/readyz` — if `503`, the database is unreachable; check the Postgres
   service and connection string before anything else.
3. If a specific user is affected, get their `x-request-id` and grep the logs.
4. Check Sentry (if configured) for the stack trace.
5. If a recent deploy caused it, roll back (below) and confirm with `/api/version`.

## Rollback

Railway keeps prior deployments. To roll back: open the service in Railway →
Deployments → select the last known-good deployment → Redeploy. Confirm the
`commit` returned by `/api/version` matches the known-good SHA. Because
healthchecks are DB-independent for liveness and the app fails fast on bad
config, a bad build is caught quickly.

## Backups and recovery

- **Automated backup**: `.github/workflows/db-backup.yml` runs `pg_dump` nightly
  (02:00 UTC) against the Coach Postgres and stores a compressed custom-format
  dump as a GitHub Actions artifact (retained 90 days). Requires the
  `DATABASE_PUBLIC_URL` repo secret (Railway's public Postgres URL). It can also
  be run on demand via "Run workflow". A companion job backs up the Praxis DB.
- **Restore**: download the `.dump` artifact from the workflow run, then:

  ```bash
  pg_restore --clean --no-owner -d "$TARGET_DATABASE_URL" coach-db-<stamp>.dump
  ```

  Restore into a fresh/staging database first and verify before pointing
  production at it.
- **Schema**: each service's schema is managed with Drizzle. Dev uses
  `pnpm --filter @workspace/<db-pkg> run push`; Praxis additionally keeps
  versioned migrations under `praxis/lib/db/migrations` (validate with
  `pnpm --filter @workspace/db run migrate:check`).
- **Upgrade path**: nightly artifact backups are the pre-revenue baseline. Move
  to Railway Pro point-in-time recovery once the data warrants it.

## Capacity and scaling notes

- **Stateless app tier**: the API/SPA containers hold no local state (uploads go
  to object storage, sessions to Postgres or Clerk), so they scale horizontally.
- **Rate limiting is per-instance**: the built-in limiters use in-memory counters,
  so under multiple instances each enforces its own window (an intentional
  baseline, not exact global limits). For exact cross-instance limits, move the
  counters to a shared store (e.g. Redis). Health probes are exempt from limits.
- **Database is the shared bottleneck**: connection pools use bounded sizes and an
  idle-error listener so a dropped socket never crashes the process. Watch pool
  saturation and Postgres CPU first when scaling the app tier.
- **Graceful shutdown**: every service handles SIGTERM/SIGINT, draining in-flight
  requests (10s grace) so Railway redeploys don't sever live connections.

## Capacity planning specifics

- **Connection budget**: each app instance opens at most `max: 10` pooled DB
  connections (`keepAlive`, 30s idle recycle, 10s connect timeout). Managed
  Postgres plans typically allow ~100 connections, so keep
  `instances × 10 + headroom (migrations, backups, psql) ≤ max_connections`.
  Past ~7–8 instances per database, put a pooler (PgBouncer, transaction mode)
  in front rather than raising per-instance `max`.
- **Query performance**: hot lookups are indexed at the schema level (foreign
  keys and the columns filtered on in list/rollup endpoints). When adding a new
  frequently-filtered column, add an index in the same schema change and confirm
  with `EXPLAIN` against a production-sized copy. Watch Postgres slow-query logs
  and `pg_stat_statements` for regressions.
- **AI cost**: the coach enforces a per-user daily model-call cap (in-memory,
  per instance). For exact multi-instance cost control, move the counter to a
  shared store. Model responses are capped in `max_tokens`.
- **Right-size first, scale second**: the app tier is cheap to scale
  horizontally; the database is the constraint. Add app instances for request
  concurrency, but watch pool saturation and Postgres CPU before assuming the
  app tier is the bottleneck.

## Logging and retention

- **Format**: structured JSON (pino) to stdout; the platform (Railway) collects
  and retains them per its plan. Set `LOG_LEVEL` (`trace|debug|info|warn|error`,
  default `info`) per service.
- **What is logged**: request id, method, path (query string stripped), status,
  and error objects on failures. Secrets and full request bodies are not logged.
- **Retention**: platform log retention is a Railway setting, not a code
  concern. For long-term audit or compliance retention, ship stdout to an
  external sink (e.g. a log drain to a provider with the required retention) —
  the JSON format is drain-ready as-is.
- **Correlation**: every response carries `x-request-id`; quote it to a user and
  grep the logs, or search Sentry by the same id.

## Disaster recovery

- **Backup cadence (RPO)**: automated `pg_dump` runs nightly (02:00 UTC), so the
  worst-case data loss with backups alone is ~24h. Tighten by running the backup
  workflow more often (`workflow_dispatch` or a denser cron) or by moving to a
  provider with point-in-time recovery once the data warrants it.
- **Restore drill (target RTO — practise this before you need it)**:
  1. Provision a fresh empty Postgres (staging).
  2. Download the latest `.dump` artifact from the DB Backup workflow run.
  3. `pg_restore --clean --no-owner -d "$STAGING_URL" <file>.dump`.
  4. Point a staging app instance at it (`DATABASE_URL`) and verify `/api/readyz`
     plus a couple of real reads before trusting the restore.
  5. To recover production, repeat against the production database (or cut the
     service over to the verified staging database).
- **Config recovery**: all runtime config is environment variables (documented
  in the `.env*.example` files) held in Railway, not in the database, so a DB
  restore does not lose service configuration.
- **Rollback vs restore**: a bad *deploy* is a rollback (Railway → redeploy the
  last good build, confirm with `/api/version`); a bad *data* event is a restore
  (above). They are independent.

## Validation (executed)

These were run against a booted service (Coach) with a real Postgres, and are
reproducible with the committed harness.

- **Load** (`scripts/loadtest.mjs`, zero-dependency, exits non-zero on any error
  or 5xx — safe to gate a pipeline):
  - Liveness `/api/healthz`, 5000 requests @ 200 concurrency: ~2000 req/s, p99
    ~196ms, 0 errors, 0 5xx.
  - Readiness `/api/readyz` (DB-backed, exercises the 10-connection pool under
    contention), 2000 requests @ 100 concurrency: ~1450 req/s, p99 ~127ms, 0
    errors, 0 5xx.
  - Reproduce: `node scripts/loadtest.mjs https://<host>/api/readyz -r 2000 -c 100`.
    Run against staging before launch and after any pool/query change; watch that
    p99 stays flat and 5xx stays 0 as concurrency rises.
  - **SLO gate**: the harness enforces objectives when given thresholds, and exits
    non-zero on a breach so it can gate a pipeline or a launch sign-off. Starting
    targets (adjust to the numbers the business agrees, then hold the line):
    availability ≥ 99.9%, readiness `p99 ≤ 300ms`, error-rate `≤ 0.5%` at the
    expected peak concurrency. Enforce with:
    `node scripts/loadtest.mjs https://<host>/api/readyz -r 2000 -c 100 --max-p99 300 --max-error-rate 0.5`
    (measured baseline on the reference box: p99 ~220ms, 0% errors — comfortably
    inside target).
- **Chaos / failure-mode** (DB outage drill): with the service under a live DB,
  stop Postgres, then restart it. Observed and expected behaviour:
  - During the outage: `/api/readyz` → `503 {"status":"not-ready","db":"down"}`
    (load balancer stops routing), `/api/healthz` → `200` (liveness stays up so
    the orchestrator does not kill an otherwise-healthy pod for a transient DB
    blip), and the process does **not** crash (the pool `error` listener absorbs
    the dropped-connection event).
  - After the DB returns: `/api/readyz` → `200` automatically, with no process
    restart — the pool re-establishes connections on demand.
  - Reproduce against a controllable DB: hit `/api/readyz` in a loop, stop the
    database, confirm 503 + process-alive, restart it, confirm auto-recovery to
    200. Do this in staging as part of pre-launch resilience sign-off.

## Third-party integrations (all degrade gracefully when unset)

| Integration | Used by | Behaviour when unconfigured |
|---|---|---|
| Clerk (auth) | Coach | required to boot |
| Anthropic | Coach, Praxis | Coach requires the key; Praxis AI features degrade |
| OpenAI-compatible | Paideia, Kanon/Compass | Paideia requires both AI vars to boot |
| Stripe | Coach, Kanon, Paideia | billing/Pro upgrades disabled |
| Flutterwave / Paynow | Coach, Paideia | those payment rails disabled |
| Supabase Storage | Praxis | upload endpoints return a clear 4xx |
| Resend (email) | Kanon, Paideia, Praxis | email disabled; actions still succeed |
| Twilio (WhatsApp/SMS) | Paideia, Praxis | notifications skipped |
