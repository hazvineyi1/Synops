import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { isUsAudience } from "@/lib/entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useStudyBillingConfig,
  useStudySubscription,
  useStudyMobileCheckout,
  useStudyCardCheckout,
  useStudyPaymentStatus,
  useStudyCancelSubscription,
  useStudyCouponPreview,
  type BillingCountry,
  type CouponPreview,
  type TierId,
} from "@/hooks/use-study-api";
import {
  ArrowLeft,
  Check,
  Loader2,
  Smartphone,
  CreditCard,
  Landmark,
  ShieldCheck,
  Tag,
  X,
} from "lucide-react";

type Interval = "month" | "year";
const PENDING_KEY = "sc_pending_payment";

function formatMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const TIER_LABEL: Record<string, string> = { plus: "Plus", pro: "Pro" };

export default function StudyUpgrade() {
  const [, setLoc] = useLocation();
  const { data: config, isLoading: configLoading } = useStudyBillingConfig();
  const { data: subscription, refetch: refetchSub } = useStudySubscription();
  const checkout = useStudyMobileCheckout();
  const cardCheckout = useStudyCardCheckout();
  const cancel = useStudyCancelSubscription();
  const couponPreview = useStudyCouponPreview();

  const [tier, setTier] = useState<TierId>("pro");
  const [interval, setInterval] = useState<Interval>("month");
  const [countryCode, setCountryCode] = useState<BillingCountry["code"] | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<CouponPreview | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resume polling after a redirect back from a hosted checkout.
  useEffect(() => {
    const pending = localStorage.getItem(PENDING_KEY);
    if (pending) setActivePaymentId(pending);
  }, []);

  // US audience (from the marketing site / US domain) is billed in USD by card; the
  // African/global audience keeps the country picker + mobile-money rails untouched.
  const isUS = useMemo(() => isUsAudience(), []);

  const country = useMemo(() => {
    const code = isUS ? "ZW" : countryCode; // ZW's currency is USD — the USD anchor
    const found = config?.countries.find((c) => c.code === code);
    if (!found) return null;
    const methods = isUS
      ? found.methods.filter((m) => m.kind === "card") // US: card only
      : found.methods.filter((m) => m.kind !== "card"); // African: mobile money (card hidden)
    return { ...found, methods };
  }, [config, countryCode, isUS]);

  // For US visitors, preselect the card method and enable auto-renew so checkout
  // uses the Stripe card path (requires STRIPE_SECRET_KEY + a card plan configured).
  useEffect(() => {
    if (isUS && country && !method && country.methods[0]) {
      setMethod(country.methods[0].id);
      setAutoRenew(true);
    }
  }, [isUS, country, method]);
  // For showing prices on the tier cards before a country is chosen, fall back
  // to the USD (Zimbabwe) anchor.
  const priceCountry = useMemo(
    () => country ?? config?.countries.find((c) => c.code === "ZW") ?? config?.countries[0] ?? null,
    [country, config],
  );
  const methodInfo = useMemo(
    () => country?.methods.find((m) => m.id === method) ?? null,
    [country, method],
  );

  // A coupon preview is tied to a specific tier/country/interval. Clear it when
  // any of those change so a stale discount cannot be carried into checkout.
  useEffect(() => {
    setCoupon(null);
    setCouponError(null);
  }, [tier, countryCode, interval]);

  const { data: paymentStatus } = useStudyPaymentStatus(activePaymentId);

  useEffect(() => {
    if (!paymentStatus) return;
    if (paymentStatus.status === "paid") {
      localStorage.removeItem(PENDING_KEY);
      refetchSub();
      const t = window.setTimeout(() => setLoc("/coach"), 1800);
      return () => window.clearTimeout(t);
    }
    if (paymentStatus.status === "failed") {
      localStorage.removeItem(PENDING_KEY);
      setActivePaymentId(null);
      setError("That payment did not go through. Please try again.");
    }
    return undefined;
  }, [paymentStatus, refetchSub, setLoc]);

  const currentTier = subscription?.tier ?? "free";
  // Pro is the top tier: they get the managed view. Plus users can still buy
  // their way up to Pro, so they see the checkout flow restricted to Pro.
  const isPro = currentTier === "pro";
  const isPlus = currentTier === "plus";

  // Plus subscribers can only move up to Pro, so lock the selector to Pro.
  useEffect(() => {
    if (isPlus) setTier("pro");
  }, [isPlus]);

  const availableTiers = isPlus
    ? config?.tiers.filter((t) => t.id === "pro") ?? []
    : config?.tiers ?? [];

  const baseAmount = priceCountry ? priceCountry.price[tier][interval] : 0;
  const payAmount = coupon?.valid ? coupon.finalMinor / 100 : baseAmount;
  const payCurrency = priceCountry?.currency ?? "USD";

  async function handleApplyCoupon() {
    setCouponError(null);
    if (!couponInput.trim()) return;
    if (!country) {
      setCouponError("Choose your country first so we can price the discount.");
      return;
    }
    try {
      const result = await couponPreview.mutateAsync({
        code: couponInput.trim(),
        tier,
        country: country.code,
        interval,
      });
      if (!result.valid) {
        setCoupon(null);
        setCouponError(result.reason ?? "This coupon cannot be applied.");
        return;
      }
      setCoupon(result);
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "We could not check that coupon.";
      setCouponError(message);
    }
  }

  function clearCoupon() {
    setCoupon(null);
    setCouponInput("");
    setCouponError(null);
  }

  async function handleContinue() {
    setError(null);
    if (!country || !method) {
      setError("Choose your country and a payment method.");
      return;
    }
    if (methodInfo?.requiresPhone && !phone.trim()) {
      setError("Enter the mobile number for your wallet.");
      return;
    }

    // Card + auto-renew: try a Stripe subscription first. If no live card plan
    // is set up yet (409), quietly fall back to a one-time card charge below.
    if (methodInfo?.kind === "card" && autoRenew) {
      try {
        const { url } = await cardCheckout.mutateAsync({ tier, interval });
        if (url) {
          window.location.href = url;
          return;
        }
      } catch {
        // fall through to one-time card payment
      }
    }

    try {
      const result = await checkout.mutateAsync({
        tier,
        interval,
        country: country.code,
        method,
        mobileNumber: methodInfo?.requiresPhone ? phone.trim() : undefined,
        autoRenew: methodInfo?.kind === "card" ? autoRenew : false,
        couponCode: coupon?.valid ? coupon.code : undefined,
      });
      localStorage.setItem(PENDING_KEY, result.paymentId);
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      setInstructions(result.instructions);
      setActivePaymentId(result.paymentId);
    } catch (e) {
      const message =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "We could not start the payment. Please try again.";
      setError(message);
    }
  }

  // ── Waiting / success state ──
  if (activePaymentId && paymentStatus?.status !== "failed") {
    const paid = paymentStatus?.status === "paid";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {paid ? (
            <>
              <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-7 w-7 text-primary" />
              </div>
              <h1 className="font-serif text-3xl mb-2">
                You're on Coach {TIER_LABEL[subscription?.tier ?? ""] ?? ""}
              </h1>
              <p className="text-muted-foreground">
                Payment confirmed. Taking you back to your coach...
              </p>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto mb-6 h-10 w-10 text-primary animate-spin" />
              <h1 className="font-serif text-3xl mb-3">Waiting for your payment</h1>
              <p className="text-muted-foreground mb-4">
                {instructions ?? paymentStatus?.instructions ?? "Approve the prompt on your phone to continue."}
              </p>
              <p className="text-xs text-muted-foreground">
                This page updates on its own once the payment clears.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (configLoading || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/40">
        <button
          onClick={() => setLoc("/coach")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="font-serif text-lg tracking-tight">Synops</div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {isPro ? (
          <section className="text-center">
            <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-serif text-3xl mb-2">You're on Coach Pro</h1>
            <p className="text-muted-foreground mb-1">
              {subscription?.autoRenew ? "Renews" : "Access through"}{" "}
              {formatDate(subscription?.currentPeriodEnd ?? null)}
            </p>
            {subscription?.provider && (
              <p className="text-xs text-muted-foreground mb-8">
                Paid via {subscription.provider}
                {subscription.interval ? ` \u00b7 ${subscription.interval}ly` : ""}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={async () => {
                  await cancel.mutateAsync();
                  refetchSub();
                }}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelling..." : "Cancel auto-renew"}
              </Button>
            </div>
          </section>
        ) : (
          <>
            {isPlus && (
              <section className="mb-8 rounded-xl border border-border/60 bg-muted/30 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-medium">You're on Coach Plus</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription?.autoRenew ? "Renews" : "Access through"}{" "}
                  {formatDate(subscription?.currentPeriodEnd ?? null)}. Move up to
                  Pro below, or{" "}
                  <button
                    onClick={async () => {
                      await cancel.mutateAsync();
                      refetchSub();
                    }}
                    disabled={cancel.isPending}
                    className="underline hover:text-foreground disabled:opacity-60"
                  >
                    {cancel.isPending ? "cancelling..." : "cancel auto-renew"}
                  </button>
                  .
                </p>
              </section>
            )}
            <section className="mb-8">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Upgrade
              </p>
              <h1 className="font-serif text-3xl md:text-4xl leading-tight mb-3">
                {isPlus ? "Step up to Coach Pro" : "Pick the plan that fits your term"}
              </h1>
              <p className="text-muted-foreground">
                Pay with the mobile money wallet you already use, across
                Zimbabwe, Zambia, South Africa, and Botswana.
              </p>
            </section>

            {/* Interval */}
            <div className="mb-6">
              <div className="inline-flex rounded-lg border border-border/60 p-1">
                {(["month", "year"] as Interval[]).map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
                      interval === iv
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {iv === "month" ? "Monthly" : "Yearly"}
                    {iv === "year" && (
                      <span className="ml-1.5 text-[10px] opacity-80">2 months free</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tier cards */}
            <div
              className={`grid gap-4 mb-10 ${
                availableTiers.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1"
              }`}
            >
              {availableTiers.map((t) => {
                const selected = tier === t.id;
                const price = priceCountry ? priceCountry.price[t.id][interval] : 0;
                const isRecommended = t.id === "pro";
                return (
                  <button
                    key={t.id}
                    onClick={() => setTier(t.id)}
                    className={`relative rounded-xl border p-5 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    {isRecommended && (
                      <span className="absolute top-4 right-4 text-[10px] uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5">
                        Most popular
                      </span>
                    )}
                    <div className="font-serif text-xl mb-0.5">Coach {t.name}</div>
                    <div className="text-xs text-muted-foreground mb-3">{t.tagline}</div>
                    <div className="mb-4">
                      <span className="text-2xl font-medium">
                        {formatMoney(payCurrency, price)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        /{interval === "month" ? "mo" : "yr"}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {t.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            {/* Country, a discreet dropdown so the list scales as more countries
                are added. Payment methods only appear once a country is chosen. */}
            {isUS ? (
              <div className="mb-8 text-xs uppercase tracking-wide text-muted-foreground">
                Billed in USD
              </div>
            ) : (
            <div className="mb-8 max-w-xs">
              <Label htmlFor="country" className="text-xs uppercase tracking-wide text-muted-foreground">
                Your country
              </Label>
              <select
                id="country"
                value={countryCode ?? ""}
                onChange={(e) => {
                  const code = e.target.value;
                  setCountryCode(code ? (code as BillingCountry["code"]) : null);
                  setMethod(null);
                }}
                className="mt-1.5 w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <option value="">Select your country</option>
                {config.countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name} ({formatMoney(c.currency, c.price[tier][interval])}/
                    {interval === "month" ? "mo" : "yr"})
                  </option>
                ))}
              </select>
            </div>
            )}

            {/* Method, revealed only after a country is picked */}
            {country && (
              <div className="mb-8">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Payment method
                </Label>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {country.methods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        method === m.id
                          ? "border-primary bg-primary/5"
                          : "border-border/60 hover:border-border"
                      }`}
                    >
                      {m.kind === "card" ? (
                        <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : m.kind === "bank" ? (
                        <Landmark className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
                {methodInfo?.note && (
                  <p className="text-xs text-muted-foreground mt-2">{methodInfo.note}</p>
                )}
              </div>
            )}

            {/* Phone for mobile money */}
            {methodInfo?.requiresPhone && (
              <div className="mb-8">
                <Label htmlFor="phone">Mobile money number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0771234567"
                  className="mt-1.5 max-w-xs"
                  inputMode="tel"
                />
              </div>
            )}

            {/* Auto-renew for card */}
            {methodInfo?.kind === "card" && (
              <label className="mb-8 flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={(e) => setAutoRenew(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                Renew my card automatically each {interval}
              </label>
            )}

            {/* Coupon */}
            <div className="mb-8">
              <Label htmlFor="coupon" className="text-xs uppercase tracking-wide text-muted-foreground">
                Have a coupon?
              </Label>
              {coupon?.valid ? (
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 max-w-md">
                  <Tag className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{coupon.code}</span> applied
                    <span className="text-muted-foreground">
                      {", you save "}
                      {formatMoney(payCurrency, coupon.discountMinor / 100)}
                    </span>
                  </div>
                  <button
                    onClick={clearCoupon}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Remove coupon"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2 max-w-md">
                  <Input
                    id="coupon"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                    className="uppercase"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyCoupon}
                    disabled={couponPreview.isPending || !couponInput.trim()}
                  >
                    {couponPreview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
              )}
              {couponError && <p className="text-xs text-destructive mt-2">{couponError}</p>}
            </div>

            {error && <p className="text-sm text-destructive mb-4">{error}</p>}

            <div className="flex items-center gap-4 flex-wrap">
              <Button
                size="lg"
                className="gap-2"
                disabled={checkout.isPending || cardCheckout.isPending || !country || !method}
                onClick={handleContinue}
              >
                {(checkout.isPending || cardCheckout.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {country && method
                  ? `Pay ${formatMoney(payCurrency, payAmount)}`
                  : "Continue to payment"}
              </Button>
              {coupon?.valid && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatMoney(payCurrency, baseAmount)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Mobile money renews manually each {interval}; we'll remind you.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
