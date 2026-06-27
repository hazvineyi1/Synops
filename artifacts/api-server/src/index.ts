// Must be first: stubs browser globals (DOMMatrix, etc.) before any module that
// imports pdf-parse / pdf.js is loaded, otherwise the process crashes on startup.
import "./lib/pdfPolyfill";

import app from "./app";
import { logger } from "./lib/logger";
import { validateEnv } from "./lib/config";

// Fail fast on a misconfigured environment before binding the port.
validateEnv();

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
// finish, then exit. Railway and most container platforms send SIGTERM on
// deploy/redeploy and SIGINT on local Ctrl-C.
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

  // If connections do not drain within the grace period, force exit so the
  // platform does not kill us uncleanly.
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
