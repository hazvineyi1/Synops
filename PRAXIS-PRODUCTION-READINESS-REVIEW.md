# Praxis LMS — Production-Readiness Review

**Prepared for:** Synops Consulting, ahead of first paying-partner exposure (Enza Global Media)
**Bar applied:** Tesla (integration discipline) · Amazon (reliability at scale) · NVIDIA (architectural rigor) · Midjourney (interaction polish)
**Method:** Static audit of the full codebase (backend `api-server`, frontend `praxis`, DB schema). Read-only. Four parallel deep passes: security/data-isolation, business-logic/resilience, performance/code-quality, UX/hygiene/partner-readiness.
**What this review is NOT:** a substitute for real load testing, real POPIA legal sign-off, or real Enza-learner user testing. Those gaps are flagged explicitly at the end.

---

## 1. Executive summary — top 5 risks (90-second read)

The platform is functionally rich and the *design* of its security model is sound. But it is **not ready to put in front of Enza today**, for two categories of reason: (a) fake demo data can render in the partner-facing UI, and (b) several authorization and correctness holes would fail an engineering review outright. Ranked by severity × likelihood:

1. **Fake partner data (TalentForge / MTN / Vodacom) can appear in front of Enza.** [CRITICAL · trust] The Partner Hub's Overview, Audit, and Impersonate screens still read a client-side mock, and the resolver defaults to the fake "TalentForge SA" tenant whenever the real partner isn't pre-registered — which is exactly what happens if Enza's own admin logs in, or the founder deep-links to `/partner` without visiting Platform Overview first. This is the single most likely thing to embarrass in the demo.

2. **Authorization is enforced per-route, and several routes are unguarded.** [CRITICAL · security] Any authenticated user — including a learner — can grade/approve any module submission (`PATCH /coach/submissions/:id`), rename any organization across tenants (`PATCH /organisations/:orgId`), and read/write a partner's entire financial and funding surface (billing, invoices, funding agreements, funded-seat learner PII) because those endpoints check *tenant match* but not *role*. Assume every API is called directly, bypassing the UI — several of these leak or mutate data they must not.

3. **Credentials can be forged.** [CRITICAL · trust/functional] Two independent paths: (a) when the AI grader is unavailable, free-text answers fall back to a *word-count* grade that is high enough to reach mastery and issue a real, employer-verifiable PraxisMark; (b) course/module completion is client-asserted — a learner can POST every beat id directly and reach 100% without answering anything, which also inflates the SETA/B-BBEE training-hours figure the code feeds into funded-compliance reporting.

4. **Zero automated tests over the highest-risk logic, and money/credential writes lack DB-level guardrails.** [HIGH · reliability] No unit tests on `scope.ts` / `roles.ts` (grading permissions) or `gradebookEngine` (mastery math); the Playwright suite tests Coach, not Praxis. Credential issuance, funding-cap allocation, and gradebook entries all rely on application-level check-then-insert with **no unique constraints**, so concurrency (the platform explicitly supports web + WhatsApp for the same learner) can double-issue credentials or over-allocate funded seats. `applyGrade` is not transactional.

5. **Known-CVE file-parsing dependencies on user-upload paths + seed/enrich endpoints that block the request thread.** [HIGH · security/perf] `xlsx@0.18.5` (SheetJS, prototype-pollution + ReDoS CVEs, unpatchable on npm) and `pdf-parse@1.1.1` (unmaintained) parse attacker-controlled uploads. The Enza seed/enrich endpoints run ~900 sequential DB operations inline in one HTTP request — a near-certain proxy timeout and a foot-gun if fired against a live tenant.

**Bottom line:** roughly a week of focused work closes the must-fix set. None of the criticals are architectural rewrites; they are missing guards, missing constraints, and finishing the mock→real migration that is already ~70% done.

---

## 2. Full findings table

Severity: **C**ritical / **H**igh / **M**edium / **L**ow. Type: **F**unctional / **T**rust-polish.

### Security & access control

