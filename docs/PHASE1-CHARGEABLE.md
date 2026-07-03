# Coach — Phase 1: Make It Chargeable (and Legal)

Phase 1 is the gate for a public paid launch. Do NOT charge money / collect
student (often minor) PII publicly until every item here is done.

## Audit findings (2026-07-02)

- **Payment providers are real, not stubbed.** Paynow (Zimbabwe: EcoCash /
  OneMoney / card) and Flutterwave (rest of Africa) both make genuine gateway API
  calls; Stripe is wired for card. Files: `paideia-api/src/lib/billing/`.
- **Critical risk (now fixed):** a `mock` provider auto-approves payments after
  6s, and `resolveProvider` silently fell back to it whenever live keys were
  missing — *including in production*. A real user could get Pro for free.
- **Legal pages exist**: `paideia-ren/src/pages/Privacy.tsx` + `Terms.tsx`,
  linked in the marketing footer. Need a content review + linking from inside the
  Coach app + versioning.
- **Data rights: MISSING.** There is an admin delete-user and a profile "reset",
  but no learner-facing data export and no self-service account deletion.
- **Age gate: MISSING.** Signup collects no date of birth / age / guardian.
- **PII to AI: clean.** No name/email/id is injected into any prompt; the tutor
  sends only pedagogical profile fields (goals, interests, background, level).
  The only place identity leaves the platform is to the payment processors, which
  is necessary and appropriate.

## Shipped in this batch

1. **Fail-closed payments.** `resolveProvider` now throws
   `PaymentsNotConfiguredError` in production when no live gateway is configured,
   instead of using the mock. The mobile checkout route catches it and returns a
   clean 503 ("Payments are not available yet"). A controlled production demo can
   still opt in with `BILLING_ALLOW_MOCK=true`. Dev/staging is unaffected.
2. **Defensive PII scrub.** `lib/redact.ts` strips email addresses and phone
   numbers from learner-entered free-text profile fields (background, goals,
   interests) before they reach the model. Not applied to uploaded study material
   or AI-generated content (which can legitimately contain long numbers).

## Merchant accounts — YOUR parallel track (real lead time)

Payments stay in the safe fail-closed state until these keys are set in Railway
on the **wonderful-adaptation** service. Each needs business registration / KYC:

- **Paynow (Zimbabwe)** — merchant account at paynow.co.zw → set
  `PAYNOW_INTEGRATION_ID` and `PAYNOW_INTEGRATION_KEY`.
- **Flutterwave (rest of Africa)** — account at flutterwave.com → set the
  Flutterwave secret key(s) the provider reads, plus `FLUTTERWAVE_SECRET_HASH`
  for webhook verification.
- **Stripe (card / US)** — the Stripe keys the existing stripe client + webhook
  read.

Until a gateway is configured, its country's checkout returns the 503 above.

## Data rights (shipped 2026-07-02)

New `routes/study/account.ts` (mounted at `/api/study/account`, auth-gated):

- **`GET /export`** — streams a downloadable JSON of everything held on the
  signed-in learner (account minus password hash, profile, materials, concepts,
  flashcards, practice, exams, assessments, tutor conversations + messages,
  knowledge graph, annotations, paths, activity log, notifications, payments).
- **`POST /delete`** — password-confirmed hard delete of the learner's own
  account; every `study_*` row cascades from the user row (incl. sessions). The
  password check also blocks an impersonating admin from deleting the learner.

UI: a "Privacy & Data" card on the Coach profile page (download button +
password-gated delete flow that hard-reloads to sign-in on success).

## Age gate (shipped 2026-07-02)

Signup now collects date of birth and enforces: **under-13 blocked**, **13-17
require a guardian email + consent affirmation**, **18+ proceeds**. Stored on
`study_users` (new nullable columns `date_of_birth`, `age_band`,
`guardian_email`, `guardian_consent_at`; existing accounts unaffected). Files:
`auth.ts` signup, `StudySignup.tsx`, `use-study-auth.tsx`, schema `study.ts`.

> DB MIGRATION REQUIRED before this deploys: the signup insert writes the new
> columns. Run the schema push against the production DB **before** pushing the
> code, so the columns exist first:
> `pnpm --filter @workspace/paideia-db run push` with `DATABASE_URL` set to the
> Railway public Postgres URL. The columns are nullable — additive, no data loss.
> (v1 records the guardian email + consent affirmation; double-opt-in guardian
> email verification is a later enhancement.)

## Legal pages (shipped 2026-07-02)

The existing marketing Privacy/Terms describe "Synops Teacher" (wrong product for
Coach). New Coach-specific pages were created: `StudyPrivacy.tsx` +
`StudyTerms.tsx` (routes `/study/privacy`, `/study/terms`), covering learner
accounts, minors/guardian consent, uploaded material, AI processing (with the
identifier-stripping), payment providers, and the export/delete data rights.
Linked from the signup page (consent line) and the profile "Privacy & Data" card.

> BEFORE PUBLIC LAUNCH, you must:
> - Have legal counsel review both documents (esp. minors / COPPA / GDPR).
> - Set a real, monitored contact inbox (currently `info@synops-consulting.com`
>   placeholder in both files) and a governing-law jurisdiction in the Terms.

## Payment lifecycle hardening (shipped 2026-07-02)

Audit found the lifecycle mostly built (activation, Stripe reflection, cancel,
lazy expiry in `getSubscription`, renewal reminders, refund->ambassador clawback).
Two correctness gaps fixed:

- **Expiry self-heal** (`middlewares/auth.ts` `loadTeacher`): feature gating reads
  the raw `subscriptionTier` column, but nothing flipped it back to free when a
  MOBILE-MONEY sub's period ended (no renewal webhook). Now, on any authenticated
  request, an expired + non-auto-renew subscription is downgraded to free/expired.
  Stripe auto-renew is still managed by its webhook.
- **Refund / chargeback revokes access** (`app.ts` Stripe webhook + new
  `downgradeStudyUserToFree` in billing/service): `charge.refunded` and
  `charge.dispute.created` now downgrade the learner to free (in addition to the
  existing ambassador clawback).

Verified by CI (compiles/builds). END-TO-END verification against live gateways
(activation, renewal, cancel, refund, dunning) requires real merchant keys.
Follow-up (nice-to-have): payment receipts (in-app notification / email).

## Merchant keys unblock the rest

Once `PAYNOW_*`, Flutterwave, and Stripe keys are set in Railway, tell me and I'll
run a real end-to-end payment test per gateway and confirm each lifecycle event.
