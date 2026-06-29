import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, CreditCard, Wallet, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Plan = {
  id: number;
  code: string;
  name: string;
  interval: "monthly" | "yearly";
  region: string;
  currency: string;
  amount_minor: number;
  processor: "stripe" | "flutterwave";
};

type Method = {
  id: number;
  code: string;
  label: string;
  rail: "stripe" | "flutterwave" | "paynow" | "manual";
  instructions: string | null;
};

function fmt(currency: string, minor: number): string {
  return `${currency} ${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

// Region-aware upgrade: pulls the price catalog + accepted payment methods for
// the learner's region and routes each plan to the right rail (Stripe or
// Flutterwave). Manual methods (Remitly, bank deposit) show pay instructions.
export function UpgradePanel() {
  const { toast } = useToast();
  const [billing, setBilling] = useState<any | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [busy, setBusy] = useState<number | "legacy-monthly" | "legacy-yearly" | null>(null);
  const [openManual, setOpenManual] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);

  function loadStatus() {
    fetch("/api/billing/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setBilling)
      .catch(() => {});
  }

  useEffect(() => {
    loadStatus();
    fetch("/api/billing/plans", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => setPlans(d.plans ?? []))
      .catch(() => {});
    fetch("/api/billing/methods", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { methods: [] }))
      .then((d) => setMethods(d.methods ?? []))
      .catch(() => {});
  }, []);

  // Handle the Flutterwave redirect-back: verify, then refresh status.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("flw") !== "return") return;
    const txId = q.get("transaction_id");
    const txRef = q.get("tx_ref");
    const status = q.get("status");
    // Clean the URL regardless of outcome.
    const clean = () => window.history.replaceState({}, "", window.location.pathname);
    if (!txId || status === "cancelled") {
      toast({ title: "Payment cancelled", description: "No charge was made." });
      clean();
      return;
    }
    setVerifying(true);
    fetch(`/api/billing/flutterwave/verify?transaction_id=${encodeURIComponent(txId)}&tx_ref=${encodeURIComponent(txRef ?? "")}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          toast({ title: "You're on Pro 🎉", description: "Your payment went through. Enjoy!" });
          loadStatus();
        } else {
          toast({ title: "Payment not completed", description: "We couldn't confirm the payment.", variant: "destructive" });
        }
      })
      .catch(() => toast({ title: "Could not verify payment", description: "Please contact support.", variant: "destructive" }))
      .finally(() => {
        setVerifying(false);
        clean();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay(plan: Plan) {
    setBusy(plan.id);
    try {
      const endpoint = plan.processor === "flutterwave" ? "/api/billing/flutterwave/checkout" : "/api/billing/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({ title: "Could not start payment", description: data?.error ?? "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Could not start payment", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function payLegacy(plan: "monthly" | "yearly") {
    setBusy(plan === "monthly" ? "legacy-monthly" : "legacy-yearly");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({ title: "Could not start checkout", description: data?.error ?? "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Could not start checkout", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function manageBilling() {
    setBusy(-1);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({ title: "Could not open billing", description: data?.error ?? "Please try again.", variant: "destructive" });
    } catch {
      toast({ title: "Could not open billing", description: "Please try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const isActive = billing?.subscriptionStatus === "active" || billing?.tier === "pro";
  const expiresAt = billing?.subscriptionExpiresAt ? new Date(billing.subscriptionExpiresAt) : null;
  const manualMethods = methods.filter((m) => m.rail === "manual");
  const liveMethods = methods.filter((m) => m.rail !== "manual");

  return (
    <Card className="shadow-sm border-border bg-card mt-6">
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> Subscription
        </CardTitle>
        <CardDescription>
          {!billing
            ? "Loading your plan…"
            : isActive
              ? billing.inTrial
                ? "You're on a Pro trial. Pro unlocks unlimited concepts, all four coaches, and weekly retrospectives."
                : `You're on Pro: unlimited concepts, all four coaches, and weekly retrospectives.${expiresAt ? ` Renews/expires ${expiresAt.toLocaleDateString()}.` : ""}`
              : "You're on the Free plan: up to 20 concepts and one coach. Upgrade to Pro for unlimited concepts, all four coaches, and weekly retrospectives."}
        </CardDescription>
      </CardHeader>

      {verifying && (
        <CardContent className="pt-0">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Confirming your payment…
          </p>
        </CardContent>
      )}

      {!isActive && (
        <CardContent className="space-y-4">
          {plans.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pay(p)}
                  disabled={busy !== null}
                  className="flex items-center justify-between rounded-lg border border-border p-4 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  <div>
                    <div className="font-medium text-foreground">{p.name} · {p.interval}</div>
                    <div className="text-xs text-muted-foreground capitalize">via {p.processor}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">{fmt(p.currency, p.amount_minor)}</span>
                    {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-primary" />}
                  </div>
                </button>
              ))}
            </div>
          ) : billing?.stripeEnabled ? (
            // Fallback to env-configured Stripe prices until the catalog is seeded.
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="gap-2" onClick={() => payLegacy("monthly")} disabled={busy !== null}>
                {busy === "legacy-monthly" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Upgrade — {billing.prices?.monthly?.label ?? "$19 / month"}
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => payLegacy("yearly")} disabled={busy !== null}>
                Yearly — {billing.prices?.yearly?.label ?? "$149 / year"}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Billing is not configured in this environment yet.</p>
          )}

          {liveMethods.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs text-muted-foreground mr-1">Accepted here:</span>
              {liveMethods.map((m) => (
                <Badge key={m.id} variant="secondary" className="font-normal">{m.label}</Badge>
              ))}
            </div>
          )}

          {manualMethods.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed border-border p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Wallet className="w-4 h-4 text-primary" /> Pay another way
              </p>
              {manualMethods.map((m) => (
                <div key={m.id} className="text-sm">
                  <button
                    className="flex w-full items-center justify-between text-left text-foreground"
                    onClick={() => setOpenManual(openManual === m.id ? null : m.id)}
                  >
                    <span>{m.label}</span>
                    <ChevronDown className={`w-4 h-4 transition ${openManual === m.id ? "rotate-180" : ""}`} />
                  </button>
                  {openManual === m.id && m.instructions && (
                    <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{m.instructions}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}

      {billing?.hasStripeCustomer && (
        <CardContent className={isActive ? "" : "pt-0"}>
          <Button variant="outline" className="gap-2" onClick={manageBilling} disabled={busy !== null}>
            <CreditCard className="w-4 h-4" /> Manage billing
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
