---
name: Praxis mastery / credential invariants
description: Rules that keep the Socratic mastery→credential pipeline trustworthy and the coach plan startable
---

# Mastery & credential pipeline

- **A checkpoint is one transaction.** Grading (an AI call) happens first, outside the tx; all state writes (concept mastery upsert, session update, evidence insert, credential issue) run inside a single `db.transaction`. **Why:** a partial failure otherwise leaves mastery, evidence, and credentials inconsistent, and web + WhatsApp can both grade the same session.
- **Concept mastery is upserted, never blind-inserted.** Use `onConflictDoUpdate` on the unique `(userId, moduleId)` pair, and lock the existing row with `.for("update")` inside the tx. **Why:** concurrent checkpoints (web + WhatsApp, retries, duplicate posts) otherwise cause unique-conflict errors or lost updates.
- **Credentials record post-update values and are idempotent.** Issue with the freshly computed mastery + exchange count (not the pre-update `session` snapshot), and skip issuance if the learner already holds a `valid` credential for that module. **Why:** using the stale session object stored wrong scores; non-idempotent issue produced duplicate PraxisMarks.
- **Mastery gate needs BOTH signals:** moving-average mastery ≥ 0.8 AND a genuine grade-3 checkpoint. One lucky answer must not certify.

# Enrolment gating must stay in lockstep with the plan

- Session creation (`POST /sessions`) requires the module to be `published` AND the learner to have an `active` enrolment in its course. The coach plan (`buildPlanItems`) selects modules from the SAME source (active enrolments + published modules). **Why:** if these two ever diverge, the plan surfaces items that 403 when tapped — un-startable. Change them together.
- Session reads (`GET /sessions/:id`, `/progress`) enforce `session.userId === req.userId` (return 404, not 403, to avoid leaking existence).

# WhatsApp webhook trust

- `/whatsapp/webhook` verifies `X-Twilio-Signature` ONLY when Twilio is configured (auth token present); unconfigured = dev, replies TwiML unsigned. When configured, an invalid signature is 403. Reconstruct the signed URL from `x-forwarded-proto`/`x-forwarded-host` (behind Replit's proxy) or override with `TWILIO_WEBHOOK_URL`.
- `/whatsapp/test-send` is blocked in production for non-admins (Twilio spend abuse).

# Testing gotcha

- `GET /api/dev/seed-users` orders by role, not id; within a role the first row is unstable and may be an enrolment-less fixture learner. For enrolment-dependent tests impersonate a specific id (e.g. `user_l10`, who has active enrolments), not `results[0]`.
