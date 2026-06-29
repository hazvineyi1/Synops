# Deploying Kanon (curriculum builder)

Kanon is a second app in this monorepo (`artifacts/kanon` + `artifacts/kanon-api`)
with its own email/password auth and its own database. It deploys as a **second
Railway service** alongside the live Arete service, using `Dockerfile.kanon` /
`railway.kanon.json`.

Kanon and Arete both define a `users` table, so **Kanon needs its own database** —
do not point it at Arete's Supabase project.

---

## 0. Commit the build files

```
powershell -ExecutionPolicy Bypass -File "C:\Users\hazvi\Synops-Consulting Build\synops-src\commit-synops.ps1"
```

This pushes `Dockerfile.kanon`, `railway.kanon.json`, the drizzle config fix, and
all the Kanon feature work to GitHub so Railway can build from it.

## 1. Create a Supabase project for Kanon

- supabase.com → New project (e.g. "kanon"). Save the DB password.
- Project → Connect → **Session pooler** URI (port **5432**, NOT 6543). It looks like:
  `postgresql://postgres.<ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres`

## 2. Push the Kanon schema

```
cd "C:\Users\hazvi\Synops-Consulting Build\synops-src\synops"
$env:DATABASE_URL="<the session pooler URI from step 1, password filled in>"
pnpm.cmd --filter @workspace/kanon-db run push
```

## 3. Create the Railway service

- Railway → your project → **New → GitHub Repo** → select the Synops repo.
  (This creates a second service in the same project as Arete.)
- New service → **Settings → Config-as-code**: set the path to `railway.kanon.json`.
  That makes this service build with `Dockerfile.kanon` (Arete keeps using `railway.json`).

## 4. Set the service variables

In the Kanon service → **Variables**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Kanon session-pooler URI from step 1 |
| `SESSION_SECRET` | a long random string (e.g. `openssl rand -hex 32`) |
| `APP_URL` | `https://kanon.synops-consulting.com` |
| `ALLOWED_ORIGINS` | `https://kanon.synops-consulting.com` |

Optional (features degrade gracefully if unset):
- `AI_INTEGRATIONS_OPENAI_API_KEY` (+ `AI_INTEGRATIONS_OPENAI_BASE_URL`) — AI agenda/notes.
- Email (contact form + verification) currently uses a Replit connector and will not
  send until decoupled to Resend — leave `REQUIRE_EMAIL_VERIFICATION` unset so signup
  does not block on it.

## 5. Deploy + smoke-test

- Deploy. Under **Settings → Networking**, generate a Railway domain to test.
- Visit `https://<railway-domain>/api/healthz` → expect `{"status":"ok"}`.

## 6. Custom domain

- Kanon service → Settings → Networking → **Custom Domain** → `kanon.synops-consulting.com`.
- Railway shows a CNAME target. In GoDaddy DNS add: `CNAME  kanon  <target>.up.railway.app`.
- Wait for Railway to verify (same flow as `arete.synops-consulting.com`).

## 7. Create the first super-admin

Production skips the demo-account seed, so:
1. Open the app and **sign up** with your email/password.
2. In the Supabase SQL editor, elevate that account:
   ```sql
   update users
   set role = 'super_admin', product_key = 'compass'
   where email = 'you@example.com';
   ```
   (If the app requires an organization for non-global roles, super_admin is global and
   does not need one.)
3. Sign out/in. You now have the admin console, the 8-dimension QA report, and the
   CCNE/ABET/AACSB/SACSCOC frameworks (seeded automatically on first boot).

## Known follow-ups (non-blocking)
- Email/contact + email verification run through the Replit connector; decouple to
  Resend (`RESEND_API_KEY`) for real delivery — mirrors what was done for Arete.
- `@replit/*` vite/dev plugins are dev-only and are skipped in the production build.
