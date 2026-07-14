---
name: Synops Praxis Architecture
description: Full platform overview — DB schema, API routes, frontend pages, seed data, and key decisions
---

## Stack
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + wouter + @tanstack/react-query
- **Backend**: Express (Node) + Drizzle ORM + Replit PostgreSQL
- **Auth**: Clerk (Replit-managed white-label) + custom RBAC (5 roles)
- **AI**: Anthropic `claude-sonnet-4-6` via `@workspace/integrations-anthropic-ai`
- **Monorepo**: pnpm workspace, artifacts at `artifacts/`, libs at `lib/`

## Roles
`super_admin`, `partner_admin`, `org_admin`, `coach`, `learner`

## DB Schema (all pushed to Replit PostgreSQL)
All tables in `lib/db/src/schema/`. All exported from `lib/db/src/schema/index.ts`.

Core: users, partners, organisations, brand_themes, courses, modules, beats, script_drafts
Learning: sessions, dialogue_turns, assessments, assessment_items, attempts, item_responses
Credentials: credentials, evidence_records, submissions
Analytics: activity_events, audit_events

D2L/Canvas parity layer (added second session):
- enrolments — learner course enrollment + grades
- assignments — assignments, submissions, rubrics, gradebook_entries
- discussions + discussion_replies
- announcements
- calendar: course_events, course_pages
- groups: course_groups, course_group_members
- notifications — per-user notification feed
- interactive_video: iv_questions, iv_responses
- media_files

## API Server (`artifacts/api-server/`)
All routes registered in `src/routes/index.ts`. Auth via Clerk + `requireAuth` middleware (JIT user provision).
Routes: health, users, partners, organisations, brand, courses, modules, beats, studio, sessions (Socratic SSE), assessments, credentials, coach, analytics, reports, enrolments, discussions, announcements, assignments, gradebook, calendar, pages, groups, notifications, interactive_video, dev

**Dev endpoints** (dev-only, returns 404 in production):
- `GET /api/dev/seed-users` — list all seed users
- `POST /api/dev/set-role` — change current user's role
- `POST /api/dev/promote` — adopt another seed user's role/partner/org context

## Frontend (`artifacts/praxis/`)
API helper: `src/lib/api.ts` — `apiFetch()` + `API` base URL constant.

Key pages:
- `/` — Landing (public)
- `/dashboard` — Role-adaptive dashboard
- `/courses` — Course catalog
- `/courses/:courseId` — **CourseHub** (10-tab: Overview, Modules, Assignments, Discussions, Announcements, Gradebook, Calendar, Pages, People, Groups)
- `/courses/:courseId/assignments/:assignmentId` — AssignmentDetail (submit, view grade)
- `/courses/:courseId/discussions/:discussionId` — DiscussionThread (replies + LEAPS)
- `/courses/:courseId/gradebook` — CourseGradebook (instructor spreadsheet view)
- `/notifications` — NotificationsPage
- `/learn/:sessionId` — Socratic SSE session
- `/studio`, `/studio/new`, `/studio/:draftId` — Animation Studio
- `/assess/:assessmentId` — Assessment
- `/credentials`, `/verify/:credentialId` — PraxisMark credentials
- `/coach`, `/coach/submissions` — Coach dashboard
- `/admin/partners`, `/partner/theme`, `/reports` — Admin

Key components:
- `AppLayout` — sidebar nav + notifications bell with unread badge (30s polling) + DevRoleSwitcher (dev only)
- `InteractiveVideoPlayer` — YouTube/HTML5, timestamp question overlays, progress dots
- `DevRoleSwitcher` — floating fixed panel, quick role switch for demos

## Seed Data (run: `pnpm --filter @workspace/db run seed`)
- 2 partners: TalentForge SA (`partner_talentforge`), SkillBridge Africa (`partner_skillbridge`)
- 3 orgs: MTN Skills Academy, Vodacom Learning Centre, Shoprite Workforce Development
- 22 users: 1 super_admin, 2 partner_admins, 3 org_admins, 3 coaches, 12 learners
- 4 courses: Business Management Fundamentals, Financial Literacy, Customer Service Excellence (published), Digital Skills (draft)
- 14 modules, 24 beats with realistic SA workforce content
- Enrolments, assignments, discussions+replies, announcements, course events, pages, groups, credentials, notifications

**Login for demos**: Sign in via Clerk with a seed email, then use DevRoleSwitcher (floating bottom-right in dev) to change role.

## Key Decisions

**Why:** Seed users have real Clerk IDs only on first sign-in (JIT provision). The dev role-switcher (`/api/dev/set-role`) is the recommended workaround for role demo without Clerk invitations.

**Why:** Interactive video (PlayPosit-style) uses HTML5 `<video>` `onTimeUpdate` for native video files; YouTube embeds use a simplified manual-check pattern (full YouTube Player API blocked in some iframes). Questions stored per beat, fetched at player mount.

**Why:** CourseHub uses URL search params (`?tab=assignments`) to make tabs bookmarkable, consistent with Canvas/D2L conventions.

**Why:** `apiFetch` in `src/lib/api.ts` uses `import.meta.env.BASE_URL` prefix — never hardcode `/api/` since the artifact is path-routed behind a proxy.
