import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { registerPwa } from "./pwa";
import { logger } from "./lib/logger";

const app: Express = express();

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
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error", detail: message });
});

export default app;
