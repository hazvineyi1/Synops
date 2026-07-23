// Sentry error tracking for the Kanon API. Imported as the very first module in
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
      tracesSampleRate: 0,
    });
    // eslint-disable-next-line no-console
    console.log("Sentry error tracking initialised");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Sentry init failed; continuing without it", err);
  }
}

/**
 * Report an error to Sentry. Safe everywhere: a no-op when Sentry was never
 * initialised (no DSN), and it never throws from the capture path.
 */
export function captureError(err: unknown): void {
  try {
    Sentry.captureException(err);
  } catch {
    /* never throw from error capture */
  }
}
