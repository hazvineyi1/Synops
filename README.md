# Synops monorepo

A pnpm-workspace monorepo for the Synops learning products. Two deployable
services plus their shared libraries:

- **Paideia** (`Dockerfile.paideia` / `railway.paideia.json`) — one service that
  serves the marketing site, the AI Study **Coach** (`artifacts/paideia-study`),
  the Paideia teacher app (`artifacts/paideia-app`), the **Compass** curriculum
  builder (`artifacts/compass-web`), and the shared API (`artifacts/paideia-api`).
- **Praxis** (`praxis/`, `Dockerfile.praxis` / `railway.praxis.json`) — the LMS.
  It is a **self-contained pnpm workspace** with its own lockfile.

See [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for the production runbook.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (`artifacts/paideia-api`)
- Web: React + Vite
- DB: PostgreSQL + Drizzle ORM (`lib/paideia-db`, `lib/compass-db`, `praxis/lib/db`)
- AI: Anthropic Claude (server-side only)

## Prerequisites

- Node.js 24
- pnpm (`corepack enable pnpm`). npm is blocked by a preinstall guard.
- A PostgreSQL database.

## Setup

```bash
pnpm install
pnpm --filter @workspace/paideia-db run push   # push the Paideia schema
```

## Build

```bash
pnpm run build       # cross-package typecheck + build
pnpm run typecheck   # typecheck only
```

Environment variables are documented in [`.env.paideia.example`](.env.paideia.example)
and, for Praxis, [`praxis/.env.example`](praxis/.env.example). Each service
validates its config at boot and refuses to start if a required value is missing.

## Project layout

- `artifacts/paideia-ren` — marketing site (React/Vite).
- `artifacts/paideia-study` — the AI Study Coach.
- `artifacts/paideia-app` — the Paideia teacher app.
- `artifacts/paideia-api` — the shared Express API (`/api`).
- `artifacts/compass-web` + `artifacts/compass-api` — the Compass curriculum builder.
- `artifacts/mockup-sandbox` — design/preview scratch app, not a shipped product.
- `lib/paideia-*`, `lib/compass-*` — schemas, generated clients, and shared libs.
- `praxis/` — the Praxis LMS (its own workspace).

## Notes

- Run the relevant `run push` before the first start and after pulling schema changes.
- The Anthropic key is server-side only and must never reach the client bundle.
- POPIA compliance (consent capture, data export/erasure, maintenance mode, EU
  region-migration tooling) is documented in [`docs/POPIA.md`](docs/POPIA.md).
