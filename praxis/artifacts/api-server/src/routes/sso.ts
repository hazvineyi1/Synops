import type { Request, Response } from "express";
import { db, usersTable, authSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySsoToken } from "../lib/sso";
import { newSessionToken, sessionExpiry, cookieOptions, SESSION_COOKIE } from "../lib/auth";

/**
 * Cross-product admin SSO landing. The Synops issuer redirects an admin here with a short-lived
 * signed token (?token=...&next=/platform). We verify the token, confirm the email is a Praxis
 * super_admin, then mint a normal Praxis session and land them in the platform console.
 */
export async function ssoConsume(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.query["token"] === "string" ? req.query["token"] : "";
    const nextRaw = typeof req.query["next"] === "string" ? (req.query["next"] as string) : "/platform";
    const next = nextRaw.startsWith("/") ? nextRaw : "/platform";

    const secret = process.env.SSO_SHARED_SECRET;
    if (!secret) { res.redirect("/login?sso=unconfigured"); return; }

    const claims = verifySsoToken(token, secret, "praxis");
    if (!claims) { res.redirect("/login?sso=invalid"); return; }

    const email = claims.sub.toLowerCase();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || user.role !== "super_admin") { res.redirect("/login?sso=denied"); return; }

    const sessionToken = newSessionToken();
    await db.insert(authSessionsTable).values({
      token: sessionToken,
      userId: user.id,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      expiresAt: sessionExpiry(),
    });
    res.cookie(SESSION_COOKIE, sessionToken, cookieOptions());
    res.redirect(next);
  } catch {
    res.redirect("/login?sso=error");
  }
}
