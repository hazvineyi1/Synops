# Synops Praxis — Buildable Product Specification
**Version 1.0 · July 2026**

---

## 1. Core Architecture

### 1.1 System Topology

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React 18 / Vite / Tailwind)                        │
│  • Wouter SPA routing                                        │
│  • TanStack Query (cache + optimistic updates)               │
│  • Clerk React SDK (auth state)                              │
│  • Service Worker (Phase 2 — offline queue)                  │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS / JSON
┌────────────────────▼────────────────────────────────────────┐
│  API Server (Express 5 / Node.js)                           │
│  • Clerk Express middleware (JWT verification)               │
│  • Drizzle ORM → PostgreSQL                                 │
│  • Zod request validation                                    │
│  • Pino structured logging                                   │
│  • Anthropic Claude SDK (Socratic engine, Studio AI)        │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│  PostgreSQL (Replit managed, Phase 1)                        │
│  → Self-hosted / Neon / Supabase (Phase 2+)                 │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 LMS Engine — Canonical Data Model

| Entity | Key columns | Notes |
|---|---|---|
| `users` | id, email, role, externalId (Clerk) | Roles: `learner`, `coach`, `org_admin`, `partner_admin`, `super_admin` |
| `courses` | id, title, slug, status, partnerId | status: `draft` → `published` → `archived` |
| `modules` | id, courseId, title, order, status | — |
| `beats` | id, moduleId, type, order, narration, visualData (JSONB) | Content atoms. Types: `title_card`, `points`, `scenario`, `compare`, `video`, `close` |
| `sessions` | id, userId, moduleId, status | One active session per user per module |
| `sessionMessages` | id, sessionId, role (`user`\|`assistant`), content | Full Socratic dialogue log |
| `assessments` | id, moduleId, title, status | — |
| `questions` | id, assessmentId, stem, options (JSONB), difficulty | `difficulty`: 1–5 |
| `attempts` | id, userId, assessmentId, status, score | — |
| `assignments` | id, courseId, title, criteria, submissionType, dueAt | submissionType: `essay`, `reflection`, `case_study`, `quiz`, `discussion`, `file_upload`, `peer_review` |
| `submissions` | id, userId, assignmentId, body, url, status, score | status: `draft` → `submitted` → `graded` |
| `enrolments` | id, userId, courseId, status, completedAt | — |
| `credentials` | id, userId, courseId, type, issuedAt, metadata (JSONB) | W3C VC-compatible metadata field |

**Beat `visualData` JSONB schema** (what determines which viewer renders):
```jsonc
{
  "quiz": { "question": "...", "options": ["A","B","C"], "correct": 0 },
  "interactive": {
    "type": "drag_order" | "match_pairs" | "fill_blank",
    "items": [...],        // drag_order / fill_blank
    "pairs": [...]         // match_pairs
  }
}
```

### 1.3 Content Delivery

**Beat rendering pipeline** (client-side, `ModuleViewer.tsx`):

```
allBeats (API)
  → filter by ?mode= param
      • (none)        → all beats → narrative reader
      • video         → beats with videoUrl
      • quiz          → beats with visualData.quiz
      • interactive   → beats with visualData.interactive
      • final_test    → assessment attempt flow
  → BeatRenderer decides component per beat:
      InteractiveBeat > QuizBeat > VideoBeat > NarrativeBeat
```

**Tradeoff — beat-level granularity vs. upload simplicity:**
Beats are stored individually in Postgres (not as monolithic JSON documents). This enables per-beat analytics and adaptive resequencing (Phase 2) but means Studio authoring must save beat-by-beat rather than exporting a single file. Authoring complexity is the cost.

### 1.4 Offline Sync Logic (Phase 2 — not yet built)

**Decision: offline-first for learner consumption; online-required for Socratic sessions.**

Socratic sessions require live LLM calls — they cannot be meaningfully pre-cached. All other learner content (beats, assignments, previous session replays) can be cached.

**Implementation target (Phase 2):**