| # | Location | Issue | Sev | Type | Fix |
|---|---|---|---|---|---|
| S1 | `routes/coach.ts:576` `PATCH /coach/submissions/:id` | `requireAuth` only — no role/scope. Any user (incl. learner) can grade/approve any submission & stamp self as coach. Feeds credentials. | C | T | Add `canGradeInCourse` scope + staff role. |
| S2 | `routes/organisations.ts:82` `PATCH /organisations/:orgId` | `requireAuth` only. Learner in partner A can rename partner B's org (cross-tenant). | C | F | Add `canAdministerOrg` + `canAccessOrg` (siblings already have it). |
| S3 | `billing.ts:16`, `funder.ts:227`, `documents.ts:16`, `delegatedAdmins.ts:15` `canManage()` | Checks tenant match, not role. Learners/coaches carry `partnerId`, so they can read/write billing, invoices (mark paid, edit amounts), funding agreements, funded-seat learner PII, contracts. | H | T | Add `requireFacilitator`/`canAdministerOrg` on top of the tenant match. |
| S4 | `organisations.ts:93` `GET /organisations/:orgId/members` | No scope — any user reads any org's full roster (name/email/role). POPIA-relevant PII enumeration. | H | F | Gate with `canAccessOrg`. |
| S5 | `coach.ts:505` `GET /coach/submissions` (legacy branch) | No staff gate — returns all learners' submitted work platform-wide. | H | F | Add staff role + course scope. |
| S6 | `coach.ts:449` `GET /coach/learners/:userId/presession` | No scope — returns any learner's sessions, pending submissions, mastery. | H | F | Scope to the coach's section/course. |
| S7 | `gradebook.ts:768` cell write; `assignments.ts:434` submissions list | Coach section-scope not enforced: a coach can grade learners in sections they don't lead (uses `canStaffActOnCourse`, not `canGradeInCourse`). | M | F | Narrow to `coFacLeadsLearnerInCourse`. |
| S8 | `app.ts:71` | `cors({ credentials: true, origin: true })` reflects any origin with credentials. | M | T | Pin `origin` to known app domains. |
| S9 | `routes/whatsapp.ts:113` | Signature validated only when Twilio configured; fail-open if env unset → spoofable inbound + LLM cost. No tight rate limit. | M | F | Fail closed; add a per-endpoint limiter. |
| S10 | `lib/enzaCohortSeed.ts:57` | Hardcoded seeded learner password `Enzatest123` on a live partner. | M | T | Randomize per-seed; rotate before launch. |
| S11 | `app.ts:38` | AI-cost paths (assignment submit → AI grade, case SSE, WhatsApp webhook) only under the 1000/min backstop; no per-user throttle. | M | F | Add per-user limits on AI endpoints. |
| S12 | `platform.ts:145` impersonation | Time-boxed (1h) + audited + token-restore (good), but the impersonated user is **not notified** and gives no consent. | L | T | Notify + record consent (POPIA). |
| S13 | `partners.ts:17` `deletePartnerCascade` | Hard-delete, hand-maintained `DELETE` list, each `try/catch{}` silently skipping failures; no FK constraints. New child tables orphan silently. Delete semantics vary (some soft, some hard). | M | F | Consolidate on soft-delete or add FKs; test the cascade. |

### Business logic & resilience

