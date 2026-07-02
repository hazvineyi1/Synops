# Coach — Phase 0 Production Hardening

Goal of Phase 0: stop flying blind. Make the live Coach app safe to run with real
paying users before we layer on the "chargeable" (Phase 1) and "market-ready"
(Phase 2) work. This file tracks what's done, what needs a human, and how to ship
and verify.

## What shipped in this batch (code)

1. **Rate limits on the expensive AI endpoints.** A mutating-methods-only limiter
   (`writeRateLimit` in `artifacts/paideia-api/src/middlewares/rateLimit.ts`) is now
   mounted on practice, exams, tutor, knowledge, assessments, strategy, materials,
   and paths. Reads are never throttled. Limits: 40 generations / 10 min / IP for
   most endpoints, 80 / 10 min for the tutor (chat is naturally chattier). This caps
   runaway model cost and abuse.
2. **`trust proxy` enabled** (`app.ts`). Behind Railway's proxy, `req.ip` was the
   shared proxy address, so per-IP limits throttled *all* users as one. Now the real
   client IP is used — this also fixes the pre-existing auth login/signup limiter.
3. **`/readyz` readiness endpoint** (`routes/health.ts`). Pings Postgres and returns
   503 when the DB is unreachable, so monitoring/rolling deploys can tell "process
   up" apart from "actually serving." `/healthz` stays as the cheap liveness check.
4. **CI quality gate** (`.github/workflows/ci.yml`). Every push/PR runs
   `pnpm run typecheck` + the full Coach build (node 24 / pnpm 9, mirroring
   `Dockerfile.paideia`). This is what catches a broken commit — the local sandbox
   can't be trusted for this (see note below).

> Note on local verification: the automated sandbox mounts a mangled copy of large
> source files, so `tsc` run there reports false syntax errors. Trust the CI (and a
> local `pnpm run typecheck` on your own machine), not the sandbox.

## Actions only you can do

### 1. Rotate the leaked Anthropic API key (do this first)

A live `sk-ant-…` key was pasted in plaintext earlier in a chat, so treat it as
compromised.

1. Go to https://console.anthropic.com/ → **API Keys**.
2. Create a new key. Copy it once.
3. In Railway → project **nurturing-encouragement** → service **wonderful-adaptation**
   → **Variables**, paste the new key into the existing Anthropic key variable
   (used by the OpenAI-compat client). Deploy.
4. Back in the Anthropic console, **delete/revoke the old key**.
5. Confirm the app still answers (tutor + a practice generation) after redeploy.

### 2. Enable Railway Postgres automated backups

1. Railway → the **Postgres** service (`f879c4d3-…`) → **Backups** tab.
2. Enable scheduled backups (daily). Set retention to at least 7 days.
3. Confirm the first backup completes.

### 3. Do one restore drill (an untested backup is not a backup)

1. Create a throwaway Railway environment or a new empty Postgres service.
2. Restore the latest backup into it.
3. Point a local API instance at the restored DB
   (`DATABASE_URL=…restored…`) and confirm it boots and `/readyz` returns 200.
4. Write down how long the restore took — that's your recovery-time number.
5. Tear down the throwaway.

## How to ship this batch

1. On your machine, from the repo root: `pnpm run typecheck` (should be clean).
2. Commit + push:
   `powershell -ExecutionPolicy Bypass -File "C:\Users\hazvi\Synops-Consulting Build\synops-src\commit-synops.ps1"`
3. GitHub Actions runs CI on the push. Railway also redeploys on the push.
4. After deploy, verify:
   - `GET https://<live-host>/api/healthz` → `{"status":"ok"}`
   - `GET https://<live-host>/api/readyz` → `{"status":"ready"}`
   - Hammer a generation endpoint >40x in 10 min from one client → expect HTTP 429.

> Optional but recommended: make Railway wait for CI to pass before deploying
> (branch protection + "require status checks"), so CI actually gates production
> rather than just running alongside it.

## Sentry error tracking (shipped — needs a DSN to turn on)

Sentry is wired into both the API and the Coach frontend. It is a **no-op until a
DSN is set**, so nothing changes until you turn it on. Boot-safe: init is wrapped
in try/catch and error capture swallows its own failures, so it can never take the
server down.

To turn it on:

1. Create a free project at https://sentry.io → you get a DSN (looks like
   `https://xxxx@oyyy.ingest.sentry.io/zzz`). Create two projects (or one) — a
   Node project for the API and a React project for the frontend.
2. In Railway → service **wonderful-adaptation** → Variables, add:
   - `SENTRY_DSN` = the Node project DSN (backend errors).
   - `VITE_SENTRY_DSN` = the React project DSN (frontend errors). This one is read
     at **build time**, so it must be set before/at deploy.
   - (optional) `SENTRY_ENVIRONMENT` = `production`.
3. Redeploy. Backend errors and unhandled frontend errors now flow to Sentry,
   tagged with the Railway commit SHA as the release.

## Playwright smoke tests (shipped)

A standalone `e2e/` package (isolated from the app build) with a `.github/
workflows/e2e.yml` workflow that smoke-tests the live deployment: liveness
(`/api/healthz`), readiness (`/api/readyz`), the Coach sign-in page renders, the
marketing root loads, and an optional authenticated sign-in. Runs daily at 06:00
UTC and on demand (Actions → E2E Smoke → Run workflow).

Optional, to enable the authenticated test:

1. Create a dedicated throwaway learner account in the app (not a real user).
2. Add repo secrets `TEST_EMAIL` and `TEST_PASSWORD` with its credentials.
   Without them, that one test is skipped and the rest still run.
3. To point the suite at a different environment, set a `BASE_URL` repository
   variable.

This is a deployment/uptime smoke, deliberately not a per-commit gate — `ci.yml`
(typecheck + build) is the per-push gate. Full journey E2E (upload → extract →
practice → exam → tutor, which drives real AI generation and cost) is a larger
follow-up beyond Phase 0.

## Phase 0 status: complete

All six Phase 0 items are done: AI-endpoint rate limits + trust proxy, `/readyz`,
CI gate, nightly DB backups (verified), Sentry error tracking (needs a DSN to turn
on), and Playwright smoke tests. Next is Phase 1 (payments end-to-end, privacy/ToS
+ data export/delete, PII stripping before AI calls, age gate).

Then Phase 1 (payments end-to-end, privacy/ToS + data export/delete, PII stripping
before AI calls, age gate) and Phase 2 (activation funnel, PWA/offline for the
African market, support + trust surfaces).
