import { Router, type IRouter } from "express";
import { db, studyUsersTable, studyPaymentsTable } from "@workspace/paideia-db";
import { eq, sql } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import { getUncachableStripeClient } from "../../lib/stripeClient.js";
import {
  COUNTRIES,
  METHODS,
  TIERS,
  isCountryCode,
  isInterval,
  isMethod,
  isTier,
  methodsForCountry,
  priceFor,
  toMinor,
  type CountryCode,
  type TierId,
} from "../../lib/billing/config.js";
import { resolveProvider, getProviderById, PaymentsNotConfiguredError } from "../../lib/billing/providers/index.js";
import {
  activatePayment,
  getPaymentById,
  getSubscription,
} from "../../lib/billing/service.js";
import { previewCoupon } from "../../lib/billing/coupons.js";

const router: IRouter = Router();
router.use(requireStudyUser);

function publicBaseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:5000";
}

// ─── Mobile-money / card billing (Paynow, Flutterwave, sandbox) ───

// Pricing + supported methods, for the upgrade screen.
router.get("/config", (req, res) => {
  const countryParam = req.query["country"];
  const countries = Object.values(COUNTRIES).map((c) => ({
    ...c,
    methods: methodsForCountry(c.code).map((m) => METHODS[m]),
  }));
  const selected = isCountryCode(countryParam)
    ? countries.find((c) => c.code === countryParam) ?? null
    : null;
  res.json({
    countries,
    selected,
    tiers: Object.values(TIERS),
  });
});

// Validate a coupon against a concrete tier + country + interval, returning the
// discounted price for the upgrade screen. Read-only; does not redeem.
router.post("/coupon/preview", async (req, res) => {
  const { code, tier, country, interval } = req.body ?? {};
  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ error: "A coupon code is required" });
    return;
  }
  if (!isTier(tier) || !isCountryCode(country) || !isInterval(interval)) {
    res.status(400).json({ error: "Invalid tier, country, or interval" });
    return;
  }
  const countryDef = COUNTRIES[country as CountryCode];
  const baseMinor = toMinor(priceFor(country, tier, interval));
  const preview = await previewCoupon({
    code,
    tier,
    currency: countryDef.currency,
    baseMinor,
  });
  res.json({ ...preview, currency: countryDef.currency, baseMinor });
});

// Current subscription state for the signed-in learner.
router.get("/subscription", async (req, res) => {
  const sub = await getSubscription(req.studyUser!.id);
  res.json(sub);
});

