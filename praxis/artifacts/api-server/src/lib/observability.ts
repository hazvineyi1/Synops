import { logger } from "./logger";

/**
 * Optional Sentry error monitoring. Deliberately dependency-optional: it only activates when
 * SENTRY_DSN is set AND @sentry/node resolves, and it NEVER throws from a capture path. This means
 * the service runs identically whether or not Sentry is configured, and a missing/broken telemetry
 * package can never take down a request or the boot. Set SENTRY_DSN in the Railway env to enable.
 */
let sentry: any = null;

export async function initObservability(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.info("Sentry disabled (no SENTRY_DSN)");
    return;
  }
  try {
    // Indirect specifier so the type checker and bundler treat this as a
    // runtime-optional dependency (@sentry/node is not a declared dependency;
    // it only resolves when the operator installs it alongside SENTRY_DSN).
    const sentryPkg = "@sentry/node";
    const mod: any = await import(/* @vite-ignore */ sentryPkg);
    mod.init({
      dsn,
      environment: process.env.NODE_ENV ?? "production",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
      sendDefaultPii: false,
    });
    sentry = mod;
    logger.info("Sentry error monitoring enabled");
  } catch (err) {
    logger.warn({ err }, "SENTRY_DSN set but @sentry/node unavailable; error monitoring disabled");
  }
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* telemetry must never throw */
  }
}
