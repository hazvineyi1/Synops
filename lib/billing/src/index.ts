import crypto from "node:crypto";

// ----------------------------------------------------------------------------
// Stripe (called over the REST API so we need no SDK dependency).
// Pure plumbing: env-only, no database, shared across all Synops products.
// ----------------------------------------------------------------------------

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function priceIdFor(plan: string): string | undefined {
  if (plan === "yearly") return process.env.STRIPE_PRICE_YEARLY;
  if (plan === "monthly") return process.env.STRIPE_PRICE_MONTHLY;
  return undefined;
}

async function stripePost(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured");
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.append(k, String(v));
  }
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe ${path} failed: ${json?.error?.message ?? res.status}`);
  }
  return json;
}

// Create a Checkout Session for a subscription. Returns the hosted-checkout URL.
export async function createCheckoutSession(opts: {
  priceId: string;
  userId: string;
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<{ url: string }> {
  const params: Record<string, string | number | undefined> = {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": 1,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    allow_promotion_codes: "true",
  };
  if (opts.customerId) params["customer"] = opts.customerId;
  else if (opts.customerEmail) params["customer_email"] = opts.customerEmail;
  if (opts.trialDays && opts.trialDays > 0) {
    params["subscription_data[trial_period_days]"] = opts.trialDays;
  }
  const session = await stripePost("checkout/sessions", params);
  return { url: session.url };
}

// Create a Billing Portal session so the user can manage/cancel their plan.
export async function createPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const session = await stripePost("billing_portal/sessions", {
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
  return { url: session.url };
}

// Verify a Stripe webhook signature without the SDK. Mirrors Stripe's scheme:
// the signed payload is `${timestamp}.${rawBody}`, HMAC-SHA256 with the webhook
// secret, compared (timing-safe) against the v1 signature in the header.
export function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | undefined,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ----------------------------------------------------------------------------
// Flutterwave (REST, no SDK). Standard hosted-payment flow: create a payment to
// get a redirect link, the customer pays, we verify the transaction server-side.
// Amounts here are in MAJOR units (e.g. 19 for $19), unlike Stripe price ids.
// ----------------------------------------------------------------------------

const FLW_API = "https://api.flutterwave.com/v3";

export function flutterwaveConfigured(): boolean {
  return !!process.env.FLW_SECRET_KEY;
}

async function flwFetch(path: string, init: RequestInit): Promise<any> {
  const key = process.env.FLW_SECRET_KEY;
  if (!key) throw new Error("Flutterwave is not configured");
  const res = await fetch(`${FLW_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.status === "error") {
    throw new Error(`Flutterwave ${path} failed: ${json?.message ?? res.status}`);
  }
  return json;
}

// Create a hosted payment and return its checkout URL. `amountMajor` is in the
// currency's main unit (e.g. 250 for ZMW 250). `txRef` must be unique per attempt.
export async function createFlutterwavePayment(opts: {
  txRef: string;
  amountMajor: number;
  currency: string;
  customerEmail: string;
  customerName?: string | null;
  redirectUrl: string;
  title?: string;
  meta?: Record<string, string | number>;
}): Promise<{ link: string }> {
  const json = await flwFetch("payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: opts.txRef,
      amount: opts.amountMajor,
      currency: opts.currency,
      redirect_url: opts.redirectUrl,
      customer: { email: opts.customerEmail, name: opts.customerName ?? undefined },
      meta: opts.meta ?? {},
      customizations: { title: opts.title ?? "Arete Pro" },
    }),
  });
  const link = json?.data?.link;
  if (!link) throw new Error("Flutterwave did not return a payment link");
  return { link };
}

export type FlutterwaveVerification = {
  successful: boolean;
  status: string;
  amount: number; // major units
  currency: string;
  txRef: string | null;
  transactionId: number | null;
  customerEmail: string | null;
  meta: Record<string, any>;
};

// Verify a transaction by its Flutterwave id (returned on redirect / webhook).
export async function verifyFlutterwaveTransaction(transactionId: string | number): Promise<FlutterwaveVerification> {
  const json = await flwFetch(`transactions/${transactionId}/verify`, { method: "GET" });
  const d = json?.data ?? {};
  return {
    successful: d.status === "successful",
    status: d.status ?? "unknown",
    amount: Number(d.amount ?? 0),
    currency: String(d.currency ?? ""),
    txRef: d.tx_ref ?? null,
    transactionId: d.id ?? (typeof transactionId === "number" ? transactionId : Number(transactionId)) ?? null,
    customerEmail: d.customer?.email ?? null,
    meta: d.meta ?? {},
  };
}

// Flutterwave signs webhooks with a static "secret hash" you set in the
// dashboard; it arrives in the `verif-hash` header and must match exactly.
export function verifyFlutterwaveWebhook(signatureHeader: string | undefined): boolean {
  const secret = process.env.FLW_WEBHOOK_HASH;
  if (!secret || !signatureHeader) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
