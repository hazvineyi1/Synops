import { logger } from "./logger";

/**
 * Centralised, fail-fast environment configuration.
 *
 * `validateEnv()` runs once at startup (see index.ts). If a required variable
 * is missing it throws a single aggregated error listing everything that is
 * wrong, so a misconfigured deploy fails immediately and visibly instead of
 * crashing later on the first request that happens to need the value.
 */

export const isProduction = process.env.NODE_ENV === "production";

function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "";
}

/**
 * Parse the comma-separated ALLOWED_ORIGINS (falling back to APP_URL) into a
 * list of allowed web origins for CORS. An empty list means "same-origin only",
 * which is the safe default because the SPA is served from the same origin as
 * the API and therefore never needs cross-origin access.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.APP_URL ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Always required for the app to function at all.
  const required = [
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "ANTHROPIC_API_KEY",
  ];
  for (const name of required) {
    if (!present(name)) missing.push(name);
  }

  // Stripe is optional (billing degrades gracefully when unset), but a partial
  // configuration is almost always a mistake, so the group is required together.
  const stripeKeys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_MONTHLY",
    "STRIPE_PRICE_YEARLY",
  ];
  const stripeSet = stripeKeys.filter((k) => present(k));
  if (stripeSet.length > 0 && stripeSet.length < stripeKeys.length) {
    const stripeMissing = stripeKeys.filter((k) => !present(k));
    missing.push(
      ...stripeMissing.map(
        (k) => `${k} (required because other STRIPE_* vars are set)`,
      ),
    );
  } else if (stripeSet.length === 0) {
    warnings.push(
      "Stripe is not configured (no STRIPE_* vars). Billing and Pro upgrades are disabled.",
    );
  }

  // Flutterwave is optional (regional mobile-money / card rail). The secret key
  // enables charging; the webhook hash enables server-to-server confirmation.
  const flwKeys = ["FLW_SECRET_KEY", "FLW_WEBHOOK_HASH"];
  const flwSet = flwKeys.filter((k) => present(k));
  if (flwSet.length > 0 && flwSet.length < flwKeys.length) {
    const flwMissing = flwKeys.filter((k) => !present(k));
    missing.push(
      ...flwMissing.map((k) => `${k} (required because other FLW_* vars are set)`),
    );
  } else if (flwSet.length === 0) {
    warnings.push(
      "Flutterwave is not configured (no FLW_* vars). African mobile-money / card payments are disabled.",
    );
  }

  // Production-only safety checks.
  if (isProduction) {
    // ENABLE_TEST_LOGIN is a dev-only auth bypass and must never run in prod.
    if (present("ENABLE_TEST_LOGIN")) {
      missing.push(
        "ENABLE_TEST_LOGIN must NOT be set in production (it is a dev-only auth bypass)",
      );
    }
    if (getAllowedOrigins().length === 0) {
      warnings.push(
        "Neither ALLOWED_ORIGINS nor APP_URL is set. CORS will allow same-origin requests only.",
      );
    }
  }

  for (const w of warnings) logger.warn(w);

  if (missing.length > 0) {
    throw new Error(
      "Invalid environment configuration. Fix the following before starting:\n" +
        missing.map((m) => `  - ${m}`).join("\n"),
    );
  }

  logger.info("Environment configuration validated");
}
