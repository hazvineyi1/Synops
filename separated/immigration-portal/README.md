# Immigration Portal (split out from The Coach)

This directory holds the Immigration portal code that was removed from the Coach
study product on 2026-06-11, so the Coach stays one product with one spine (see
`../../PRODUCT_SPINE.md`). The portal is a separate product: an informational US
immigration assistant. It is preserved here as the seed of its own app. It is
NOT wired into the Coach workspace, is not installed, built, or typechecked, and
will not run as-is until it is given its own app shell (see "To run standalone").

## What this product is

An informational US immigration assistant (general information, explicitly not
legal advice). Features:

- A curated USCIS forms-and-fees reference (`server/immigrationData.ts`).
- Illustrative example scenarios (composite, not real cases).
- A live USCIS news feed (the official "All News" RSS) plus curated authoritative
  links, cached server-side.
- An AI "advise" intake: the user describes their situation and gets structured,
  personalized informational guidance (likely forms, rough costs, steps, pitfalls,
  composite examples, follow-up questions, attorney note). Output can be returned
  in English, Spanish, Chinese, Tagalog, or Vietnamese.
- Saved cases (the user can save a situation + its guidance and revisit it).

## Files

- `frontend/immigration.tsx` — the React page (was `pages/immigration.tsx`). Uses
  a local `api()` helper, Clerk's `useUser`, wouter's `Link`, shadcn UI, and an
  `useT`/`LanguageSwitcher` i18n setup. These imports must be repointed in the new app.
- `frontend/immigration-i18n.ts` — the immigration UI strings (en/es/zh/tl/vi)
  extracted from the Coach's shared i18n dictionary.
- `server/immigration.ts` — the Express route (forms, scenarios, updates, advise,
  cases CRUD). Was registered in the Coach's `routes/index.ts`.
- `server/immigrationData.ts` — the curated forms, fees, and scenarios.
- `db/immigration_cases.ts` — the Drizzle schema for the `immigration_cases` table.

## Dependencies it assumes

- Auth: Clerk (`requireAuth` provided a `userId`).
- AI: the Anthropic client, model id, and `checkRateLimit` (was imported from the
  Coach api-server's `lib/anthropic.ts`). The new app needs its own equivalent.
- DB: a Drizzle + Postgres setup exporting `db` and `immigrationCasesTable`.

## To run standalone

1. Create a new app (its own Vite/React frontend + Express server + Drizzle/Postgres).
2. Add Clerk auth and an Anthropic client with a rate limiter.
3. Drop these files in, repoint the imports, register the route, add the
   `immigration_cases` table to that app's schema, and merge `immigration-i18n.ts`
   into the app's i18n.

## Note on the database

Decided: the standalone app starts fresh. It gets its own database and creates
its own `immigration_cases` table from `db/immigration_cases.ts`. It does NOT
reuse or migrate any data from the Coach's database.

Because of that, the old `immigration_cases` table in the Coach's database (if it
was ever migrated) is now orphaned: the Coach no longer defines or reads it, and
no data is being preserved. It can be dropped. The next `pnpm --filter
@workspace/db run push` against the Coach DB will already detect the table as no
longer in the schema and offer to drop it.
