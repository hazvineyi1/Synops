# The Coach

An AI study coach for adults preparing for high-stakes exams (bar, professional certifications, university coursework): the user talks to a dedicated coach that knows their material, opens each day with a plan, teaches through dialogue, checks understanding, and adapts toward the exam date. The conversation is the product.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/*` — one file per table; `index.ts` re-exports all.
- API contract: the Express routes in `artifacts/api-server/src/routes/*` are the source of truth; client hooks and Zod schemas in `lib/api-client-react` and `lib/api-zod` are codegen'd from the OpenAPI spec (`lib/api-spec`).
- Coaching engine: `artifacts/api-server/src/lib/` — `anthropic.ts` (Claude client, model, rate limits), `sm2.ts` (spaced repetition), `learnerContext.ts` (profile → prompt context), `extractText.ts` (ingestion).
- Frontend app: `artifacts/the-coach/src/pages/*` — one page per surface; routing in `App.tsx`.
- `mockup-sandbox` is a design/preview scratch app, not shipped product.

## Architecture decisions

- The AI coach is the product spine, not a feature. The home surface (`/coach`) is a conversation; planning, teaching, checkpoints, and reviews all happen through it. On open with no history the coach auto-generates the day's plan (`useDailyOpen` in `pages/coach.tsx`). See PRODUCT_SPINE.md for the full articulation.
- Spaced repetition (SM-2, `lib/sm2.ts`) is the invisible engine. The user never sees intervals or "SM-2"; checkpoint grades (0-3) drive mastery and due dates, and the coach surfaces it as "knowing" when to bring a concept back.
- Coach personalities (drill / socratic / warm / analyst) are system-prompt persona layers over one shared engine. Voice and pressure change; accuracy and pedagogy never do.
- Stack differs from the original build spec: the spec named Prisma + React/Vite; the actual build uses Drizzle ORM, Orval-generated client hooks from an OpenAPI spec, Clerk auth, and Express 5. The code is the source of truth, not the spec.
- All Anthropic calls are server-side only (`api-server`), behind per-user daily rate caps. The key is never in the client bundle.

## Product

The Coach is one conversational study product with four supporting surfaces (`/coach`, `/material`, `/progress`, `/settings`), plus a first-run assessment (`/start`) that recommends one of four coach personalities. The coach does three things: PLAN (opens each day with a rationale-backed plan from due/weak concepts and yesterday's results), TEACH & TEST (introduces concepts via real-world scenarios from the learner's profile, then grades typed checkpoint answers in its voice), and REVIEW (reflects in-voice and runs a weekly retrospective from real data). Users feed it material by paste, URL, or file upload, which funnels into one concept-extraction pipeline.

The Coach is exactly this one product — there are no other user-facing surfaces. An Immigration portal that previously shared this infrastructure was split out on 2026-06-11 to keep the Coach single-spined; its code now lives, unwired, in `separated/immigration-portal/` (see that directory's README and PRODUCT_SPINE.md).

## User preferences

- Communication style: do not use markdown headers (#), asterisks (* or ** for bold/italic), or em dashes in chat responses. Use plain sentences, hyphen bullet lists, and regular punctuation (commas, periods, parentheses).

## Gotchas

- Client API hooks and Zod schemas are codegen'd. After changing a route's shape, regenerate (`pnpm --filter @workspace/api-spec run codegen`) rather than editing `lib/api-client-react`/`lib/api-zod` by hand.
- `separated/` holds the split-out Immigration portal and is intentionally outside the workspace globs (`artifacts/*`, `lib/*`, `scripts`). Do not import from it into the Coach, and do not add it to `pnpm-workspace.yaml` packages — it is a seed for a separate app, not part of this build.
- An `immigration_cases` table may still exist in a previously-migrated database even though the Coach no longer defines it. It is orphaned (the standalone immigration app starts fresh and reuses none of it), so it can be dropped — the next `pnpm --filter @workspace/db run push` will detect it as no longer in the schema and offer to drop it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
