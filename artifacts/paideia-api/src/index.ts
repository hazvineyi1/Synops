// Must be first: initialises Sentry (no-op without SENTRY_DSN) before anything
// else loads, so early startup errors are captured too.
import "./instrument";
import app from "./app";
import { logger } from "./lib/logger";
import { getStripeSync } from "./lib/stripeClient";
import { recoverStuckSubmissions } from "./lib/gradingQueue";

async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set; skipping Stripe init");
    return;
  }
  try {
    const { runMigrations } = await import("stripe-replit-sync");
    await runMigrations({ databaseUrl });
    const sync = await getStripeSync();
    const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    if (replitDomain) {
      const webhookUrl = `https://${replitDomain}/api/stripe/webhook`;
      await sync.findOrCreateManagedWebhook(webhookUrl);
      logger.info({ webhookUrl }, "Stripe managed webhook ready");
    }
    await sync.syncBackfill();
    logger.info("Stripe sync complete");
  } catch (err) {
    logger.error({ err }, "Stripe initialisation failed");
  }
}

void initStripe();

void (async () => {
  try {
    const n = await recoverStuckSubmissions();
    if (n > 0) logger.info({ requeued: n }, "Re-queued stuck submissions for grading");
  } catch (err) {
    logger.error({ err }, "Failed to recover stuck submissions");
  }
})();

// Sweeper: every 60s look for submissions stuck >2min and re-enqueue them.
// Pairs with the atomic claim in gradeSubmissionWithAi so duplicate enqueues are safe.
const gradingSweeper = setInterval(() => {
  void recoverStuckSubmissions().catch((err: unknown) => {
    logger.error({ err }, "Grading sweeper run failed");
  });
}, 60_000);
gradingSweeper.unref();

// Embed the Compass Curriculum Builder API (its frontend is served at /builder/).
// GUARDED: only mounts when SESSION_SECRET is configured, and any import/setup
// failure is caught so it can never crash this host (Coach + marketing + the
// synops-consulting deployment). Mounted at "/api" so paths match the Compass
// generated client (e.g. /api/compass/clients); the SPA fallback already excludes
// /api, and paideia's own /api routers are registered first, so a Coach request
// (/api/study/*) is answered before ever reaching the Compass mount. Its routes
// stay non-functional until the Compass DB tables + user_sessions exist (Phase 3).
void (async () => {
  if (!process.env["SESSION_SECRET"]) {
    logger.info("SESSION_SECRET not set; Compass builder API not mounted (dormant)");
    return;
  }
  // Compass MUST run against its own database (COMPASS_DATABASE_URL): 31 of its 35
  // table names collide with tables in the shared host Postgres, so falling back
  // to DATABASE_URL here would point it at the wrong instance. Stay dormant until
  // its dedicated DB is configured.
  if (!process.env["COMPASS_DATABASE_URL"]) {
    logger.info("COMPASS_DATABASE_URL not set; Compass builder API not mounted (dormant)");
    return;
  }
  try {
    const { createCompassMount } = await import("@workspace/compass-api/mount");
    app.use("/api", createCompassMount());
    logger.info("Compass Curriculum Builder API mounted at /api");
  } catch (err) {
    logger.error({ err }, "Failed to mount Compass builder API; skipping (host unaffected)");
  }
})();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