| # | Location | Issue | Sev | Type | Fix |
|---|---|---|---|---|---|
| B1 | `lib/socraticEngine.ts:292` | AI-grader outage → free-text graded by word count (`>25 words → grade 2`), which reaches mastery ≥0.8 and issues a real credential. | C | F | Cap fallback grade below mastery threshold, or refuse to certify on grader failure. |
| B2 | `routes/progress.ts:37` `POST /progress/beat`; `ModuleViewer.tsx:991` | Completion client-asserted: any enrolled learner can POST every beat id → 100%, satisfy the next-module gate, and inflate SETA/B-BBEE hours. Quiz answers never sent to server. | H | F | Server-validate required quiz/interaction beats before counting them. |
| B3 | `lib/mastery.ts:167`; `schema/credentials.ts` | No unique constraint on `credentials(userId, moduleId)`; concurrent web+WhatsApp mastery → duplicate credentials. Swallowed insert error can also leave `mastered` with no credential and never retry. | H | F | Add partial unique index; handle insert failure. |
| B4 | `routes/funder.ts:357`; `schema/funded_seat_assignments.ts` | Funding-cap check-then-insert with no lock/constraint → concurrent inserts over-allocate seats and double-count a learner. Corrupts funder utilisation. | H | F | Unique `(agreementId,learnerId)`; enforce cap in a transaction. |
| B5 | `routes/assignments.ts:56` `applyGrade` | Four sequential writes, not transactional → score written but gradebook entry missing on partial failure (self-heals later, but window is real). | M | F | Wrap in `db.transaction`; add unique `gradebook_entries(assignmentId,userId)`. |
| B6 | `routes/funder.ts:84`, `reports.ts:46` funder report | Counts credentials with no `valid` filter and no dedup; ignores `funder_scopes.courseId` → two funders each see whole-org totals (mis-attribution). `reports.ts:82` returns **hardcoded** competency scores in a partner-facing report. | M | T | Filter to valid, honour course scope, dedup; replace hardcoded data with real. |
| B7 | `lib/gradebookEngine.ts:460` `evaluateOffTrack` | A learner who never engages reads **on_track**; no "completed-instantly / cheating" signal. | M | F | Add a no-engagement + suspicious-speed signal. |
| B8 | `progress.ts:160` `maybeCompleteEnrolment` | Never un-sets `completed` if content grows → a "completed" record can silently become inaccurate. | L | F | Re-evaluate on content change. |
| B9 | `gradebookAlerts.ts:183` | Off-track email/WhatsApp result ignored inside swallowing try/catch → transient failure drops the coach/learner alert forever. No retry/DLQ. | M | F | Retry or persist a queue; log failures. |

**Confirmed-good (keep):** integer money math throughout (no float bugs); game auto-grading is fully server-side and un-spoofable; the Socratic mastery path *is* transactional; withdrawn/waitlisted learners are correctly blocked from progress/submission; `avgMastery` source is consistent; role is read fresh from the DB every request (a demoted coach loses access on the next request — no cache TTL window).

### Performance & code quality

| # | Location | Issue | Sev | Type | Fix |
|---|---|---|---|---|---|
| P1 | (whole repo) | **No automated tests** over `scope.ts`/`roles.ts`/`gradebookEngine`; the only e2e suite tests Coach, not Praxis. | H | F | Unit-test permission + gradebook logic; add a Praxis e2e path. |
| P2 | `lib/enzaEnrich.ts:333` + seed endpoints | ~900 sequential DB ops inline in one HTTP request (15 courses × modules × ~12 writes) → proxy timeout; blocks the thread. | H | F | Move to a background worker / return 202 + poll. |
| P3 | `gradebook.ts:557` `/gradebook/mine` | Per-course serial loop (reconcile + columns + scores) → ~150 round-trips for 15 courses. | H | F | Batch across courseIds / `Promise.all`. |
| P4 | `coach.ts:405` `/coach/learners` | 2 queries per learner; for super_admin the learner set is the whole platform (unbounded). | H | F | Batch with `inArray`; paginate. |
| P5 | `platform.ts:585` `/platform/alerts`, `:547` `/platform/financials` | 7 full-table `SELECT`s then `.filter()` in JS; per-partner `filter` inside `map` (O(partners×invoices)). | H | F | Use SQL `count(...) WHERE` (as `/platform/overview` already does). |
| P6 | `partners.ts:214`, `organisations.ts:93`, gradebook nav | Rosters/alerts returned with no `LIMIT`/pagination — grow unbounded with tenant size. | M | F | Add cursor pagination. |
| P7 | `package.json` (api-server) | `xlsx@0.18.5` (CVE-2023-30533, CVE-2024-22363, unpatchable on npm) and `pdf-parse@1.1.1` (unmaintained) parse **uploaded** files. | H | F | Migrate to SheetJS CDN build / `exceljs`; replace pdf-parse with `pdfjs-dist`/`unpdf`. |
| P8 | `app.ts:34` | In-process rate-limit store — per-instance under horizontal scaling (code comment already notes this). | M | F | Redis store before scaling out. |
| P9 | `partners.ts`, `platform.ts`, `analytics.ts` | Literal role strings + duplicated `role!=="super_admin" && partnerId!==…` check copy-pasted 6×; `"leader"/"member"` group roles have no constant. | M | F | Centralize as a `requirePartnerScope` helper + `GROUP_ROLE` constant. |
| P10 | `package.json` | `@clerk/express`/`@clerk/shared` still present though "Clerk is gone" — dead attack surface. | L | T | Remove. |