// Begin a mobile-money or local-card payment. Returns either a redirect URL
// (card / web checkout) or polling info (mobile money push prompt).
router.post("/mobile/checkout", async (req, res) => {
  const user = req.studyUser!;
  const { tier, interval, country, method, mobileNumber, autoRenew, couponCode } = req.body ?? {};

  if (!isTier(tier) || !isInterval(interval) || !isCountryCode(country) || !isMethod(method)) {
    res.status(400).json({ error: "Invalid tier, interval, country, or method" });
    return;
  }
  const countryDef = COUNTRIES[country as CountryCode];
  if (!methodsForCountry(country as CountryCode).includes(method)) {
    res.status(400).json({ error: `${method} is not available in ${countryDef.name}` });
    return;
  }
  const methodDef = METHODS[method];
  if (methodDef.requiresPhone && !mobileNumber) {
    res.status(400).json({ error: "A mobile number is required for mobile money" });
    return;
  }

  const baseMinor = toMinor(priceFor(country, tier as TierId, interval));
  let amountMinor = baseMinor;
  let discountMinor = 0;
  let appliedCoupon: string | null = null;

  // Re-validate any coupon server-side so a tampered client cannot self-discount.
  if (typeof couponCode === "string" && couponCode.trim()) {
    const preview = await previewCoupon({
      code: couponCode,
      tier: tier as TierId,
      currency: countryDef.currency,
      baseMinor,
    });
    if (!preview.valid) {
      res.status(400).json({ error: preview.reason ?? "This coupon cannot be applied." });
      return;
    }
    amountMinor = preview.finalMinor;
    discountMinor = preview.discountMinor;
    appliedCoupon = preview.code ?? null;
  }

  const amountMajor = amountMinor / 100;
  const reference = `SC-${user.id.slice(0, 8)}-${Date.now()}`;

  // Fail closed: in production with no live gateway configured, resolveProvider
  // throws rather than falling back to the auto-approving mock. Surface that as a
  // clean "not available yet" instead of a 500, and never create a payment row.
  let provider: ReturnType<typeof resolveProvider>;
  try {
    provider = resolveProvider(country, method);
  } catch (err) {
    if (err instanceof PaymentsNotConfiguredError) {
      res.status(503).json({
        error: "Payments are not available yet. Please check back soon.",
      });
      return;
    }
    throw err;
  }

  const returnUrl = `${publicBaseUrl()}/study/upgrade?ref=${reference}`;
  const resultUrl = `${publicBaseUrl()}/api/study/billing/webhook/${provider.id}`;

  // Persist the attempt up front so polling/webhooks have a row to update.
  const inserted = await db
    .insert(studyPaymentsTable)
    .values({
      userId: user.id,
      provider: provider.id,
      method,
      country,
      currency: countryDef.currency,
      amountMinor,
      tier,
      couponCode: appliedCoupon,
      discountMinor,
      interval,
      reference,
      mobileNumber: mobileNumber ?? null,
      status: "pending",
    })
    .returning({ id: studyPaymentsTable.id });
  const paymentId = inserted[0]!.id;

  // Record the auto-renew preference (mobile money still renews manually).
  if (typeof autoRenew === "boolean") {
    await db
      .update(studyUsersTable)
      .set({ autoRenew })
      .where(eq(studyUsersTable.id, user.id));
  }

  try {
    const result = await provider.initiate({
      reference,
      amountMajor,
      amountMinor,
      currency: countryDef.currency,
      country,
      method,
      interval,
      mobileNumber: mobileNumber ?? undefined,
      email: user.email,
      name: user.name,
      returnUrl,
      resultUrl,
    });

    await db
      .update(studyPaymentsTable)
      .set({
        providerRef: result.providerRef ?? null,
        pollUrl: result.pollUrl ?? null,
        redirectUrl: result.redirectUrl ?? null,
        instructions: result.instructions ?? null,
        raw: result.raw ?? null,
        updatedAt: new Date(),
      })
      .where(eq(studyPaymentsTable.id, paymentId));

    res.json({
      paymentId,
      provider: provider.id,
      sandbox: provider.id === "mock",
      status: result.status,
      redirectUrl: result.redirectUrl ?? null,
      instructions: result.instructions ?? null,
      requiresPolling: !result.redirectUrl,
    });
  } catch (err) {
    await db
      .update(studyPaymentsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(studyPaymentsTable.id, paymentId));
    const message = err instanceof Error ? err.message : "Payment could not be started";
    res.status(502).json({ error: message });
  }
});

// Poll a payment's status. On success, activates the subscription.
router.get("/payment/:id", async (req, res) => {
  const user = req.studyUser!;
  const payment = await getPaymentById(req.params.id);
  if (!payment || payment.userId !== user.id) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }

  if (payment.status === "paid") {
    res.json({ status: "paid", paid: true, subscription: await getSubscription(user.id) });
    return;
  }
  if (payment.status === "failed") {
    res.json({ status: "failed", paid: false });
    return;
  }

  // Resolve by the provider that actually initiated this payment (persisted on
  // the row), never by current env - keys may have changed mid-flight.
  const provider = getProviderById(payment.provider);
  const result = await provider.checkStatus({
    reference: payment.reference,
    providerRef: payment.providerRef,
    pollUrl: payment.pollUrl,
  });

  if (result.status === "paid") {
    await activatePayment(payment.reference, result.raw);
    res.json({ status: "paid", paid: true, subscription: await getSubscription(user.id) });
    return;
  }
  if (result.status === "failed") {
    await db
      .update(studyPaymentsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(studyPaymentsTable.id, payment.id));
    res.json({ status: "failed", paid: false });
    return;
  }
  res.json({ status: "pending", paid: false, instructions: payment.instructions });
});

