import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/kanon-db";
import { eq } from "drizzle-orm";
import { verifySsoToken } from "../lib/sso.js";

/**
 * Cross-product admin SSO landing. The Synops issuer redirects an admin here with a short-lived
 * signed token (?token=...&next=/compass/console). We verify the token, confirm the email is a
 * Kanon global admin, then establish a normal express-session and land them in the console.
 */
export function ssoConsume(req: Request, res: Response): void {
  void (async () => {
    try {
      const token = typeof req.query["token"] === "string" ? (req.query["token"] as string) : "";
      const nextRaw = typeof req.query["next"] === "string" ? (req.query["next"] as string) : "/compass/console";
      const next = nextRaw.startsWith("/") ? nextRaw : "/compass/console";

      const secret = process.env.SSO_SHARED_SECRET;
      if (!secret) { res.redirect("/?sso=unconfigured"); return; }

      const claims = verifySsoToken(token, secret, "kanon");
      if (!claims) { res.redirect("/?sso=invalid"); return; }

      const email = claims.sub.toLowerCase();
      const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
      if (!user || !(user.role === "admin" || user.role === "super_admin")) { res.redirect("/?sso=denied"); return; }

      // Regenerate to defeat session fixation, then set the session identity and save.
      req.session.regenerate((err) => {
        if (err) { res.redirect("/?sso=error"); return; }
        req.session.userId = user.id;
        req.session.role = user.role;
        req.session.save((err2) => {
          if (err2) { res.redirect("/?sso=error"); return; }
          res.redirect(next);
        });
      });
    } catch {
      res.redirect("/?sso=error");
    }
  })();
}
