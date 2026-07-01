import type { CountryCode, PaymentMethod } from "../config.js";
import type { PaymentProvider } from "../types.js";
import { paynowProvider } from "./paynow.js";
import { flutterwaveProvider } from "./flutterwave.js";
import { mockProvider } from "./mock.js";

export { paynowProvider, flutterwaveProvider, mockProvider };

// Which live gateway owns a given country. Zimbabwe -> Paynow (EcoCash/OneMoney);
// everything else -> Flutterwave.
function liveProviderFor(country: CountryCode): PaymentProvider {
  if (country === "ZW") return paynowProvider;
  return flutterwaveProvider;
}

// Resolve the provider to actually use. Falls back to the sandbox mock when the
// live gateway has no keys configured yet, so the flow is always testable.
export function resolveProvider(
  country: CountryCode,
  _method: PaymentMethod,
): PaymentProvider {
  const live = liveProviderFor(country);
  return live.isConfigured() ? live : mockProvider;
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
