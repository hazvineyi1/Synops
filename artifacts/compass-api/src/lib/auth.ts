import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/compass-db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    role?: string;
    // Set only while a super admin is impersonating another user. Holds the
    // REAL operator's id; `userId` holds the impersonated target. Cleared on
    // stop. Drives the impersonation banner and the blockWhileImpersonating
    // guard. See routes/impersonation.ts.
    impersonatorUserId?: number;
  }
}

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
};

/**
 * Reject credential- and security-changing actions while a super admin is
 * impersonating another user. Impersonation is for support and reproduction,
 * not for performing privileged changes as the target (creating users, resetting
 * passwords, granting access, or nesting impersonation). Detected from the
 * session, which is set only by routes/impersonation.ts, so this works both
 * inside and outside the /compass namespace.
 */
export const blockWhileImpersonating: RequestHandler = (req, res, next) => {
  if (req.session?.impersonatorUserId != null) {
    res.status(403).json({
      error: "This action is not available while impersonating. Stop impersonating first.",
    });
    return;
  }
  next();
};

/**
 * Gate a route to users who belong to a specific product (admins bypass).
 * Reads role + productKey from the DB rather than trusting the session.
 */
export function requireProduct(productKey: string): RequestHandler {
  return (req, res, next) => {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    void (async () => {
      try {
        const [user] = await db
          .select({ role: usersTable.role, productKey: usersTable.productKey, status: usersTable.status })
          .from(usersTable)
          .where(eq(usersTable.id, userId));

        if (!user) {
          req.session.destroy(() => undefined);
          res.status(401).json({ error: "Authentication required" });
          return;
        }

        if (user.status === "deactivated") {
          req.session.destroy(() => undefined);
          res.status(403).json({ error: "This account has been deactivated." });
          return;
        }

        if (
          user.role === "admin" ||
          user.role === "super_admin" ||
          user.productKey === productKey
        ) {
          next();
          return;
        }

        res.status(403).json({ error: "You do not have access to this product." });
      } catch (err) {
        next(err);
      }
    })();
  };
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Verify the current role from the DB rather than trusting the session,
  // so a demoted admin loses access immediately instead of at session expiry.
  void (async () => {
    try {
      const [user] = await db
        .select({ role: usersTable.role, status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId));

      if (!user) {
        req.session.destroy(() => undefined);
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      if (user.status === "deactivated") {
        req.session.destroy(() => undefined);
        res.status(403).json({ error: "This account has been deactivated." });
        return;
      }

      if (user.role !== "admin") {
        // Keep the session's role in sync with the DB.
        req.session.role = user.role;
        res.status(403).json({ error: "Admin access required" });
        return;
      }

      req.session.role = user.role;
      next();
    } catch (err) {
      next(err);
    }
  })();
};
