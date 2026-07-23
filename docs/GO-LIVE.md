# Go-Live Runbook

The platform's code is complete, tested, and CI-gated. The steps below are the
operator actions that require real accounts, credentials, infrastructure, or a
business decision — the things that cannot live in the repository. Each service
fail-fasts at boot if a required variable is missing; run the preflight check
first to catch that before a deploy instead of after.

Deployables (each is its own Railway service / Dockerfile):

| Product | Dockerfile | Railway config | Health path |
| --- | --- | --- | --- |
| The Coach | `Dockerfile` | `railway.json` | `/api/healthz` |
| Kanon | `Dockerfile.kanon` | `railway.kanon.json` | `/api/healthz` |
| Paideia (+ Compass builder at `/builder/`) | `Dockerfile.paideia` | `railway.paideia.json` | `/api/healthz` |
| Synops Praxis | `Dockerfile.praxis` | `railway.praxis.json` | `/api/readyz` |

## 1. Preflight (run this first, and again in your release pipeline)

Validate the environment a service is about to boot with, and optionally that its
database is reachable:

```bash
pnpm preflight coach            # or: kanon | paideia | praxis | all
pnpm preflight coach --check-db # also TCP-probes DATABASE_URL
```

It exits non-zero (so it can gate a deploy) when a REQUIRED variable is missing
or an all-or-nothing optional group (e.g. Stripe) is only partially set. Optional
integrations that are simply unset are reported as notes, not failures — they
degrade gracefully at runtime by design.

## 2. Databases

- Provision one Postgres per service (Railway's Postgres plugin works). Praxis and
  the Coach are separate databases; Paideia's embedded Compass builder uses its own
  `COMPASS_DATABASE_URL`.
- Apply the schema: `pnpm --filter @workspace/db run push` (Coach), and the
  equivalent for `@workspace/kanon-db`, `@workspace/paideia-db`, and Praxis's
  `@workspace/db`. Praxis also carries versioned migrations under
  `praxis/lib/db/migrations` (`drizzle-kit migrate`).
- Set the `DATABASE_PUBLIC_URL` GitHub Actions secret so the nightly `pg_dump`
  backup workflow (`.github/workflows/db-backup.yml`) runs.

## 3. Environment variables

Fill in each service's variables from its annotated example: `.env.example` (Coach),
`.env.paideia.example` (Paideia), `praxis/.env.example` (Praxis), and
`DEPLOY-KANON.md` (Kanon). Required-to-boot sets (the preflight manifest mirrors
these):

- Coach: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`,
  `CLERK_PUBLISHABLE_KEY`, `PORT`; plus `VITE_CLERK_PUBLISHABLE_KEY` as a **build**
  variable (Vite inlines it).
- Kanon: `DATABASE_URL`, `SESSION_SECRET`, `PORT`.
- Paideia: `DATABASE_URL`, `PORT`, `AI_INTEGRATIONS_OPENAI_BASE_URL`,
  `AI_INTEGRATIONS_OPENAI_API_KEY`.
- Praxis: `DATABASE_URL`, `SESSION_SECRET`, `PORT`.

## 4. Third-party accounts

Each is optional and degrades gracefully, but you need it for the corresponding
feature. Set the keys, then point each provider's webhook at the service URL.

- Auth: Clerk (Coach). Kanon/Paideia/Praxis use first-party sessions.
- AI: Anthropic (Coach, Praxis); an OpenAI-compatible endpoint (Paideia, Compass).
- Payments: Stripe (all), plus Flutterwave / Paynow for those regions. Set the
  secret keys **and** the webhook secrets (`STRIPE_WEBHOOK_SECRET`,
  `FLW_WEBHOOK_HASH`).
- Email: Resend (`RESEND_API_KEY`, `EMAIL_FROM`).
- SMS / WhatsApp: Twilio (Paideia, Praxis).
- File storage: Supabase (Praxis uploads).
- Error monitoring: set `SENTRY_DSN` on any service to enable alerting.

## 5. Validate payment flows end to end

In Stripe **test mode** first: run a real checkout, confirm the webhook is received
and signature-verified, confirm the tenant flips to the paid tier, then test
cancellation and the customer portal. Repeat for Flutterwave / Paynow test modes if
used. The code path and its forged-webhook rejection are already covered by tests;
this step exercises them against a live (test) gateway.

## 6. SLA / SLO targets (a business decision)

Decide the numbers (the runbook proposes availability >= 99.9%, readiness p99
<= 300ms, error-rate <= 0.5%), then update the thresholds in `scripts/loadtest.mjs`
and the CI SLO gate and run against staging:

```bash
node scripts/loadtest.mjs https://<staging>/api/readyz -r 2000 -c 100 --max-p99 300 --max-error-rate 0.5
```

## 7. Deploy + monitoring

- Deploy each service via its Dockerfile / `railway.*.json`.
- Point the platform healthcheck at the path in the table above.
- Add an uptime monitor on `/api/readyz` and alerting on Sentry.
- Confirm each service with `/api/version` (live commit + region) and `/api/readyz`
  (reports `db: up`).

## 8. Optional at scale: multi-region + DR drills

Follow `docs/MULTI-REGION.md`: a cross-region DB replica, health-checked DNS or a
global load balancer pointed at `/api/readyz`, per-region instances with that
region's `DATABASE_URL` and `REGION` set. Rehearse the disaster-recovery restore
drill and the failover drill in staging (both stepped out in `docs/OPERATIONS.md`
and `docs/MULTI-REGION.md`) before relying on them.

## 9. Go-live housekeeping

- Merge the release PR once CI is green.
- Point production DNS / custom domains at the services; set `ALLOWED_ORIGINS` /
  `APP_URL` only if the frontend is ever served cross-origin.
- Final smoke test: `e2e/tests/smoke.spec.ts` hits the health endpoints and the
  sign-in page.
