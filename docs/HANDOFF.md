# DJH pilot: design to developer handoff

Status: pilot app live on Railway; course interface designed and prototyped. This document tells a developer what to build next and where the source of truth for each decision lives.

## 0. Delivery model

Self-paced (decided 27 Sep 2026). No cohorts, weeks or deadlines. Courses are organised by units with time estimates; the place is always saved; briefs are reviewed in the order received; expert sessions are optional recordings. Invitation codes remain for institution verification only.

## 1. Where things are

| What | Where |
|---|---|
| Journeys, clickable prototype, tokens, components, specs | Design canvas "DJH Course Interface" (claude.ai artifact, private to the owner until shared) |
| Running pilot app | Railway service `djh-app`, branch `djh-app` of this repo |
| Stakeholder demo (full UI story, simulated back end) | Artifact "DJH stakeholder demo", project doc `djh-stakeholder-demo-v0.7.html` |
| Lesson content (GRN01 v1.1 draft) | `server/content/grn01.js` |
| Database schema | `sql/001_init.sql` |

Figma: no Figma connection exists yet. To move the canvas into Figma, connect the Figma connector in claude.ai and ask for an import, or export boards from the canvas Share menu. The canvas uses the same tokens as `public/css/app.css`, so code is the reference if the two ever disagree.

## 2. Canvas contents

**Page 1, user journeys** (stages x rows: doing, screen, thinking, risk, design, system)

| Board | Actor | Build status |
|---|---|---|
| J1 Request access to first sign-in | New learner | Built (register, pending, approve, sign in). MFA for staff to build |
| J2 Complete the Pillaging Case on my route | Investigation and prosecution learners | Built |
| J3 Think it through with the case guide | Any learner | Built |
| J4 Review a submitted brief | Reviewer | Designed; next to build |
| J5 Approve and support a cohort | Coordinator | Approvals built; reporting to build |
| J6 Keep my work when the connection drops | Any learner | Built |

**Page 2, course interface prototype.** Press Play on C1. Path: C1 course home, C2 checkpoint gate (topic 4), C3 source desk (topic 5), C4 brief editor with case guide (topic 12), C5 receipt (13), C6 quiz with rule not met (14), C7 completion (15), back to C1.

| Board | Purpose |
|---|---|
| C2 | Interactive: pick an answer, check, see feedback; Continue only appears when correct |
| C8 | Six case guide states: first open, AI reply, authored fallback, blocked personal data, rate limited, sending |
| C9 | Phone layout at 390 wide |
| C10 | Interactive reviewer rubric: outcome recomputes as scores change |

**Page 3, developer handoff.** H1 tokens, H2 components and states, H3 layout, accessibility and the screen to API map.

## 3. Rules that are not negotiable

1. Fictional training material only. No file upload anywhere. The guide blocks emails and phone numbers before any provider call.
2. Answer keys, feedback and the model brief stay on the server until the rules allow them.
3. "Saved" appears only after the server confirms. Failed saves keep text on screen and offer Retry. A 409 carries the current state; the client re-bases and saves again.
4. Submissions are immutable and idempotent (unique user and Idempotency-Key). The same key always returns the same receipt.
5. Pass rule for the check: at least 4 of 5 and Q5 correct. Reviewed standard met: total 8 or more of 10, safe handling 2, no zero on source use or proportionate reasoning, quiz rule met. Computed on the server.
6. Result wording: "standard met" or "not yet met". Never "certified".
7. Viewing the model brief before submitting is allowed as self-study and is recorded as model exposure, shown to reviewers.
8. Sokratify code is not reused. Patterns only.

## 4. Layout

- Single white header 64px; course tabs bar under it inside a course (Outline, Progress, Dates, Live sessions, Discussion, Case guide).
- TOC 272px on the left; main flexes; case guide 360px open or a 44px tab when closed.
- Breakpoints: 1280 and up full; 1024 to 1279 guide overlays main; 720 to 1023 TOC becomes a drawer; below 720 single column with a sticky bottom action bar and the guide as a bottom sheet.
- Prose reading width max 780px. Touch targets 44px on phones. Reflow to 320px with no horizontal scroll.

