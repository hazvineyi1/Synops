import type { CountryCode, PaymentMethod } from "../config.js";
import type { PaymentProvider } from "../types.js";
import { paynowProvider } from "./paynow.js";
import { flutterwaveProvider } from "./flutterwave.js";
import { mockProvider } from "./mock.js";

export { paynowProvider, flutterwaveProvider, mockProvider };

// Thrown when a real payment is requested but no live gateway is configured and
// the mock is not allowed (i.e. production). Callers should translate this into a
// clean "payments unavailable" response rather than a 500.
export class PaymentsNotConfiguredError extends Error {
  constructor(public readonly gateway: string) {
    super(`No live payment gateway configured for ${gateway}`);
    this.name = "PaymentsNotConfiguredError";
  }
}

// Which live gateway owns a given country. Zimbabwe -> Paynow (EcoCash/OneMoney);
// everything else -> Flutterwave.
function liveProviderFor(country: CountryCode): PaymentProvider {
  if (country === "ZW") return paynowProvider;
  return flutterwaveProvider;
}

// Resolve the provider to actually use.
//
// The mock provider auto-approves payments without charging anyone, so it must
// NEVER run live. In production we fail closed: if the live gateway has no keys,
// we throw instead of silently handing out paid tiers for free. Non-production
// falls back to the mock so the flow stays testable, and a controlled production
// demo can opt in explicitly with BILLING_ALLOW_MOCK=true.
export function resolveProvider(
  country: CountryCode,
  _method: PaymentMethod,
): PaymentProvider {
  const live = liveProviderFor(country);
  if (live.isConfigured()) return live;

  const isProd = process.env["NODE_ENV"] === "production";
  const allowMock = process.env["BILLING_ALLOW_MOCK"] === "true";
  if (isProd && !allowMock) {
    throw new PaymentsNotConfiguredError(live.id);
  }
  return mockProvider;
}

export function getProviderById(id: string): PaymentProvider {
  switch (id) {
    case "paynow":
      return paynowProvider;
    case "flutterwave":
      return flutterwaveProvider;
    default:
      return mockProvider;
  }
}