### UX, hygiene & partner readiness

| # | Location | Issue | Sev | Type | Fix |
|---|---|---|---|---|---|
| U1 | `PartnerOverview.tsx:14`, `PartnerOrgHub.tsx:24` (sidebar name), `PartnerAudit.tsx:12`, `PartnerImpersonateView.tsx:14`; resolver `partnerHubData.ts:261` (`return TALENTFORGE`) | Fake TalentForge/MTN/Vodacom data renders for Enza admin or a deep-link to `/partner`; fabricated audit incl. fake impersonation events. | C | T | Finish mock→real (as `PartnerOrganisations`/`PlatformOverview` already are); change fallback to an empty correctly-named hub; drop TalentForge/SkillBridge from `HUBS`. |
| U2 | `App.tsx` (no `ErrorBoundary` anywhere) | A render throw = blank white screen in production (high risk on low-end Android with unexpected data shapes). | H | T | Wrap `<Routes/>` in an error boundary. |
| U3 | `PartnerPartners.tsx:11`, `LearningHub.tsx:14` | `allPartners()` lists only the fake TalentForge/SkillBridge as the platform's partners. | H | T | Back with real `/partners`. |
| U4 | `Reports.tsx:100`, `PartnerClassDetail.tsx:128` | "Generated via Synops Praxis" printed on exported reports; "on Synops Praxis" in the WhatsApp learner invite — base brand leaks past white-label. | M | T | Route through tenant brand. |
| U5 | `enzaCohortSeed.ts:58` | Learner logins are `enza@student1.test … @student4.test` — obviously fake if the login/account list is shown. | M | T | Reseed on a plausible domain (e.g. `@learner.enzaglobalmedia.co.za`). |
| U6 | `Dashboard.tsx:167` `CoachDashboard` | Hardcoded fake stats (24 learners / 7 pending / 82%). | M | T | Wire to real data. |
| U7 | `CourseGradebook.tsx:342`, `MyGrades.tsx`, `CoachLearners.tsx`, `CoachHub.tsx:213`, `CoachingHealth.tsx:93` | Red used for off-track / needs-support / "gaps" / capacity — spec reserves red for genuine errors (should be coral/amber). Consistent but off-spec. | M | T | Switch to coral/amber, or formally amend the spec. |
| U8 | icon-only buttons (`CourseDetail`, `Compliance`, `Delivery`, `AdminFunders`) | Rely on `title=` not `aria-label`; weak accessible name. | L | T | Add `aria-label`. |
| U9 | `lib/platformFilingStore.ts` | Dead mock module (fake partnership agreements) — no importers, but wire-able by accident. | L | T | Delete. |

**Confirmed-good (keep):** all 7 roles route to a role-appropriate home screen (no blank/404/wrong-role); custom branded 404 page present; `index.html` title/favicon/meta correct (not framework defaults); wide tables wrapped in `overflow-x-auto` with sticky name columns; learner screens are responsive; only 3 `console.error` (no stray logs); `SignIn`/`Verify`/`JoinCohort` correctly brand-resolve.

---

## 3. Prioritized remediation plan

