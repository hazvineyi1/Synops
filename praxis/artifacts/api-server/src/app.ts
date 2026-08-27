import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { ssoConsume } from "./routes/sso";
import { maintenanceMode } from "./middlewares/maintenanceMode";
import { recordRequest } from "./lib/healthMetrics";
import { registerPwa } from "./pwa";
import { logger } from "./lib/logger";
import { captureError } from "./lib/observability";
import { shouldRedirectToCanonical } from "./lib/canonicalHost";

const app: Express = express();

// Behind Railway's proxy: trust exactly one hop so req.ip / X-Forwarded-For are the real client
// (needed for correct rate-limit keying and audit IPs). Not `true`, that would trust a spoofable
// chain and express-rate-limit rejects it.
app.set("trust proxy", 1);

// Canonical host: bounce any hit on the raw *.up.railway.app domain to the branded domain with a
// permanent redirect, so old bookmarks and stale email links land on praxis.synops-consulting.com
// instead of exposing the Railway URL in the address bar. Only navigational GET/HEAD requests are
// redirected; `/api` (which includes Railway's `/api/readyz` health check) and the `/c/` and `/a/`
// external token embeds are left untouched so nothing server-to-server or embedded breaks. Set
// CANONICAL_HOST="" to disable. `trust proxy` above makes req.get("host") the real client host.
const CANONICAL_HOST = process.env.CANONICAL_HOST ?? "praxis.synops-consulting.com";
app.use((req, res, next) => {
  if (shouldRedirectToCanonical(req.get("host") ?? "", req.method, req.path, CANONICAL_HOST)) {
    res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
    return;
  }
  next();
});

// Security headers. CSP, frameguard, COEP and CORP are intentionally left OFF here: the SPA uses
// inline styles and sandboxed activity iframes, and /c/:token /a/:token are DESIGNED to be embedded
// on external sites (a SAMEORIGIN frame policy would break them). Everything else helmet sets is a
// safe, non-breaking win: HSTS, X-Content-Type-Options: nosniff, Referrer-Policy, no X-Powered-By.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false,
}));

// Tuned, ENFORCED Content-Security-Policy. Verified first in report-only mode (zero violations across
// the app's core pages) before enforcing. Deliberately pragmatic for an LMS: HTTPS media / uploads /
// embeds (Supabase storage audio+video, external images, framed learning content) and wss realtime
// are allowed so nothing in the learning flow breaks, while the real wins are enforced, no plugins
// (object-src none), no base-uri or cross-origin form hijack, and clickjacking protection via
// frame-ancestors. 'unsafe-inline' stays because the SPA uses pervasive inline styles + bootstrap.
//
// frame-ancestors is route-aware: the app may only be framed by itself, but the /c/:token and
// /a/:token embeds are DESIGNED to be embedded on external sites, so they allow any ancestor.
//
// ROLLBACK: if an un-tested page trips it, change the header name below back to
// "Content-Security-Policy-Report-Only", that instantly stops blocking while keeping the reports.
const CSP_BASE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "media-src 'self' https: blob: data:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];
app.use((req, res, next) => {
  const isEmbed = req.path.startsWith("/c/") || req.path.startsWith("/a/");
  const directives = [...CSP_BASE, isEmbed ? "frame-ancestors *" : "frame-ancestors 'self'"];
  res.setHeader("Content-Security-Policy", directives.join("; "));
  next();
});

// Rate limiting. In-process store (per instance), a real backstop for a single Railway instance;
// swap for a shared store (Redis) before horizontal scaling. Auth/impersonation paths are throttled
// hard against credential stuffing; the broad /api limit is a generous DoS backstop that will not
// trip a normal dashboard.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 1000, standardHeaders: "draft-7", legacyHeaders: false,
  // Exempt the health/identity probes: /api/readyz is this service's Railway
  // healthcheck, so it must never be rate-limited, a traffic spike would
  // otherwise 429 the probe and get an otherwise-healthy instance restarted at
  // the worst possible moment. (req.originalUrl is the full path across the /api mount.)
  skip: (req) => {
    const p = req.originalUrl.split("?")[0];
    return p === "/api/healthz" || p === "/api/readyz" || p === "/api/version";
  },
  message: { error: "Rate limit exceeded. Slow down and retry shortly." },
});

