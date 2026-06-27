import type { Request, Response, NextFunction } from "express";
import { isProduction } from "../lib/config";

/**
 * Sets a baseline of security-related response headers on every response.
 *
 * Deliberately dependency-free (no helmet) and conservative: it omits a strict
 * Content-Security-Policy because this same server also serves the Vite-built
 * SPA plus Clerk and Stripe scripts, and a wrong CSP silently breaks the app.
 * Add a tailored CSP later once the exact script/style/connect allowlist is
 * known.
 */
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    // Only advertise HSTS when actually served over HTTPS in production, to
    // avoid breaking plain-HTTP local development.
    if (isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains",
      );
    }
    next();
  };
}
