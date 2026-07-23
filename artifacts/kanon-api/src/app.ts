import express, { type Express, type RequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/kanon-db";
import router from "./routes";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger";
import { handleStripeWebhook } from "./lib/stripeWebhook";

const app: Express = express();

app.set("trust proxy", 1);
// Do not advertise the framework.
app.disable("x-powered-by");

// Baseline security response headers on every response. Dependency-free and
// conservative (no CSP, since this server also serves the SPA + Clerk/Stripe
// assets and a wrong CSP silently breaks the app).
app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
});

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
// CORS: the SPA is served same-origin, so cross-origin access is only needed for
// explicitly allow-listed origins (ALLOWED_ORIGINS / APP_URL). In production,
// deny cross-origin by default (same-origin requests need no CORS header); in
// development, reflect the request origin so local tooling works. Mutating
// requests are additionally protected by sameOriginGuard below.
const corsAllowlist = (process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
app.use(
    cors({
        origin:
            process.env.NODE_ENV === "production"
                ? corsAllowlist.length > 0
                    ? corsAllowlist
                    : false
                : true,
    }),
);

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

// Broad denial-of-service backstop across the whole API. Individual auth/signup
// routes keep their own tighter limits; this only catches gross floods. Health
// probes are exempt so a monitor can never be throttled. Registered after the
// Stripe webhook so gateway callbacks are not counted.
app.use(
    rateLimit({
        windowMs: 60_000,
        max: 1000,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) =>
            req.path === "/api/healthz" ||
            req.path === "/api/readyz" ||
            req.path === "/api/version",
        message: { error: "Too many requests, please try again later." },
    }),
);

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
                  maxAge: 1000 * 60 * 60 * 24 * 7,
          },
    }),
  );

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
          req.log.warn({ origin, host }, "Blocked cross-origin mutating request");
          res.status(403).json({ error: "Cross-origin request blocked" });
    } catch {
          res.status(403).json({ error: "Invalid origin" });
    }
};
app.use(sameOriginGuard);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const clientDir =
          process.env.CLIENT_DIST_DIR ||
          path.resolve(here, "../../kanon/dist/public");
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
          if (req.method !== "GET" || req.path.startsWith("/api")) {
                  next();
                  return;
          }
          res.sendFile(path.join(clientDir, "index.html"));
    });
    logger.info({ clientDir }, "Serving built frontend (production)");
}

// Central error handler: turn any thrown/rejected route error into a logged,
// correlated JSON 500 instead of Express's default HTML page. Must be registered
// last. (Express 5 forwards async handler rejections here automatically.)
app.use(
    (
        err: unknown,
        req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
    ) => {
        req.log?.error({ err }, "Unhandled request error");
        if (res.headersSent) return;
        res.status(500).json({ error: "Internal server error" });
    },
);

export default app;