// Turn off auto-renew. Access remains until the current period ends.
router.post("/cancel", async (req, res) => {
  const user = req.studyUser!;
  await db
    .update(studyUsersTable)
    .set({ autoRenew: false, subscriptionStatus: "canceled" })
    .where(eq(studyUsersTable.id, user.id));
  res.json(await getSubscription(user.id));
});

// ─── Stripe (card auto-renew) ───

// Find an active recurring Stripe price for the Coach Pro plan, matching the
// requested billing interval. The product MUST be tagged with metadata
// paideia_plan=coach so we never attach an unrelated plan's price (e.g. the
// Teacher plan) to a Coach learner. Returns null when no such plan is configured
// yet, which lets the caller fall back to a one-time card payment.
async function findActivePriceId(
  interval: "month" | "year",
  tier: TierId,
): Promise<string | null> {
  const result = (await db.execute(sql`
    SELECT pr.id
    FROM stripe.prices pr
    JOIN stripe.products p ON p.id = pr.product
    WHERE pr.active = true
      AND p.active = true
      AND pr.recurring IS NOT NULL
      AND (pr.recurring ->> 'interval') = ${interval}
      AND (p.metadata ->> 'paideia_plan') = 'coach'
      AND (p.metadata ->> 'paideia_tier') = ${tier}
    ORDER BY pr.created DESC
    LIMIT 1
  `)) as unknown as { rows: Array<{ id: string }> };
  return result.rows[0]?.id ?? null;
}

async function ensureCustomer(userId: string, email: string, name: string): Promise<string> {
  return db.transaction(async (tx) => {
    const rows = (await tx.execute(sql`
      SELECT stripe_customer_id FROM study_users
      WHERE id = ${userId} FOR UPDATE
    `)) as unknown as { rows: Array<{ stripe_customer_id: string | null }> };
    const existing = rows.rows[0]?.stripe_customer_id;
    if (existing) return existing;
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { studyUserId: userId },
    });
    await tx
      .update(studyUsersTable)
      .set({ stripeCustomerId: customer.id })
      .where(eq(studyUsersTable.id, userId));
    return customer.id;
  });
}

router.post("/checkout", async (req, res) => {
  const user = req.studyUser!;
  const { priceId, successUrl, cancelUrl } = req.body;

  if (!priceId || !successUrl || !cancelUrl) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const customerId = await ensureCustomer(user.id, user.email, user.name);
  const stripe = await getUncachableStripeClient();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { studyUserId: user.id },
  });

  res.json({ sessionId: session.id, url: session.url ?? "" });
});

// Card auto-renew via a Stripe subscription. The price is discovered from the
// connected Stripe account, so the frontend does not need to know price IDs.
// Returns 409 when no live Stripe plan exists yet, letting the Upgrade screen
// fall back to a one-time card charge through the local gateway.
router.post("/card/checkout", async (req, res) => {
  const user = req.studyUser!;
  const { interval, tier } = req.body ?? {};
  if (!isInterval(interval) || !isTier(tier)) {
    res.status(400).json({ error: "Invalid interval or tier" });
    return;
  }

  const priceId = await findActivePriceId(interval, tier as TierId);
  if (!priceId) {
    res.status(409).json({ error: "card_autopay_unavailable" });
    return;
  }

  const customerId = await ensureCustomer(user.id, user.email, user.name);
  const stripe = await getUncachableStripeClient();
  const base = publicBaseUrl();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${base}/study/upgrade?stripe=success`,
    cancel_url: `${base}/study/upgrade?stripe=cancel`,
    metadata: { studyUserId: user.id, interval, tier },
    subscription_data: { metadata: { studyUserId: user.id, tier } },
  });

  res.json({ url: session.url ?? "" });
});

router.post("/portal", async (req, res) => {
  const user = req.studyUser!;
  if (!user.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer" });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: req.body.returnUrl ?? `${publicBaseUrl()}/study/settings`,
  });
  res.json({ url: session.url ?? "" });
});

export default router;
