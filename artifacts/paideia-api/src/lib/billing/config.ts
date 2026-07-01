// Pricing + method catalogue for the Coach's African mobile-money billing.
//
// Amounts are in MAJOR currency units (e.g. 3.99 = $3.99, 79 = R79.00) and are
// intentionally easy to tune: edit the `price` blocks below to change what each
// country pays per tier. USD is the anchor (Plus $3.99/mo, Pro $5.99/mo); the
// other currencies are localized estimates - adjust to your real pricing before
// going live.

export type CountryCode = "ZW" | "ZA" | "ZM" | "BW";

export type PaymentMethod =
  | "ecocash"
  | "onemoney"
  | "orange_money"
  | "mtn_momo"
  | "airtel_money"
  | "zamtel"
  | "card"
  | "bank_transfer";

export type BillingInterval = "month" | "year";

// The two paid tiers. "free" is the un-purchasable default and never appears here.
export type TierId = "plus" | "pro";

export interface MethodInfo {
  id: PaymentMethod;
  label: string;
  kind: "mobile_money" | "card" | "bank";
  requiresPhone: boolean;
  note?: string;
}

export const METHODS: Record<PaymentMethod, MethodInfo> = {
  ecocash: { id: "ecocash", label: "EcoCash", kind: "mobile_money", requiresPhone: true },
  onemoney: { id: "onemoney", label: "OneMoney", kind: "mobile_money", requiresPhone: true },
  orange_money: {
    id: "orange_money",
    label: "Orange Money",
    kind: "mobile_money",
    requiresPhone: true,
    note: "Orange Money Botswana has limited gateway support; it may route to card if unavailable.",
  },
  mtn_momo: { id: "mtn_momo", label: "MTN MoMo", kind: "mobile_money", requiresPhone: true },
  airtel_money: { id: "airtel_money", label: "Airtel Money", kind: "mobile_money", requiresPhone: true },
  zamtel: { id: "zamtel", label: "Zamtel Kwacha", kind: "mobile_money", requiresPhone: true },
  card: { id: "card", label: "Debit / Credit card", kind: "card", requiresPhone: false },
  bank_transfer: {
    id: "bank_transfer",
    label: "Bank transfer",
    kind: "bank",
    requiresPhone: false,
    note: "You'll be redirected to complete a secure bank transfer.",
  },
};

// Methods offered in every country, regardless of which gateway serves it. Card
// works through both Paynow (Zimbabwe) and Flutterwave (everywhere else), so any
// new country gets it automatically. Per-country `methods` below only list the
// local / mobile options unique to that country.
export const GLOBAL_METHODS: PaymentMethod[] = ["card"];

export type TierPricing = Record<TierId, Record<BillingInterval, number>>;

export interface CountryInfo {
  code: CountryCode;
  name: string;
  flag: string;
  currency: string;
  methods: PaymentMethod[];
  price: TierPricing;
}

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  ZW: {
    code: "ZW",
    name: "Zimbabwe",
    flag: "\u{1F1FF}\u{1F1FC}",
    currency: "USD",
    methods: ["ecocash", "onemoney"],
    price: {
      plus: { month: 3.99, year: 39.99 },
      pro: { month: 5.99, year: 59.99 },
    },
  },
  ZA: {
    code: "ZA",
    name: "South Africa",
    flag: "\u{1F1FF}\u{1F1E6}",
    currency: "ZAR",
    methods: ["bank_transfer"],
    price: {
      plus: { month: 79, year: 749 },
      pro: { month: 109, year: 1099 },
    },
  },
  ZM: {
    code: "ZM",
    name: "Zambia",
    flag: "\u{1F1FF}\u{1F1F2}",
    currency: "ZMW",
    methods: ["mtn_momo", "airtel_money", "zamtel", "bank_transfer"],
    price: {
      plus: { month: 99, year: 999 },
      pro: { month: 149, year: 1499 },
    },
  },
  BW: {
    code: "BW",
    name: "Botswana",
    flag: "\u{1F1E7}\u{1F1FC}",
    currency: "BWP",
    methods: ["orange_money", "bank_transfer"],
    price: {
      plus: { month: 55, year: 549 },
      pro: { month: 79, year: 799 },
    },
  },
};

export interface TierInfo {
  id: TierId;
  name: string;
  tagline: string;
  features: string[];
}

// Feature ladder. Pro is a superset of Plus; the screen shows Pro's extras as
// "Everything in Plus, plus...".
export const TIERS: Record<TierId, TierInfo> = {
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "For studying every day",
    features: [
      "Unlimited concepts and materials",
      "All four coach personalities",
      "Full daily coaching with saved history",
      "Practice and mock exams",
      "Weekly retrospectives",
      "Concept visuals",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For exam season and power users",
    features: [
      "Everything in Plus",
      "Web-search-backed answers",
      "Priority generation queue",
      "Knowledge map and deeper analytics",
      "Card auto-renew",
      "Early access to new features",
    ],
  },
};

// Where a paid tier sits in the ladder. free < plus < pro.
export const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2 };

// The full, ordered method list a country supports: its local methods first, then
// the global ones (card), de-duplicated. Use this everywhere instead of reading
// COUNTRIES[code].methods directly, so global methods stay consistent.
export function methodsForCountry(country: CountryCode): PaymentMethod[] {
  const seen = new Set<PaymentMethod>();
  const out: PaymentMethod[] = [];
  for (const m of [...COUNTRIES[country].methods, ...GLOBAL_METHODS]) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === "string" && v in COUNTRIES;
}

export function isMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && v in METHODS;
}

export function isInterval(v: unknown): v is BillingInterval {
  return v === "month" || v === "year";
}

export function isTier(v: unknown): v is TierId {
  return v === "plus" || v === "pro";
}

// Price in major units for a given country / tier / interval.
export function priceFor(
  country: CountryCode,
  tier: TierId,
  interval: BillingInterval,
): number {
  return COUNTRIES[country].price[tier][interval];
}

export function toMinor(major: number): number {
  return Math.round(major * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatAmount(currency: string, major: number): string {
  return `${currency} ${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