1. **Service Worker** (Workbox `GenerateSW` strategy):
   - `CacheFirst` for beat content, video segments, images
   - `NetworkFirst` with stale fallback for course/module metadata
   - `NetworkOnly` for `/sessions/*` (Socratic), `/submissions`, `/grades`

2. **IndexedDB sync queue** (via `idb-keyval` or Dexie):
   - Writes that fail offline (submission drafts, progress ticks) enqueue to `sync_queue`
   - Background Sync API fires `sync` event on reconnect → drains queue → POST to API
   - Each queued item carries a `clientId`, `timestamp`, and `idempotencyKey` (UUID)

3. **Conflict resolution**: Last-write-wins on draft submissions. Session progress is append-only (never destructive), so no conflict is possible.

**Tradeoff — offline-first vs. real-time analytics:**
Offline caching means progress events may arrive seconds to minutes late. Analytics dashboards (coach, org_admin) must display "as of last sync" timestamps and treat recent data as eventually consistent, not real-time. Do not build dashboards that imply live accuracy if Phase 2 offline is enabled.

---

## 2. Learner-Facing Feature Set

### 2.1 Adaptive Pathways

**Phase 1 (built): Linear with mode selection.**
Each module presents a 6-tile hub. Learner chooses mode (Video, Reading, Interactive, Quiz, Final Test, Assignment). No forced sequencing within a module; each mode is independently accessible.

**Phase 2: Competency-gated progression.**

Algorithm (to build):
```
GIVEN  a learner's mastery scores per competency (0.0–1.0)
       pulled from GET /learn/mastery → { competencyId, score }[]
WHEN   learner opens a module
THEN   tiles are sorted: weakest-competency-aligned tiles appear first
       tiles with score ≥ 0.8 show a ✓ badge (mastered, but accessible)
       a module is "complete" when Final Test score ≥ pass threshold (coach-configurable, default 70%)
```

**Phase 3: AI-generated micro-paths.**
If a learner scores < 40% on Final Test, the Socratic engine generates a 3-beat remediation sequence targeting the specific failed questions (identified by question `competencyTag` field — add this to `questions` schema in Phase 3).

### 2.2 Socratic / Reflective Assessment Options

**Current engine** (`POST /sessions/:id/respond`):
1. Loads all beats for the module as context
2. Sends `systemPrompt` (Socratic facilitator persona) + full message history to Claude
3. Streams response back (currently non-streaming; upgrade to SSE in Phase 2)
4. Saves assistant message to `sessionMessages`

**Assessment modes available now:**

| Mode | Mechanism | Grading |
|---|---|---|
| Quiz beat | MCQ in JSONB, client-scored | Immediate, automatic |
| Interactive beat | Drag-order / match-pairs / fill-blank, client-scored | Immediate, automatic |
| Final Test | `assessments` + `attempts` tables | Auto (MCQ) or coach-graded |
| Assignment — Essay | Free text → `submissions.body` | Coach-graded |
| Assignment — Reflection | Prompt-by-prompt JSON → `submissions.body` | Coach-graded (rubric in `assignments.criteria`) |
| Assignment — Case Study | Section-structured JSON | Coach-graded |
| Assignment — Quiz | MCQ JSON, client-scored, result saved | Auto |
| Assignment — Discussion | Free text | Coach-moderated |
| Assignment — File upload | URL stored in `submissions.url` | Coach-graded |

**Reflective prompt design rule:** Reflection assignments store their prompt sequence in `assignments.instructions` as:
```json
{ "__type": "reflection", "prompts": ["What did you notice?", "..."] }
```
Parse at render time; no schema migration needed.

**Tradeoff — LLM grading vs. human grading:**
Claude can auto-assess free-text responses against a rubric (add `POST /submissions/:id/ai-grade` in Phase 2). This reduces coach load but introduces hallucination risk on edge cases. Recommendation: use AI grading as a *suggested score with rationale* that the coach can accept or override. Never auto-publish an AI grade without coach confirmation in Phase 1 or 2.

### 2.3 Progress Visualisation

