import type { Request, Response } from "express";
import { verifySsoToken } from "../lib/sso.js";

/**
 * Cross-product admin SSO landing for Arete (Clerk-based). The Synops issuer redirects an admin
 * here with a short-lived signed token. We verify the token and that the email is an Arete admin
 * (ADMIN_EMAILS), then mint a Clerk sign-in token ("ticket") and hand off to a small client page
 * that redeems it (Clerk cannot be signed in from the server). Ends up on /admin already signed in.
 */
export async function ssoConsume(req: Request, res: Response): Promise<void> {
  try {
    const token = typeof req.query["token"] === "string" ? (req.query["token"] as string) : "";
    const nextRaw = typeof req.query["next"] === "string" ? (req.query["next"] as string) : "/admin";
    const next = nextRaw.startsWith("/") ? nextRaw : "/admin";

    const secret = process.env.SSO_SHARED_SECRET;
    if (!secret) { res.redirect("/sign-in?sso=unconfigured"); return; }

    const claims = verifySsoToken(token, secret, "arete");
    if (!claims) { res.redirect("/sign-in?sso=invalid"); return; }

    const email = claims.sub.toLowerCase();
    const admins = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!admins.includes(email)) { res.redirect("/sign-in?sso=denied"); return; }

    const clerkSecret = process.env.CLERK_SECRET_KEY;
    if (!clerkSecret) { res.redirect("/sign-in?sso=unconfigured"); return; }

    // Resolve the Clerk user for this email.
    const usersResp = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${clerkSecret}` } },
    );
    const users = (await usersResp.json()) as Array<{ id: string }>;
    if (!usersResp.ok || !Array.isArray(users) || users.length === 0) {
      res.redirect("/sign-in?sso=nouser");
      return;
    }
    const userId = users[0]!.id;

    // Mint a short-lived Clerk sign-in ticket.
    const tokenResp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: { Authorization: `Bearer ${clerkSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 120 }),
    });
    const tokenData = (await tokenResp.json()) as { token?: string };
    if (!tokenResp.ok || !tokenData.token) { res.redirect("/sign-in?sso=ticketfail"); return; }

    res.redirect(`/sso-redeem?ticket=${encodeURIComponent(tokenData.token)}&next=${encodeURIComponent(next)}`);
  } catch {
    res.redirect("/sign-in?sso=error");
  }
}
