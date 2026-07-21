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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
