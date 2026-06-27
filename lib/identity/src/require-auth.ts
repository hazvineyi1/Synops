import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

export type ClerkAuth = ReturnType<typeof getAuth>;

/**
 * Product-supplied provisioning callback. Receives the authenticated Clerk
 * userId and the raw auth object; may JIT-create the user, look up
 * entitlements, etc. Anything it returns is merged onto the request so
 * downstream handlers can read it (e.g. `req.entitlement`).
 */
export type AuthProvision = (
  userId: string,
  auth: ClerkAuth,
) => Promise<Record<string, unknown> | void>;

/**
 * Generic Clerk auth gate, shared across Synops products. Resolves the Clerk
 * userId from the request, 401s if absent, attaches `req.userId`, then defers
 * product-specific provisioning to the supplied callback.
 */
export function createRequireAuth(provision: AuthProvision) {
  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as any).userId = userId;
    try {
      const extra = await provision(userId, auth);
      if (extra) Object.assign(req, extra);
    } catch (err) {
      next(err);
      return;
    }
    next();
  };
}
