// Must be first: initialise Sentry (no-op without SENTRY_DSN) before anything
// else loads, so early startup errors are captured too.
import "./lib/instrument";
import app from "./app";
import { logger } from "./lib/logger";
import {
  pruneDevData,
  ensureOrganizationsSeed,
  ensureDemoUsers,
  ensureStandardsFrameworksSeed,
} from "./lib/seed";
import { initStripe } from "./lib/stripeWebhook";

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

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Seeds run in dependency order:
  // 1. pruneDevData (dev only, opt-in via COMPASS_DEV_RESET=1) clears all
  //    curriculum content and surplus accounts/orgs for a clean slate. Skipped
  //    by default so dev work persists across restarts.
  // 2. ensureOrganizationsSeed (all envs) ensures the internal org exists.
  // 3. ensureDemoUsers (dev only) creates the example accounts if absent.
  void (async () => {
    await pruneDevData(logger);
    const { internalOrgId } = await ensureOrganizationsSeed(logger);
    await ensureDemoUsers(logger, internalOrgId);
    // 4. ensureStandardsFrameworksSeed (all envs) ensures the global CCNE
    //    standards catalog exists for crosswalk + evidence packet features.
    await ensureStandardsFrameworksSeed(logger);
    // 5. initStripe (all envs) ensures the managed billing webhook exists and
    //    caches its signing secret. Degrades gracefully so a Stripe outage or a
    //    missing connection never crashes boot (billing falls back to reconcile).
    await initStripe(logger);
  })().catch((err) => {
    logger.error({ err }, "Failed to run startup seeds");
  });
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then exit. Railway sends SIGTERM on deploy/redeploy; SIGINT is local
// Ctrl-C. Without this, every deploy hard-kills in-flight requests.
let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during graceful shutdown");
      process.exit(1);
    }
    logger.info("Closed remaining connections, exiting cleanly");
    process.exit(0);
  });

  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
