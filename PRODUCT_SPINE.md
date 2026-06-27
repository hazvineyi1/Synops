# The Coach — Product Spine

This document states what the product is at its core, so every build decision can be checked against it. It is the single answer to "what is the spine?"

## The spine, in one line

The Coach is a conversation with a dedicated AI study coach that leads the user toward a high-stakes exam. The conversation is the product; everything else is a surface the coach can pull the user into.

## What "spine" means here

The AI coach is not a feature bolted onto a study app. It is the organizing center. The user never lands on a blank dashboard wondering what to do — they open the app and the coach is already there with a plan. Concretely, in the build this is enforced by `pages/coach.tsx`: on open with no history, the coach auto-generates the day's plan (`useDailyOpen`). Spaced repetition (SM-2, `api-server/src/lib/sm2.ts`) is the invisible engine underneath; the user experiences it as the coach knowing when to bring a concept back, never as intervals or scores.

If a proposed feature does not run through, or get initiated by, the coach conversation, it is probably off-spine.

## The three behaviors everything reduces to

1. PLAN — the coach opens each day with a rationale-backed plan, built server-side from concepts due for review, weakest concepts, exam-date pace, and what happened yesterday. The user can accept, negotiate, or defer; negotiation re-plans on the spot.
2. TEACH & TEST — for each concept the coach introduces it through a real-world scenario drawn from the learner's profile, asks the user to explain or apply it (a checkpoint), grades the typed answer 0-3 in the coach's voice, and lets that grade drive SM-2.
3. REVIEW — the coach reflects in its own voice at the end of a session and at the start of the next day, and runs a weekly retrospective generated from real data (completed plans, checkpoint grades, mastery changes, accuracy trend).

Memory is mandatory and visible: every plan references yesterday; every session references relevant history. That continuity is what makes it a coach and not a chatbot.

## The four surfaces (resist adding more)

- `/coach` — the conversation. This is 90% of the experience.
- `/material` — the library of what the user has given the coach (paste / URL / file), with mastery at a glance.
- `/progress` — a calm, honest readiness view: readiness vs. exam date, mastery distribution, de-emphasized streak, retrospective archive.
- `/settings` — coach personality, profile/exam date, billing, data export/delete, theme.

Plus `/start` (first-run assessment that recommends one of four personalities) and the marketing landing.

## Coach personalities

Four personas — Drill Sergeant, Socratic Mentor, Warm Encourager, Strategic Analyst — implemented as system-prompt layers over one shared engine. They change voice and pressure only. Accuracy, pedagogy, and memory of the user are identical across all four. Pressure is always about the goal and the calendar, never about the person's worth.

## What is NOT the spine

- A blank dashboard. The coach leads, always.
- A flashcard app with a chatbot stapled on. The conversation is the product; SM-2 is the hidden engine.
- A coach that forgets, or whose personality changes correctness.
- Gamified dopamine bait (confetti, streak animations) or generic SaaS clichés.

## Resolved: the Immigration portal was split out (2026-06-11)

The repository previously contained a second, distinct product on shared infrastructure: an informational US immigration assistant (a USCIS forms-and-fees reference, a live USCIS news/RSS feed, an AI "advise" intake with not-legal-advice disclaimers and multi-language output, and saved cases). It was reachable at `/immigration` with its own full-screen layout, not gated behind the study assessment.

That portal was off the study-coach spine, so it has been split out to keep the Coach one product with one spine. Concretely:

- Its code was moved to `separated/immigration-portal/` (frontend page, server route, curated data, the `immigration_cases` schema, and the extracted i18n strings), with a README on what it needs to run standalone. That directory is not part of the Coach workspace and is not built or typechecked.
- All wiring was removed from the Coach: the `/immigration` route and `StandaloneProtectedRoute` in `App.tsx`, the nav entries in `sidebar.tsx`/`mobile-nav.tsx`, the route registration in `api-server/src/routes/index.ts`, the schema export in `lib/db/src/schema/index.ts`, and the `imm.*`/`nav.immigration` i18n keys.

The Coach is now a single product: the conversation and its four supporting surfaces, nothing else. If the immigration product is to live on, it should be developed as its own app from the `separated/` seed (see that directory's README). Database: the standalone immigration app starts fresh — it gets its own database and table, reusing none of the Coach's data. The old `immigration_cases` table in the Coach DB (if it was migrated) is therefore orphaned and can be dropped; the next `pnpm --filter @workspace/db run push` will offer to drop it.
