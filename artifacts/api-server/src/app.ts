import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAllowedOrigins, isProduction } from "./lib/config";
import { securityHeaders } from "./middlewares/securityHeaders";
import { globalLimiter } from "./middlewares/rateLimit";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Behind Railway/most PaaS the app sits behind a reverse proxy. Trusting the
// first proxy hop lets Express read the real client IP (req.ip) from
// X-Forwarded-For, which the rate limiter relies on, and detect HTTPS.
app.set("trust proxy", 1);
// Do not advertise the framework.
app.disable("x-powered-by");

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

// Baseline security headers on every response.
app.use(securityHeaders());

// Clerk proxy must come before body parsers.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Broad denial-of-service backstop across the whole API.
app.use(globalLimiter);

// CORS. The SPA is served from the same origin as the API, so cross-origin
// access is only needed for explicitly allow-listed origins (ALLOWED_ORIGINS /
// APP_URL). With no allowlist we fall back to permissive in development and
// same-origin-only in production.
const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    credentials: true,
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      // Same-origin and non-browser requests (health checks, server-to-server,
      // curl) send no Origin header and are always allowed.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.length === 0) {
        callback(null, !isProduction);
        return;
      }
      callback(null, allowedOrigins.includes(origin));
    },
  }),
);

// Stripe webhook needs the raw, unparsed body for signature verification, so it
// is registered before the JSON body parser.
app.use("/api/billing/webhook", express.raw({ type: "*/*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Any /api request that fell through the router is a genuine 404 — return JSON
// rather than the SPA's index.html.
app.use("/api", notFoundHandler);

// Serve the built React frontend (artifacts/arete/dist/public) in
// production. The bundled server lives in artifacts/api-server/dist, so two
// levels up is the artifacts/ directory. Falls back gracefully when the build
// is absent (dev).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(__dirname, "../../arete/dist/public");

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  // SPA fallback: serve index.html for any non-API GET route so client-side
  // routing works. Written as middleware (no path pattern) to stay Express 5
  // safe.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

// Final error handler. Must be registered last and take four arguments.
app.use(errorHandler);

export default app;
