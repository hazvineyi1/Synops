// Sentry error tracking for the API. Imported as the very first module in
// index.ts so initialisation happens before anything else loads.
//
// It is a no-op unless SENTRY_DSN is set, so local/dev and any environment
// without the DSN run exactly as before. Init is wrapped in try/catch and
// captureError swallows its own failures, so error tracking can never take the
// server down. Set SENTRY_DSN (and optionally SENTRY_ENVIRONMENT) in Railway to
// turn it on; releases are tagged with the Railway commit SHA when available.
import * as Sentry from "@sentry/node";

const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment:
        process.env["SENTRY_ENVIRONMENT"] ??
        process.env["NODE_ENV"] ??
        "development",
      release: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? undefined,
      // Errors only for now (no performance tracing) to keep overhead and cost
      // low. Bump this later if you want transaction/latency data.
      tracesSampleRate: 0,
    });
    // eslint-disable-next-line no-console
    console.log("Sentry error tracking initialised");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Sentry init failed; continuing without it", err);
  }
}

// Safe everywhere: if Sentry was never initialised (no DSN), captureException is
// a no-op, and we still guard against it throwing.
export function captureError(err: unknown): void {
  try {
    Sentry.captureException(err);
  } catch {
    /* never throw from error capture */
  }
}
