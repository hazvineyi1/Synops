import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/compass-db";
import router from "./routes";
import { logger } from "./lib/logger";
import { handleStripeWebhook } from "./lib/stripeWebhook";

const app: Express = express();

// Behind the Replit reverse proxy, required for secure cookies and rate limiting.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Stripe webhook: needs the raw request body for signature verification, so it
// is registered BEFORE express.json(). It self-verifies the Stripe signature and
// is mounted before the same-origin guard (server-to-server POST has no Origin).
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set for session management.");
}

const PgSession = connectPgSimple(session);

app.use(
  session({
    name: "sid",
    store: new PgSession({
      pool,
      tableName: "user_sessions",
    }),
    secret: process.env.SESSION_SECRET,
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

// CSRF defense-in-depth: reject cross-origin state-changing requests.
// SameSite=lax cookies already block cross-site cookie sending; this adds an
// explicit Origin check. Non-browser clients (no Origin header) are allowed.
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
    // Comma-separated allowed origin hosts (no scheme/port), e.g.
    // "app.synops-consulting.com,synops-consulting.com". Falls back to the
    // legacy REPLIT_DOMAINS so an in-progress migration keeps working.
    const allowed = (process.env.ALLOWED_ORIGINS ?? process.env.REPLIT_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (originHost === host || allowed.includes(originHost)) {
      next();
      return;
    }
    req.log.warn({ origin, host }, "Blocked cross-origin mutating request");
    res.status(403).json({ error: "Cross-origin request blocked" });
  } catch {
    res.status(403).json({ error: "Invalid origin" });
  }
};
app.use(sameOriginGuard);

app.use("/api", router);

// Single-service deploy (Railway): in production this server also serves the
// built Vite frontend and falls back to index.html for client-side routes, so
// /api takes precedence and everything else renders the SPA. In development you
// run the Vite dev server separately, so this is skipped. Override the location
// with CLIENT_DIST_DIR if your build output differs.
if (process.env.NODE_ENV === "production") {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir =
    process.env.CLIENT_DIST_DIR ||
    path.resolve(here, "../../uva-engine/dist/public");
  app.use(express.static(clientDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
  logger.info({ clientDir }, "Serving built frontend (production)");
}

export default app;
