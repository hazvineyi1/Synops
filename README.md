# Digital Justice Hub: pilot application

Working pilot for Project Expedite Justice, built by Synops Consulting LLC.

What it does:
- Accounts: request access, institutional approval, sign-in with hashed passwords and server sessions.
- Student dashboard: progress, completion requirements (computed on the server), work to do, announcements.
- Course player for GRN01, the Pillaging Case evidence review: 15 screens, route-specific tasks, gated checkpoints, incremental save with conflict handling, idempotent immutable submissions, server-graded quiz (keys never sent to the browser), model-exposure recording.
- Case guide: an AI tutor grounded only in the six fictional source cards. It asks questions, cites cards, refuses to write the brief, blocks messages containing emails or phone numbers, and falls back to authored questions when AI is off or a reply fails the source check.

Stack: Node 20+, Express 4, PostgreSQL. No build step.

## Environment variables
| Name | Purpose |
|---|---|
| DATABASE_URL | Postgres connection string |
| ANTHROPIC_API_KEY | Enables the AI case guide. Without it the guide runs in authored mode. |
| AI_MODEL | Model ID (default `claude-sonnet-5`) |
| SEED_DEMO | `1` creates demo accounts |
| DEMO_PASSWORD | Password for the demo accounts |
| AUTO_APPROVE | `1` approves new requests automatically (demos only) |
| NODE_ENV | `production` sets Secure cookies |

## Run locally
    createdb djh && DATABASE_URL=postgres://localhost/djh SEED_DEMO=1 npm start

## Not yet production
Pilot data must move to Ukraine-hosted infrastructure, learner text needs field-level encryption, and PEJ must approve content before live use. All lesson content is fictional; items marked draft await storyboard v1.1.
