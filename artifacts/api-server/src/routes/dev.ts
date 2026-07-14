/**
 * Development-only routes for demo and testing.
 * Guarded by NODE_ENV check — returns 404 in production.
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, authSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { newSessionToken, sessionExpiry, cookieOptions, SESSION_COOKIE } from "../lib/auth";

const router = Router();

const isDev = process.env.NODE_ENV !== "production";

// POST /dev/impersonate — sign in as any seed user without a password (dev only).
// Now that requireAuth reads a real auth_session, this mints one instead of the old
// raw-userId cookie. Still hard-gated to non-production. Name kept for DevLogin.tsx.
async function devLogin(req: any, res: any) {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }
  const { userId } = req.body;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const token = newSessionToken();
  await db.insert(authSessionsTable).values({ token, userId: user.id, expiresAt: sessionExpiry() });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } });
}

router.post("/dev/impersonate", devLogin);
router.post("/dev/login", devLogin);

// GET /dev/impersonate — who am I currently signed in as? (null if nobody)
//
// DevLogin.tsx calls this on mount. It did not exist, so Express fell through to its
// HTML 404 handler; the page's `.json()` then threw, the enclosing Promise.all
// rejected, and the *successful* seed-users response was discarded along with it --
// leaving a page that finished loading and rendered zero accounts. Unauthenticated is
// a normal state here, so it answers 200 with null rather than 401.
router.get("/dev/impersonate", async (req, res) => {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }

  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) { res.json({ impersonating: null }); return; }

  const session = await db.query.authSessionsTable.findFirst({
    where: eq(authSessionsTable.token, token),
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    res.json({ impersonating: null });
    return;
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, session.userId),
  });
  if (!user) { res.json({ impersonating: null }); return; }

  res.json({
    impersonating: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  });
});

// DELETE /dev/impersonate — sign out (revoke the current session).
router.delete("/dev/impersonate", async (req, res) => {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.update(authSessionsTable).set({ revokedAt: new Date() }).where(eq(authSessionsTable.token, token));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// POST /dev/set-role — change your own role (dev only, requires active session)
router.post("/dev/set-role", requireAuth, async (req, res) => {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }
  const { role } = req.body;
  const validRoles = ["super_admin", "partner_admin", "org_admin", "coach", "learner"];
  if (!validRoles.includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }

  let partnerId: string | null = req.dbUser!.partnerId ?? null;
  let organisationId: string | null = req.dbUser!.organisationId ?? null;

  if (role === "super_admin") { partnerId = null; organisationId = null; }
  else if (role === "partner_admin") { partnerId = partnerId ?? "partner_talentforge"; organisationId = null; }
  else if (role === "org_admin") { partnerId = partnerId ?? "partner_talentforge"; organisationId = organisationId ?? "org_mtn"; }
  else if (role === "coach") { partnerId = partnerId ?? "partner_talentforge"; organisationId = organisationId ?? "org_mtn"; }

  const [updated] = await db.update(usersTable)
    .set({ role, partnerId, organisationId, updatedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({ ok: true, user: { id: updated.id, role: updated.role, partnerId: updated.partnerId, organisationId: updated.organisationId } });
});

// GET /dev/seed-users — list all seed users for reference
router.get("/dev/seed-users", async (req, res) => {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    firstName: usersTable.firstName,
    lastName: usersTable.lastName,
    role: usersTable.role,
    partnerId: usersTable.partnerId,
    organisationId: usersTable.organisationId,
  }).from(usersTable).orderBy(usersTable.role);
  res.json(users);
});

// POST /dev/promote — promote your account to match a seed user's role/partner/org
router.post("/dev/promote", requireAuth, async (req, res) => {
  if (!isDev) { res.status(404).json({ error: "Not found" }); return; }
  const { targetUserId } = req.body;
  const target = await db.query.usersTable.findFirst({ where: eq(usersTable.id, targetUserId) });
  if (!target) { res.status(404).json({ error: "Seed user not found" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ role: target.role, partnerId: target.partnerId, organisationId: target.organisationId, updatedAt: new Date() })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({ ok: true, user: { id: updated.id, role: updated.role, partnerId: updated.partnerId, organisationId: updated.organisationId } });
});

export default router;
