# Deploying The Coach

The Coach is a pnpm monorepo that builds into a single container: an Express API
server (`artifacts/api-server`) that also serves the built React frontend
(`artifacts/the-coach`). The repo is configured for Railway via `Dockerfile` and
`railway.json`, but the container runs anywhere Docker does.

## What you need before deploying

- A **Postgres** database (Railway's Postgres plugin works out of the box).
- A **Clerk** application for authentication (publishable + secret keys).
- An **Anthropic** API key (the coach engine).
- Optionally, a **Stripe** account if you want paid Pro plans. Billing is
  disabled gracefully when Stripe is not configured.

All configuration is via environment variables. See `.env.example` for the full,
annotated list. The server validates them at startup and refuses to boot if a
required value is missing, so a misconfiguration fails immediately and loudly
rather than at the first request.

## Required environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string. |
| `ANTHROPIC_API_KEY` | Yes | Powers the coach. |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key. |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk frontend key (runtime). |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes (build) | Same Clerk publishable key, needed at **build time** — Vite inlines it. On Railway, set it as a build variable. |
| `PORT` | Yes | Injected automatically by Railway. |
| `NODE_ENV` | Recommended | Set to `production`. |
| `ALLOWED_ORIGINS` / `APP_URL` | Optional | Only needed if a different origin must call the API cross-origin. Same-origin (the default) needs neither. |
| `LOG_LEVEL` | Optional | Defaults to `info`. |
| `ADMIN_EMAILS` | Optional | Comma-separated admin emails. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Optional | All-or-nothing. Set all four or none. |
| `ENABLE_TEST_LOGIN` | Never in prod | Dev-only auth bypass. The server refuses to boot if this is set while `NODE_ENV=production`. |

## Deploy to Railway

1. **Create the project.** New Project → Deploy from your GitHub repo. Railway
   reads `railway.json` and builds from the `Dockerfile`.
2. **Add Postgres.** Add the Postgres plugin. It exposes `DATABASE_URL`; map it
   into the app service's variables.
3. **Set variables.** Add all required variables from the table above to the app
   service. Crucially, set `VITE_CLERK_PUBLISHABLE_KEY` as a **build** variable
   (not just runtime) — the frontend bundle bakes it in at build time.
4. **Deploy.** Railway builds the image, which installs dependencies, builds the
   API bundle and the frontend, and starts the server.
5. **Run the database migration once.** The schema must be pushed to the fresh
   database before first use (Drizzle):

   ```
   pnpm --filter db push
   ```

   Run this with `DATABASE_URL` pointing at the production database — from a
   Railway one-off command/shell, or locally against the production URL. This
   creates the tables from the current schema. (The standalone immigration
   product was split out, so `immigration_cases` is intentionally not created.)
6. **Verify health.** Railway polls `/api/healthz` (configured in
   `railway.json`). A green health check means the server booted and passed env
   validation.

## Notes and gotchas

- **pnpm is pinned to v9** in the `Dockerfile` on purpose. pnpm 10+ blocks
  dependency build scripts (esbuild, `@clerk/shared`) behind an approval gate
  that fails a non-interactive install. Do not bump it without re-testing.
- **Typecheck is not part of the Docker build.** The image builds the bundles
  directly. Run `pnpm run typecheck` in CI or locally before deploying as your
  safety net.
- **Rate limits are per-instance.** The built-in limiter is in-memory, so under
  multi-instance autoscaling each instance enforces its own window. For globally
  exact limits, back it with a shared store (e.g. Redis).
- **CORS is locked down by default.** With no `ALLOWED_ORIGINS`/`APP_URL` set,
  production allows same-origin only. Add origins explicitly if a separate
  frontend domain needs cross-origin API access.
- **Stripe webhooks.** If using billing, point your Stripe webhook at
  `/api/billing/webhook` and set `STRIPE_WEBHOOK_SECRET`. The raw request body
  is preserved for signature verification.

## Local development

```
cp .env.example .env      # fill in real values
pnpm install
pnpm --filter db push     # push schema to your local/dev Postgres
pnpm run build            # typecheck + build all packages
```

Then run the API server and frontend per the workspace's dev scripts.
