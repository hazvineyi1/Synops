import type { RequestHandler } from "express";
import { db } from "@workspace/db";
import { usersTable, authSessionsTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { SESSION_COOKIE } from "../lib/auth";

// Extend request with our user
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      dbUser?: typeof usersTable.$inferSelect;
      /**
       * Set when a super_admin is impersonating. Holds the ADMIN's user id, so any
       * action taken while impersonating can be attributed to the real actor rather
       * than silently blamed on the learner.
       */
      impersonatorId?: string;
      sessionId?: string;
    }
  }
}

/**
 * Session auth, replacing Clerk.
 *
 * The session cookie holds an opaque token; this row is the source of truth. Because
 * WE own it, the platform console can do what a third-party identity provider makes
 * hard: impersonate any user, revoke every session at once, force sign-out on
 * suspend, and record a real login trail.
 *
 * TYPE NOTE (`RequestHandler<any, any, any, any>`): leaving the generics open is
 * load-bearing. Annotating this with Express's default `Request` pins the route's
 * param type to ParamsDictionary, which in @types/express v5 is
 * `{ [k: string]: string | string[] }` -- and because router.get() unifies the param
 * type across all handlers, that OVERRODE the params Express infers from the route
 * literal on every guarded route. It produced 120 type errors and meant params were
 * never type-checked anywhere in the API.
 */
export const requireAuth: RequestHandler<any, any, any, any> = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [session] = await db
      .select()
      .from(authSessionsTable)
      .where(
        and(
          eq(authSessionsTable.token, token),
          isNull(authSessionsTable.revokedAt),
          gt(authSessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!session) {
      res.status(401).json({ error: "Session expired. Please sign in again." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // A suspended user must not be able to keep using an existing session. Checking
    // only at login would let a suspended account stay signed in for up to 30 days.
    if (user.status === "suspended") {
      res.status(403).json({ error: "This account has been suspended." });
      return;
    }

    req.userId = user.id;
    req.dbUser = user;
    req.sessionId = session.id;
    req.impersonatorId = session.impersonatorId ?? undefined;

    // Fire-and-forget liveness ping; never block or fail the request on it.
    void db
      .update(authSessionsTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(authSessionsTable.id, session.id))
      .catch(() => {});

    next();
  } catch (err) {
    req.log?.error({ err }, "requireAuth error");
    res.status(500).json({ error: "Internal server error" });
  }
};

/** Shorthand for role checks. Generics left open for the same reason as requireAuth. */
export const requireRole = (...roles: string[]): RequestHandler<any, any, any, any> => {
  return async (req, res, next) => {
    if (!req.dbUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.dbUser.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
};

/** Platform owner only. */
export const requireSuperAdmin = requireRole("super_admin");
