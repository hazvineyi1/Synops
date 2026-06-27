---
name: Admin access model
description: How admin gating works in The Coach and how to grant/revoke admin.
---

Admin access is allowlist-based, not a DB role.

- `ADMIN_EMAILS` is a shared env var: comma-separated, compared case-insensitively.
- Backend `requireAdmin` (api-server) resolves the authed user's emails via `clerkClient.users.getUser(userId)` and matches only **verified** email addresses against the allowlist. Empty/missing `ADMIN_EMAILS` fails closed.
- `/admin/me` is `requireAuth`-only and returns `{ isAdmin }` for frontend nav gating; all data routes are `requireAuth + requireAdmin`. Frontend nav gating is non-authoritative — the server check is the real boundary.

**Why:** owner wanted admin reporting without building a roles system; email allowlist is the simplest durable mechanism and verified-only avoids unverified-secondary-email privilege escalation.

**How to apply:** to add/remove an admin, edit the `ADMIN_EMAILS` env var (shared). The email must be a verified address on that user's Clerk account. No code change or redeploy of logic needed.