### A. MUST FIX before this reaches Enza (visible embarrassment or security/compliance exposure)
1. **U1/U3 — Kill the fake-data fallback.** Finish `PartnerOverview`, `PartnerOrgHub` (sidebar/audit/impersonate), `PartnerPartners`, `LearningHub` onto real endpoints; change `getPartnerHub`'s `return TALENTFORGE` fallback to an empty correctly-named hub and remove TalentForge/SkillBridge from `HUBS`/`allPartners()`. *(This is the #1 demo risk.)*
2. **S1, S2 — Close the two unguarded mutators** (`PATCH /coach/submissions/:id`, `PATCH /organisations/:orgId`).
3. **S3, S4, S5, S6 — Add role/scope gates** to the financial/funder/documents/delegated-admin routes and the two unscoped learner-data reads.
4. **B1 — Cap the AI-grader fallback** so an outage can't mint a credential.
5. **B2 — Server-validate completion** for required quiz/interaction beats (it feeds funded-compliance hours).
6. **U2 — Add a React error boundary** (no white screens live).
7. **U4, U5, U6 — Remove visible fakery**: brand leaks on reports + WhatsApp invite, `.test` logins, hardcoded CoachDashboard stats, and `reports.ts` hardcoded competency scores (B6).
8. **P2 — Make the seed/enrich endpoints safe** (background/async, or at least confirm they're never reachable during a live demo) — they now sit behind the gated Internal Tools panel, which helps.

### B. SHOULD FIX before general production launch
- **S3/S7 section-scope** narrowing on gradebook writes; **S8** CORS pinning; **S9** WhatsApp fail-closed + limiter; **S10** rotate seeded password; **S11** AI-path rate limits.
- **B3, B4, B5** — unique constraints on credentials, funded-seat assignments, gradebook entries; transactional `applyGrade`.
- **B6** funder-report scoping/dedup; **B9** alert delivery retry/DLQ.
- **P1** — unit tests on `scope.ts`/`roles.ts`/`gradebookEngine` + a Praxis e2e (a coach can grade their section, is 403'd outside it).
- **P3, P4, P5, P6** — the N+1 and full-table-scan dashboards + roster pagination.
- **P7** — replace `xlsx`/`pdf-parse` on upload paths (CVE exposure).
- **U7** color-grammar reconciliation.

### C. Tracked as tech debt (acceptable to ship with, fix on a schedule)
- **P8** Redis rate-limit store (only bites under horizontal scaling); **P9** centralize duplicated permission checks + role-string constants; **P10** remove Clerk deps; **U8** `aria-label` sweep; **U9** delete `platformFilingStore.ts`; **S13** unify delete semantics / add FKs; **B7** off-track no-engagement signal; **B8** un-complete on content growth; **S12** impersonation notify.

---

## 4. Verdict

**At the stated bar, no — this platform is not ready to be shown to Enza today.** It clears Amazon-style permission *freshness* (role is never cached) and NVIDIA-style money correctness (integer math, server-side auto-grading, a transactional mastery path), and the surface polish is largely there (branded 404, responsive tables, correct favicon/meta). But it fails the Tesla "nothing half-finished ships" test on two fronts that a first-time reviewer would catch in minutes: **fake TalentForge/MTN/Vodacom data can render in the partner UI**, and **authorization is enforced route-by-route with several routes left unguarded** (a learner can grade their own work and touch a partner's financials via direct API calls). The single biggest blocker is #1 — the mock-data fallback — because it is both the most likely to appear in the live demo and the cheapest to fix (the migration is already ~70% done). Close the Section A list — realistically a week — and it reaches "safe to demo to a friendly partner." "Safe for paying production at scale" additionally requires the Section B constraints, tests, and the CVE dependency swaps.

---

## 5. Cannot be verified from code/design alone — needs real confirmation

- **Real load / low-bandwidth behavior (Build spec §10.5).** This review found the *structural* risks (unbounded queries, full-table-scan dashboards, ~900-op inline seeds, in-process rate limiting), but the actual page-load numbers on a throttled township/rural connection, and the breakpoint under concurrent traffic, require real load testing and a real device on a real network. **To close:** run k6/Artillery against a staging tenant with production-shaped data, and test the learner flow on a low-end Android over a throttled 3G profile — report numbers, not assumptions.
- **POPIA legal sign-off.** Several items are marked "NEEDS SIGN-OFF" in the source specs and must NOT be treated as resolved because the code handles them technically. Specifically: reads of learner data are **not** audited (only mutations); WhatsApp coaching content is persisted verbatim with **no retention/erasure policy**; there is **no general consent record and no right-to-erasure endpoint**; impersonation is silent (no notice/consent). **To close:** a data-flow map + retention/erasure policy + consent capture reviewed and signed by a POPIA-qualified advisor.
- **Real user testing with actual Enza learners.** Adaptive routing, the interactive-video experience, and the WhatsApp coaching hand-off can be validated for *correctness* here but not for *comprehension/usability* with the target population. **To close:** moderated sessions with a pilot BizAscend cohort before wider rollout.
