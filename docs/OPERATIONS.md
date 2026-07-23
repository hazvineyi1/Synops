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