**Currently built:** mastery radar (`GET /learn/mastery`), activity heatmap (`GET /analytics/activity`), competency breakdown.

**Missing for MVP completion:**
- Module-level progress bar (beats viewed / total beats) — needs a `beatProgress` table (userId, beatId, viewedAt)
- Course completion % on learner dashboard
- Streak tracker (consecutive active days)

**Recommended `beatProgress` schema addition:**
```sql
CREATE TABLE beat_progress (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id),
  beat_id     TEXT NOT NULL REFERENCES beats(id),
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, beat_id)
);
```
The `UNIQUE` constraint makes progress marking idempotent — safe to call on every beat render without double-counting.

---

## 3. Admin / Employer Dashboard Requirements

### 3.1 Role Hierarchy and Data Scope

```
super_admin (platform owner)
  │  • Provisions and removes partner tenants
  │  • Configures white-label branding per partner (logo, colours, display name)
  │  • Manages platform-level settings
  │
  └─ partner_admin
       │  • Manages their organisations and course catalog
       │  • Runs Studio (AI content authoring)
       │  • Does NOT control branding (super_admin sets it at provisioning)
       │
       └─ org_admin
            │  • Invites users into the organisation by email
            │  • Assigns and changes roles (learner / coach / org_admin)
            │  • Removes members
            │  • Views workforce enrolments and reports
            │
            └─ coach → sees their assigned learners, submissions, sessions
                 └─ learner → self-enrols or is enrolled by org_admin
```

Every API query MUST filter by `partnerId` / `orgId` derived from the authenticated user's role. No cross-tenant data leakage is acceptable.

### 3.2 White-Label Architecture

White-labelling is controlled **exclusively at the `super_admin` / platform level**, not by partner admins.

