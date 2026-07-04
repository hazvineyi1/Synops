// Mountable Compass Curriculum Builder API, for embedding inside another Express
// host (the paideia-api deployment) instead of running as its own service.
//
// This is deliberately DIFFERENT from app.ts (the standalone server): it does
// NOT serve static files, does NOT call listen(), and does NOT throw at module
// load. The host is responsible for body parsing (already applied globally) and
// for only calling createCompassMount() once SESSION_SECRET is configured.
//
// The returned router applies Compass's own PG-backed session + a same-origin
// CSRF guard, then mounts the full Compass route tree (routes/index.ts), which
// already namespaces everything under /compass, /auth, /branding, /demo, etc.
// Mounted at "/api" by the host so paths match the generated client exactly
// (e.g. /api/compass/clients).
import { Router, type IRouter, type RequestHandler } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/compass-db";
import compassRouter from "./routes";

// CSRF defense-in-depth: reject cross-origin state-changing requests. SameSite=lax
// cookies already block cross-site cookie sending; this adds an explicit Origin
// check. Non-browser clients (no Origin header) are allowed. Ported from app.ts.
const sameOriginGuard: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  try {
    const originHost = new URL(origin).host;
    const host = req.get("host");
    const allowed = (process.env.ALLOWED_ORIGINS ?? process.env.REPLIT_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (originHost === host || allowed.includes(originHost)) {
      next();
      return;
    }
    res.status(403).json({ error: "Cross-origin request blocked" });
  } catch {
    res.status(403).json({ error: "Invalid origin" });
  }
};

/**
 * Build the Compass API as a mountable Express router. The caller MUST guarantee
 * process.env.SESSION_SECRET is set before invoking this (session() requires it).
 */
export function createCompassMount(): IRouter {
  const r = Router();

  const PgSession = connectPgSimple(session);
  r.use(
    session({
      // Distinct cookie name so it never collides with the host app's cookies.
      name: "compass_sid",
      store: new PgSession({ pool, tableName: "user_sessions" }),
      secret: process.env.SESSION_SECRET as string,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  r.use(sameOriginGuard);
  r.use(compassRouter);

  return r;
}
