# The Coach

An AI study coach for adults preparing for high-stakes exams (bar, professional
certifications, university coursework). The learner talks to a dedicated coach
that knows their material, opens each day with a plan, teaches through dialogue,
checks understanding, and adapts toward the exam date. The conversation is the
product. See [PRODUCT_SPINE.md](PRODUCT_SPINE.md) for the full product definition
and [replit.md](replit.md) for the repo map and architecture notes.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/api-server`)
- Web: React + Vite (`artifacts/the-coach`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Auth: Clerk. Payments: Stripe. AI: Anthropic Claude (server-side only).

## Prerequisites

- Node.js 24
- pnpm (the repo requires it; npm is blocked by a preinstall guard). The easiest
  way to get pnpm is `corepack enable pnpm`.
- A PostgreSQL database.

## Setup

```bash
# 1. Install dependencies (pnpm only)
pnpm install

# 2. Create your env file(s) — see "Environment variables" below.

# 3. Push the database schema (creates/updates all tables)
pnpm --filter @workspace/db run push
```

## Run (development)

Both servers read their port from the `PORT` env var and exit if it is missing.
Dev server configs are also saved in [.claude/launch.json](.claude/launch.json).

```bash
# API server (port 5000)
PORT=5000 pnpm --filter @workspace/api-server run dev

# Web app (Vite, e.g. port 5173) — run in a second terminal
PORT=5173 pnpm --filter @workspace/arete run dev
```

The web app talks to the API at `/api`, so run the API server alongside it.

## Build

```bash
# Typechecks every package, then builds them
pnpm run build
```

`pnpm run build` is the full cross-package typecheck plus build. Other useful
scripts: `pnpm run typecheck` (typecheck only), and
`pnpm --filter @workspace/api-spec run codegen` (regenerate the API client +
Zod schemas from the OpenAPI spec).

## Environment variables

API server (`artifacts/api-server`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | yes | Port to listen on (server exits without it). |
| `DATABASE_URL` | yes | Postgres connection string. |
| `ANTHROPIC_API_KEY` | yes | Claude API key (server-side only). |
| `CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key. |
| `CLERK_SECRET_KEY` | yes | Clerk backend key (user provisioning, account deletion). |
| `STRIPE_SECRET_KEY` | no | Enables billing; without it billing endpoints return 503. |
| `STRIPE_WEBHOOK_SECRET` | no | Verifies Stripe webhooks at `/api/billing/webhook`. |
| `STRIPE_PRICE_MONTHLY` | no | Stripe price id for the $19/mo plan. |
| `STRIPE_PRICE_YEARLY` | no | Stripe price id for the $149/yr plan. |
| `ADMIN_EMAILS` | no | Comma-separated emails granted admin access. |
| `ENABLE_TEST_LOGIN` / `TEST_LOGIN_EMAIL` | no | Dev-only test login. |
| `LOG_LEVEL` / `NODE_ENV` | no | Logging level / environment. |

Web app (`artifacts/the-coach`, Vite — must be prefixed `VITE_`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | yes | Vite dev server port (config exits without it). |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Clerk publishable key for the browser. |
| `VITE_CLERK_PROXY_URL` | no | Clerk proxy URL, if using one. |

## Project layout

- `artifacts/the-coach` — React/Vite web app (the four surfaces: coach, material,
  progress, settings, plus cohorts, assessment, landing, admin, and public
  legal/developer pages).
- `artifacts/api-server` — Express API (`/api` and the public `/api/v1`).
- `artifacts/mockup-sandbox` — design/preview scratch app, not shipped product.
- `lib/db` — Drizzle schema (source of truth for tables).
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react` — OpenAPI spec and the
  generated Zod schemas + React Query client.
- `separated/immigration-portal` — a portal split out of the Coach; not part of
  this build (see its README).

## Notes

- Run `pnpm --filter @workspace/db run push` before the first start, and again
  after pulling schema changes. Recent additions include subscription/trial
  fields, referral fields, institutions, cohorts, cohort_members, api_keys, and
  webhooks tables.
- The Anthropic key is server-side only and must never reach the client bundle.
- Public developer API and webhooks are documented in-app at `/developers`.
- POPIA compliance (learner consent capture, data export/erasure, maintenance
  mode, and the EU region-migration tooling) is documented in
  [`docs/POPIA.md`](docs/POPIA.md). Set `MAINTENANCE_MODE=1` on the Praxis and
  Coach APIs to freeze writes (503) during the EU cutover window.
