import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { registerPwa } from "./pwa";
import { logger } from "./lib/logger";
import { captureError } from "./lib/observability";

const app: Express = express();

// Behind Railway's proxy: trust exactly one hop so req.ip / X-Forwarded-For are the real client
// (needed for correct rate-limit keying and audit IPs). Not `true` — that would trust a spoofable
// chain and express-rate-limit rejects it.
app.set("trust proxy", 1);

// Security headers. CSP, frameguard, COEP and CORP are intentionally left OFF here: the SPA uses
// inline styles and sandboxed activity iframes, and /c/:token /a/:token are DESIGNED to be embedded
// on external sites (a SAMEORIGIN frame policy would break them). Everything else helmet sets is a
// safe, non-breaking win: HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, no X-Powered-By.
// TODO(hardening): add a tuned Content-Security-Policy with frame-ancestors scoped to the embed routes.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
}));

// Rate limiting. In-process store (per instance) — a real backstop for a single Railway instance;
// swap for a shared store (Redis) before horizontal scaling. Auth/impersonation paths are throttled
// hard against credential stuffing; the broad /api limit is a generous DoS backstop that will not
// trip a normal dashboard.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 1000, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Rate limit exceeded. Slow down and retry shortly." },
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

// Identity is first-party now (see middlewares/requireAuth + routes/auth). Clerk is
// gone: the platform console needs to impersonate any user, issue master password
// resets, force sign-out everywhere and keep a real login trail -- all of which a
// third-party identity provider only lets you do indirectly, through its API.
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "25mb" })); // large enough for base64-encoded document uploads (activity content extraction)
app.use(express.urlencoded({ extended: true }));

// Throttle the auth + (dev) impersonation surfaces hardest, then a broad backstop over all of /api.
app.use("/api/auth", authLimiter);
app.use("/api/dev", authLimiter);
app.use("/api", apiLimiter);

app.use("/api", router);

// Branded PWA manifest + icon, resolved by hostname. Registered before the SPA catch-all so the
// browser's /manifest.webmanifest and /pwa-icon.svg requests reach these, not index.html.
registerPwa(app);

// ── Serve the built SPA (production single-service on Railway) ──
// The web app builds to artifacts/praxis/dist/public. This bundle runs from
// artifacts/api-server/dist/index.mjs, so the client build sits at ../../praxis/dist/public.
// In local dev that directory does not exist (Vite serves the SPA on :5173 and proxies
// /api here), so this whole block is guarded and simply does nothing in dev.
const bundleDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(bundleDir, "../../praxis/dist/public");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-/api GET returns index.html so client-side routing works on
  // deep links and refreshes. The negative lookahead keeps /api/* on the API.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Central error handler. Previously there was none, so any thrown/rejected route
// (e.g. a dropped DB connection) fell through to Express's default handler: an opaque
// 500 whose real cause was never logged with the request, only surfaced as pino-http's
// generic "request errored". Now the actual error is logged against the request id and
// the client gets a clean JSON shape instead of an HTML stack page. Must have all FOUR
// args for Express to recognise it as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  // pino-http attaches req.log; fall back to the module logger if the augmentation
  // isn't in scope at type-check time.
  const log = (req as unknown as { log?: typeof logger }).log ?? logger;
  log.error({ err, url: req.originalUrl }, "unhandled route error");
  // Report to Sentry (no-op unless SENTRY_DSN is configured) so 500s are visible in production.
  captureError(err, { url: req.originalUrl, method: req.method });
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error", detail: message });
});

export default app;
