import app from "./app";
import { logger } from "./lib/logger";
import { initObservability } from "./lib/observability";
import { ensureIntegrityConstraints } from "./lib/dbHardening";

// Fire-and-forget: enables Sentry when SENTRY_DSN is set, otherwise a no-op. Never blocks boot.
void initObservability();
// Fire-and-forget: dedupe + add the unique indexes that make credential/funded-seat/gradebook
// writes race-safe. Never throws; skips any table that isn't present yet.
void ensureIntegrityConstraints();

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