app.use(
  pinoHttp({
    logger,
    // One correlation id per request, shared by logs + client + uptime monitor. Honour an inbound
    // X-Request-Id (so a caller/monitor can trace a request end to end) and always echo it back on
    // the response, so a 500 seen by the client can be matched to the exact server log line.
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();
      res.setHeader("x-request-id", id);
      return id;
    },
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

// Self-monitoring: count requests + 5xx per response for the health dashboard.
app.use("/api", (_req, res, next) => {
  res.on("finish", () => recordRequest(res.statusCode));
  next();
});

// Read-only freeze during the region cutover: rejects writes with 503 and flags
// the state to the SPA. No-op unless MAINTENANCE_MODE is set.
app.use("/api", maintenanceMode);

app.use("/api", router);

// Cross-product admin SSO landing (root origin, before the SPA catch-all).
app.get("/sso", ssoConsume);

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

  // ── Per-route metadata for public pages that are shared as links ──
  // Praxis is a client-rendered SPA, so anything that fetches a URL WITHOUT running JavaScript (other
  // AI assistants, link-preview bots, crawlers) only sees the generic index.html shell. For the public
  // demo pages we inject a real <title>, description, Open Graph/Twitter tags AND a <noscript> summary
  // into the served HTML, so a non-JS fetcher gets an accurate picture of the specific page.
  const PAGE_META: Record<string, { title: string; description: string; body: string }> = {
    "/demos/educator": {
      title: "Educator Professional Development — Synops Praxis Demo",
      description: "A practice-credentials demo for educators: earn credentials for thoughtful AI use in teaching — lesson design, assessment integrity, and teaching students to use AI well — by trying something real with your own students and reflecting on it with a coach.",
      body: "Educator Professional Development is a practice-first demo on Synops Praxis. Rather than a course, educators earn credentials by taking something real from their own teaching, reflecting on it through a four-move cycle (experience, reflect, name it, try it), and gathering light evidence. A coach named Eve asks rather than tells. Credentials cover thoughtful AI in teaching: lesson and activity design, assessment integrity, and helping students use AI well. Nothing is graded; an experienced reviewer recognises the work or refers it back with developmental feedback.",
    },
    "/demos/pej-practice": {
      title: "PEJ Justice Practice — Synops Praxis Demo",
      description: "A justice-sector guided-practice demo for prosecutors and investigators: documenting a conflict-related crime scene — safety-first sequencing, a lawful inspection that survives challenge, eliciting an account without leading, chain of custody, and the contemporaneous record — coached by Mira.",
      body: "PEJ Justice Practice is a practice-first demo on Synops Praxis for prosecutors and investigators. You earn credentials by taking something real from your own casework (reconstructed as a composite, with no confidential detail) and reflecting on it with a coach named Mira, who asks rather than tells. Themes include safety-first scene sequencing, a lawful inspection that survives challenge, eliciting an account without leading, protecting the chain of custody, and the contemporaneous scene record. Every legal point is illustrative and SME sign-off pending. Nothing is graded; a reviewer recognises the work or refers it back with feedback.",
    },
    "/demos/mrb": {
      title: "Manchester Review Board — Synops Praxis Demo",
      description: "A values-driven leadership practice-credentials demo: earn recognition for real leadership — ethical leadership, forming a team, and servant leadership — by bringing something real from your work and reflecting on it with a coach named Mutale.",
      body: "Manchester Review Board is a practice-first leadership demo on Synops Praxis. Instead of a course, you earn credentials by bringing something real you have done as a leader and reflecting on it through a four-move cycle (experience, reflect, name it, try it) with a coach named Mutale. Credentials cover ethical leadership, forming and leading a team, and servant leadership. Nothing is graded; an experienced reviewer recognises your work or refers it back with developmental feedback, and recognised credentials are verifiable.",
    },
  };
  const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  app.get(Object.keys(PAGE_META), (req, res, next) => {
    const meta = PAGE_META[req.path];
    if (!meta) { next(); return; }
    try {
      let html = fs.readFileSync(path.join(clientDist, "index.html"), "utf8");
      const t = escapeHtml(meta.title); const d = escapeHtml(meta.description);
      const tags = [
        `<title>${t}</title>`,
        `<meta name="description" content="${d}" />`,
        `<meta property="og:title" content="${t}" />`,
        `<meta property="og:description" content="${d}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta name="twitter:card" content="summary" />`,
        `<meta name="twitter:title" content="${t}" />`,
        `<meta name="twitter:description" content="${d}" />`,
      ].join("\n    ");
      // Strip the generic tags from the shell so the page-specific ones below are the only ones a
      // fetcher sees (otherwise the earlier, generic "Praxis learning platform" tags win).
      html = html
        .replace(/<title>[\s\S]*?<\/title>/i, "")
        .replace(/<meta\s+name="description"[^>]*>/i, "")
        .replace(/<meta\s+property="og:title"[^>]*>/i, "")
        .replace(/<meta\s+property="og:description"[^>]*>/i, "")
        .replace(/<meta\s+name="twitter:card"[^>]*>/i, "")
        .replace(/<meta\s+name="twitter:title"[^>]*>/i, "")
        .replace(/<meta\s+name="twitter:description"[^>]*>/i, "");
      html = html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
      // A human-readable summary a non-JS fetcher can read. Kept in <noscript> so real browsers (JS on)
      // never render it — no flash — while crawlers and other assistants that read raw HTML still see it.
      const summary = `<noscript><main><h1>${escapeHtml(meta.title)}</h1><p>${escapeHtml(meta.body)}</p></main></noscript>`;
      html = html.replace(/(<body[^>]*>)/i, `$1\n    ${summary}`);
      res.set("Content-Type", "text/html; charset=utf-8").send(html);
    } catch { next(); }
  });

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