**Flow:**
1. `super_admin` provisions a partner tenant via `POST /partners` (name, slug, contact email)
2. `super_admin` opens "Configure" on that partner row → sets display name, logo URL, primary colour, accent colour
3. Config is stored against the partner record and served to learners via `GET /brand/partner/:partnerId`
4. The frontend reads partner branding at boot (derived from the tenant slug in the URL or the user's `partnerId`)
5. `partner_admin` sees the result but cannot change it — the "Brand Theme" nav item is removed from their sidebar

**What partner_admin controls:** course catalog, Studio authoring, org management within their tenant.
**What super_admin controls:** tenant existence, branding, platform settings.

### 3.2 Employer (org_admin) Dashboard — Required Screens

| Screen | Data source | Key metrics |
|---|---|---|
| Workforce Overview | `enrolments` + `users` | Total enrolled, active (last 7d), completed, dropped |
| Course Completion | `enrolments` grouped by courseId | % complete per course; export to CSV |
| Competency Heat Map | `attempts` + `questions.competencyTag` | Org-wide weak spots by competency |
| Learner Drill-Down | Per-user: sessions, submissions, mastery scores | Coach-assigned flag |
| Submission Queue | `submissions` WHERE status = 'submitted' | Grading backlog; filter by course/coach |

### 3.3 Coach Dashboard — Required Screens

| Screen | Already built | Gap |
|---|---|---|
| Learner list with last-active | ✓ `CoachHome.tsx` | Add mastery score column |
| Submission review + grading | ✓ `CoachSubmissions.tsx` | Add rubric-aligned score input |
| Session replay | Partial (messages table exists) | Need read-only session log UI |
| Announcements | ✓ | — |

### 3.4 Partner Admin — Studio Requirements

**Current Studio capability:** AI script generation → beat sequence → publish.

**Gaps for full authoring:**
1. Interactive beat authoring (drag-order, match-pairs, fill-blank question builder) — not yet in Studio UI
2. Structured assignment config builder (reflection prompts, case study sections, quiz questions as JSON) — not yet in Studio UI
3. Video upload → store URL in `beats.videoUrl` — not yet wired to object storage

**Technical approach for Studio gaps:**
- Interactive beat builder: add `InteractiveBeatEditor` component in `StudioEdit.tsx` that writes to `beat.visualData.interactive`
- Assignment config builder: JSON form wizard that writes `__type`-prefixed JSON to `assignments.instructions`
- Video: integrate Replit Object Storage (or S3-compatible) → upload returns URL → store in `beats.videoUrl`

---

## 4. Accessibility — WCAG 2.1 AA + Section 508

### 4.1 Current State

**Already present:**
- `role="alert"`, `role="region"`, `role="group"` on key containers (via Radix UI primitives)
- `aria-label`, `aria-current="page"`, `aria-disabled`, `aria-hidden`, `aria-selected` in nav/breadcrumb/carousel
- `.sr-only` utility class applied to screen-reader labels

**Gaps (must fix before any public release):**

| Requirement | Gap | Fix |
|---|---|---|
| Colour contrast ≥ 4.5:1 (AA) | Muted foreground text on card backgrounds not audited | Run axe-core or Lighthouse in CI; fix any < 4.5:1 pairs in `index.css` |
| Focus visible (2.4.7) | No `:focus-visible` ring on custom buttons (e.g., hub tiles, pill buttons) | Add `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` to every interactive element |
| Keyboard navigation for drag-to-order | Currently mouse/touch only | Provide keyboard alternative: arrow keys to move selected item up/down |
| Interactive beat — match pairs | Currently tap-only | Keyboard: Tab to focus concept, Enter to select, Tab to focus definition, Enter to confirm pair |
| Skip-to-content link | Missing | Add `<a href="#main-content" class="sr-only focus:not-sr-only">Skip to main content</a>` as first child of `<body>` |
| Page `<title>` updates on route change | Not confirmed | Set `document.title` in each page component or via a `useTitle` hook |
| Form error association | Not confirmed on all forms | Every `<input>` error message must have `aria-describedby` pointing to the error `<span id>` |
| Session dialogue (Socratic) | No live region | Wrap assistant messages in `<div aria-live="polite" aria-atomic="false">` so screen readers announce new AI responses |
| Video beats | No captions/transcript | Require caption file (VTT) alongside every video URL in Studio; render `<track kind="captions">` |

### 4.2 Section 508 Specifics

508 largely mirrors WCAG 2.1 AA for web software. Additional requirements relevant to this product:

- **1194.22(a)**: All non-text content needs text equivalents → ensure beat images have `alt` text stored in `beats.visualData.alt`
- **1194.22(d)**: Documents readable without associated style sheet → not practically enforced for SPAs but ensure core content is in the DOM, not injected by CSS pseudo-elements
- **1194.22(p)**: Time-limited responses must be adjustable → if any session timeout is implemented, provide a warning with extension option
- **1194.22(n)**: Electronic forms must allow completion with assistive technology → all assignment submission forms must meet this; currently partial

### 4.3 Implementation Priority Order

1. Focus rings (one Tailwind change, high impact)
2. Skip link
3. `aria-live` for Socratic output
4. Keyboard alternatives for interactive beats
5. Colour contrast audit
6. Form error association
7. Video captions

---

## 5. Monetisation & Partnership Model (B-BBEE-Aligned)

### 5.1 B-BBEE Alignment Context

South African B-BBEE Codes of Good Practice score entities on Skills Development (15 points, Pillar 5). Training spend on Black employees, learnership completion, and accredited programmes directly affects an employer's B-BBEE scorecard. Synops Praxis can position as **evidence infrastructure** — the platform that generates the compliance documentation employers already need.

### 5.2 Revenue Streams

| Stream | Mechanism | Who pays | When |
|---|---|---|---|
| **Employer SaaS** | Per-seat monthly license (R180–R350/seat/month) | org_admin / employer | Primary revenue |
| **Partner white-label** | Partner license fee + revenue share on employer contracts | Training provider (partner_admin) | Secondary |
| **SETA-accredited content packs** | One-time content license or rev-share | Employer or SETA directly | Phase 2 |
| **B-BBEE scorecard reports** | Premium add-on: auto-generated ATR/WSP-ready reports | Employer (HR/L&D) | Phase 2 |
| **Coaching hours marketplace** | Platform takes 15% of coach-learner session fees | Coaches | Phase 3 |

### 5.3 B-BBEE-Specific Product Features Required

| Feature | Why required | Built? |
|---|---|---|
| Learner demographic capture (race, gender, disability) | Mandatory for ATR/WSP submissions | No — add to `users` schema as optional, consented fields |
| Training hours logging (per learner, per course) | Skills Development scorecard proof | Partial — `sessions` table has timestamps; need duration calc |
| Certificate/credential issuance | Proof of completion | Partial — `credentials` table exists; PDF export not built |
| ATR/WSP report export | Submitted annually to SETA | Not built — Phase 2 |
| SAQA alignment tagging | Links courses to registered unit standards | Not built — add `saqa_unit_standard` field to `courses` |

### 5.4 Partnership Go-to-Market Structure

```
Synops (platform owner)
  ├── Training providers (partner_admins)
  │     • Accredited content on the platform
  │     • White-label the learner UI with their brand
  │     • Sell to their existing employer clients
  │     • Revenue: 70% to partner, 30% to Synops
  │
  └── Employers (org_admins)
        • Buy seats directly or via training provider
        • Get compliance reporting as core value
        • Pay per active learner per month
```

**Tradeoff — white-label depth vs. support cost:**
Full white-label (custom domain, logo, colours) is already partially built (`PartnerTheme`). Each white-label instance increases support surface. Limit Phase 1 white-label to logo + colour palette only. Custom domain via CNAME is Phase 2.

### 5.5 Pricing Rationale

| Tier | Seats | Price/seat/month | Target |
|---|---|---|---|
| Starter | 1–50 | R350 | SMMEs, training providers |
| Growth | 51–500 | R250 | Mid-market employers |
| Enterprise | 500+ | R180 (negotiated) | Corporates, SETAs |

Minimum viable contract: R5 250/month (15 seats × R350). This covers infrastructure costs at Phase 1 volume.

---

## 6. Phased Roadmap

### Phase 1 — MVP (0–4 months)

**Scope: A working, deployable product for a single partner with ≤ 200 learners.**

**What's in:**
- [x] Multi-role auth (Clerk) — super_admin, partner_admin, coach, learner
- [x] Course/module/beat content model + Studio AI script generation
- [x] Module Hub (6-tile mode picker)
- [x] Beat rendering: narrative, video, quiz, interactive (drag-order, match-pairs, fill-blank)
- [x] Socratic LLM session (Claude)
- [x] Assignment submission (6 types)
- [x] Coach grading queue
- [x] Credentials table
- [x] Partner theme (logo, colours)
- [x] Mobile bottom nav + full-screen menu drawer
- [ ] Beat progress tracking (`beatProgress` table + API)
- [ ] Course completion % on dashboard
- [ ] Skip link + focus rings (accessibility baseline)
- [ ] `aria-live` on Socratic output
- [ ] Interactive beat Studio editor (drag-order, match-pairs, fill-blank authoring)
- [ ] Structured assignment config builder in Studio
- [ ] Credential PDF export (simple template)
- [ ] Basic org_admin workforce overview (enrolments + completion %)

**What's cut from MVP and why:**

| Cut item | Why cut |
|---|---|
| Offline sync / Service Worker | Requires Service Worker + IndexedDB architecture. No evidence current learner base needs offline. Revisit when pilot data shows connectivity drop-off. |
| ATR/WSP report export | Requires demographic data collection and report template design. Too much scope; B-BBEE reports needed by employers, not learners. Phase 2. |
| Learner demographic fields | Requires consented data collection UI + privacy policy. Legal review needed before collecting. Phase 2. |
| AI auto-grading | Hallucination risk without coach oversight workflow in place. Phase 2. |
| Peer review submission type | Requires matching logic and peer notification system. Phase 2. |
| Video upload to object storage | Need to select and integrate storage provider. Short-term workaround: coaches paste video URL into Studio. Phase 2. |
| SAQA unit standard tagging | Requires SAQA dataset integration. Phase 2. |
| Custom domain CNAME | DevOps scope beyond Phase 1. Phase 2. |
| Coaching marketplace (payment) | Payment gateway integration (Peach Payments / Stripe) is significant scope. Phase 3. |
| Adaptive resequencing (AI pathway) | Needs `competencyTag` on questions + mastery threshold logic + remediation beat generation. Phase 3. |

**Phase 1 exit criteria:**
- One partner with ≥ 1 live course, ≥ 10 enrolled learners
- End-to-end flow: enrol → view module → complete quiz → submit assignment → coach grades → credential issued
- Lighthouse accessibility score ≥ 80
- No P1/P2 bugs in grading or credential issuance

---

### Phase 2 — B-BBEE Compliance + Scale (months 5–10)

**Scope: Compliance reporting, offline resilience, 200–2 000 learners.**

**New in Phase 2:**
- Learner demographic data collection (consented, POPIA-compliant)
- Training hours calculation from `sessions` timestamps
- ATR/WSP-ready report export (PDF/XLSX)
- SAQA unit standard tagging on courses
- Credential PDF export with QR verification
- AI-suggested grading (coach-confirmable)
- SSE streaming for Socratic sessions (better UX)
- Offline cache (Service Worker, Workbox) for beat content
- Background Sync queue for submission drafts
- Video object storage integration
- CNAME / custom domain support
- Org_admin full workforce + competency heat map dashboard
- Session replay UI for coaches
- Rubric-aligned score input in grading
- WCAG 2.1 AA audit + remediation pass

**Phase 2 exit criteria:**
- First employer can generate an ATR report directly from the platform
- Platform handles 2 000 concurrent learners without degradation
- WCAG 2.1 AA automated test pass rate ≥ 95% (axe-core in CI)

---

### Phase 3 — Marketplace + Adaptive Intelligence (months 11–18)

**Scope: Network effects, AI-driven personalisation, monetisation expansion.**

**New in Phase 3:**
- Coaching marketplace: coach profiles, booking, Peach Payments / PayFast integration, 15% platform fee
- Adaptive micro-path generation: remediation beats auto-generated by Claude when learner fails Final Test
- `competencyTag` on questions → org-wide competency gap analysis
- SETA-accredited content packs (curated, licensed to multiple orgs)
- Learner-facing streak + XP gamification layer
- Multi-language content support (Zulu, Xhosa, Afrikaans) — beat narration field becomes `narration_i18n: { en, zu, xh, af }`
- API for third-party HRIS integration (SAP, Sage HR) — enrolment sync via webhook
- Mobile app (React Native / Expo) wrapping the same API

**Phase 3 exit criteria:**
- ≥ 3 active SETA-aligned content packs live
- ≥ 1 HRIS integration live with a paying enterprise customer
- Adaptive paths measurably improve Final Test pass rates (A/B test with ≥ 200 learners per arm)

---

## Key Cross-Cutting Tradeoffs (Summary)

| Decision | Chosen | Tradeoff accepted |
|---|---|---|
| Beats in Postgres vs. file-based content | Postgres | Enables analytics and adaptive resequencing; authoring is more complex than uploading a SCORM file |
| Interactive beat data in `visualData` JSONB | JSONB | No schema migration for new activity types; loses SQL-level query ability on activity structure |
| Assignment config in `instructions` text field | Text + JSON parse | No schema migration needed for Phase 1; type-checking is runtime only, not DB-enforced |
| Offline-first learner vs. real-time analytics | Online-first Phase 1, offline Phase 2 | Phase 1 analytics are real-time; Phase 2 analytics become eventually consistent |
| LLM auto-grading | Deferred to Phase 2 | Phase 1 coach load is higher; avoids hallucination risk before oversight workflow exists |
| Clerk for auth vs. custom auth | Clerk | Reduces auth engineering to near-zero; creates dependency on Clerk pricing/uptime |
| White-label depth | Logo + palette only (Phase 1) | Easier to support; partner differentiation is limited until Phase 2 custom domain |
