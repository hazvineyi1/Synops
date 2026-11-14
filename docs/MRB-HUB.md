# MRB Practice Hub at its own address

The MRB Practice Hub runs as a **second deployment of Praxis**, from this repo and the same
`Dockerfile.praxis` image, with its own database and its own address. The main Praxis service
(praxis.synops-consulting.com) is unchanged.

What is separate: the running service, the database, the address, the AI key and the release timing.
What is shared: the codebase, the image, CI, and every Praxis fix.

## How hub mode works

- `HUB_MODE=mrb` on a service makes the server add `<meta name="praxis-hub" content="mrb">` to every
  `index.html` it sends. The SPA reads it at start-up (`src/lib/hub.ts`), so the mode is a runtime
  setting and the same built image serves both deployments.
- In hub mode the root `/` is the MRB Practice Hub front door with **Sign in**. Signed-in candidates
  go to My Credentials, reviewers and tutors (role `coach`) to the review queue, admins to the dashboard.
- Other Synops demos and partner landings (`/demo`, `/k12`, `/demos/pej*`, `/demos/educator`, `/p/:slug`,
  `/enzaglobalmedia`, `/request-access`) redirect to `/` on the hub.
- `POST /api/platform/seed-mrb-hub` (super admin) creates the live MRB tenant on a fresh database: the
  partner `the-mrb`, its organisation, the practice credential catalogue, framework v2.1 (12 Core
  Competencies, links, draft Zimbabwe programme) and the MRB brand bound to the hub's host. It creates
  **no** demo candidate, tutor, reviewer or sample work. Idempotent.
- `BOOTSTRAP_SUPER_ADMIN_EMAIL` creates the first super admin on a fresh database (only when none
  exists). Set a password with **Forgot password**, or issue a link from the platform console.
- `MRB_HUB_URL` on the **main** Praxis service 301-redirects the old `/demos/mrb` link to the hub.
  Leave it unset until go-live.

## Railway setup (each step waits for Belinda's yes)

1. In the **Synops** Railway project, add a Postgres database for the hub (for example `MRB Hub DB`).
2. Add a service `mrb-hub` from the GitHub repo. Config file path: `railway.praxis.json`
   (builds `Dockerfile.praxis`, health check `/api/readyz`). Deploy from a release branch, for
   example `mrb-hub-release`, so Synops changes reach MRB only when merged there.
3. Service variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | reference to the MRB hub database |
   | `HUB_MODE` | `mrb` |
   | `CANONICAL_HOST` | `mrb.synops-consulting.com` |
   | `MRB_HUB_HOST` | `mrb.synops-consulting.com` |
   | `APP_URL`, `PUBLIC_APP_URL` | `https://mrb.synops-consulting.com` |
   | `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` |
   | `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | MRB's own key (see below) |
   | `EMAIL_FROM`, `RESEND_API_KEY` | so invites and password resets send from the hub |
   | `ENABLE_DEMO_LOGIN` | `0` |
   | `BOOTSTRAP_SUPER_ADMIN_EMAIL` | the Synops admin email, first deploy only |

   Copy any other required variables from the main Praxis service (see `praxis/.env.example`); the
   server refuses to boot if one is missing. Do **not** copy the main service's AI key.
4. Push the schema into the new database once: `DATABASE_URL=<hub db> pnpm --filter @workspace/db run push`
   from `praxis/`.
5. Settings, Networking: add the custom domain `mrb.synops-consulting.com`. Railway shows a CNAME
   target. Add that CNAME (and any verification record) at the synops-consulting.com DNS provider.
   HTTPS is issued automatically.
6. Sign in as the bootstrap admin, then run `POST /api/platform/seed-mrb-hub` (body optional:
   `{ "customDomain": "mrb.synops-consulting.com" }`).
7. Smoke test: `/api/readyz`, the MRB front door at `/`, sign-in branding, a Mutale reply on a
   credential, and a credential submission reaching the review queue.
8. Add the hub database to the nightly backup workflow (`.github/workflows/db-backup.yml`) as its own
   secret.

## MRB's own AI key

MRB opens an Anthropic account in its own name, adds billing, sets a monthly spend limit and creates
one API key for the hub. MRB shares it through a one-time secret link or a password manager share,
never plain email. It goes only into the `mrb-hub` service variable `AI_INTEGRATIONS_ANTHROPIC_API_KEY`,
never into the repo. All Mutale usage then bills to MRB, and MRB sees it in its own dashboard.

## Go-live checklist

- Review accounts removed, `ENABLE_DEMO_LOGIN=0`, `BOOTSTRAP_SUPER_ADMIN_EMAIL` removed.
- Cohort accounts loaded under the `the-mrb` partner.
- On the **main** Praxis service, set `MRB_HUB_URL=https://mrb.synops-consulting.com` so the old
  demo link redirects.