## 5. Tokens: Academy direction (chosen 27 Sep 2026; match `public/css/app.css`)

| Token | Value |
|---|---|
| page / surface | #F5F7F8 / #FFFFFF |
| ink / ink2 / muted | #15212B / #33404A / #5A6772 |
| line / input line | #DDE3E8 / #AFBAC3 |
| primary / hover / tint | #00585E / #00464B / #E7F0F0 |
| footer and dark bands | #12303A |
| highlight | #E8A317 |
| ok / warn / crit | #1E7A3E / #7A4B00 / #B3261E, with tints #E6F4EA / #FDF6E7 / #FCE8E6 |
| route: investigation / prosecution / judiciary | #0E7C70 / #A15C00 / #C2410C |
| fonts | Noto Sans (covers Ukrainian Cyrillic); Noto Sans Mono for IDs and receipts |
| shape | cards radius 8, buttons radius 6 at 44 to 46px, chips and search fully rounded |
| header | single white 64px row: logo, tabs with teal underline, language switch, account |

The Academy screens are on the canvas page "Chosen · Academy (full flow)", boards 01 to 12. Board 12 holds the tokens.

## 6. Screen to API map

| Screen | Calls | Status |
|---|---|---|
| C1 course home | GET /api/dashboard, GET /api/lessons/grn01/status | Built |
| C2 checkpoint | POST /api/lessons/grn01/check (VC01 to VC04 in order, reflection on final) | Built |
| C3 source desk | GET /api/lessons/grn01 | Built |
| C4 brief editor | PUT /api/progress/grn01 with seq | Built |
| C4 model early | GET /api/lessons/grn01/model?confirm=1 | Built |
| Case guide | GET and POST /api/chat/grn01 (20 per 10 minutes) | Built |
| C5 submit | POST /api/lessons/grn01/submissions with Idempotency-Key | Built |
| C6 quiz | POST /api/lessons/grn01/quiz | Built |
| C7 compare | GET /api/lessons/grn01/model | Built |
| C10 review | GET /api/review-queue, POST /api/submissions/:id/reviews | To build |
| Cohort reporting | GET /api/admin/cohorts/:id/status, CSV export | To build |

## 7. Next build backlog, in order

1. **Reviewer flow (J4, C10).**
   - Tables: reviews, with `met` computed in the database; and completion_records.
   - Queue scoped to assigned cohorts.
   - The learner sees the reviewed result on the dashboard.
2. **Staff MFA (J1, J4).** Use TOTP for reviewer, coordinator and admin roles.
3. **Coordinator user detail and cohort dashboard (J5).**
   - Show counts and states only, never free text.
   - Named export needs admin plus a recorded reason.
4. **Responsive player.**
   - TOC drawer below 1024px; guide bottom sheet.
   - Sticky action bar below 720px (C9).
5. **Accessibility pass against H3.** Test with axe, keyboard only, and NVDA or VoiceOver.
6. **Content lock.**
   - Replace the draft storyboard items once v1.1 is approved, then bump the lesson, rubric and key versions.
   - The recording master, speaker permission and Ukrainian captions are still outstanding.
7. **Live AI.** Add `ANTHROPIC_API_KEY` on Railway. Without it the guide runs in authored mode.

## 8. Acceptance for each screen

- Every state on H2 and C8 is reachable and has been tested.
- Keyboard-only completion of GRN01 works end to end.
- Throttle to Slow 3G and go offline mid-brief: no text is lost, and no duplicate submission is created.
- The Playwright end-to-end suite passes: register, checkpoints, blocked chat, submit with receipt, quiz fail then pass, completion, reload persistence, admin approvals, and 320px layout.
