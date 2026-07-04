import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable, impersonationEventsTable } from "@workspace/compass-db";
import { blockWhileImpersonating } from "../lib/auth";
import { decideImpersonationStart } from "../lib/impersonation";

/**
 * Impersonation lets a super admin temporarily act as another user for support
 * and bug reproduction. It is intentionally mounted as a TOP-LEVEL authed router
 * (not under /compass) so an impersonated non-Compass user (for example a Hub
 * client) can still stop. The model is a session swap:
 *
 *   start: session.impersonatorUserId = <real super admin>; session.userId = <target>
 *   stop:  session.userId = session.impersonatorUserId; clear impersonatorUserId
 *
 * The session id is REGENERATED on both transitions to avoid session fixation.
 * Every transition is recorded in `impersonation_events` for a security trail.
 */
const router = Router();

const startSchema = z.object({
  userId: z.number().int().positive(),
});

// express-session callbacks are node-style; wrap them so we can await in order.
function regenerateSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// Begin impersonating a target user. Only a super admin may start, and only when
// not already impersonating (blockWhileImpersonating prevents nesting). The
// operator themselves and deactivated accounts cannot be targets; admin and
// super_admin accounts are eligible.
router.post("/impersonation/start", blockWhileImpersonating, async (req, res): Promise<void> => {
  const realUserId = req.session.userId;
  if (!realUserId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A target userId is required." });
    return;
  }

  const [operator] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, realUserId));

  const [target] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.userId));

  switch (decideImpersonationStart(operator ?? null, target ?? null)) {
    case "operator_invalid":
      req.session.destroy(() => undefined);
      res.status(401).json({ error: "Authentication required" });
      return;
    case "not_super_admin":
      res.status(403).json({ error: "Only a super administrator can impersonate users." });
      return;
    case "target_not_found":
      res.status(404).json({ error: "User not found." });
      return;
    case "self":
      res.status(400).json({ error: "You cannot impersonate yourself." });
      return;
    case "target_deactivated":
      res.status(400).json({ error: "You cannot impersonate a deactivated account." });
      return;
  }

  // The decision above returns before here unless both are present; this guard
  // only narrows the types for the compiler.
  if (!operator || !target) return;

  // Swap into the target with a fresh session id, retaining the real operator.
  await regenerateSession(req);
  req.session.userId = target.id;
  req.session.role = target.role;
  req.session.impersonatorUserId = operator.id;
  await saveSession(req);

  await db.insert(impersonationEventsTable).values({
    impersonatorUserId: operator.id,
    targetUserId: target.id,
    action: "start",
  });
  req.log.info({ impersonatorUserId: operator.id, targetUserId: target.id }, "Impersonation started");

  res.json({ ok: true });
});

// Stop impersonating and restore the operator's own session.
router.post("/impersonation/stop", async (req, res): Promise<void> => {
  const impersonatorUserId = req.session.impersonatorUserId;
  const targetUserId = req.session.userId;
  if (impersonatorUserId == null) {
    res.status(400).json({ error: "You are not impersonating anyone." });
    return;
  }

  const [operator] = await db
    .select({ id: usersTable.id, role: usersTable.role, status: usersTable.status })
    .from(usersTable)
    .where(eq(usersTable.id, impersonatorUserId));

  // Record the stop regardless of whether the operator account is still valid.
  await db.insert(impersonationEventsTable).values({
    impersonatorUserId,
    targetUserId: targetUserId ?? impersonatorUserId,
    action: "stop",
  });
  req.log.info({ impersonatorUserId, targetUserId }, "Impersonation stopped");

  // If the operator account vanished or was deactivated mid-session, fail safe by
  // ending the session entirely (forces a fresh login) instead of restoring it.
  if (!operator || operator.status === "deactivated") {
    req.session.destroy(() => {
      res.clearCookie("sid");
      res.json({ ok: true });
    });
    return;
  }

  await regenerateSession(req);
  req.session.userId = operator.id;
  req.session.role = operator.role;
  await saveSession(req);

  res.json({ ok: true });
});

export default router;
