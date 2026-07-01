import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useUsage } from "@/hooks/use-usage";
import { useAuth } from "@/hooks/use-auth";
import { Check, Sparkles, MailCheck } from "lucide-react";

export default function Upgrade() {
  const { usage, refresh } = useUsage();
  const { refresh: refreshAuth } = useAuth();
  const [, setLoc] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const checkoutStatus = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("checkout") : null;

  useEffect(() => {
    void refresh();
    void refreshAuth();
  }, [refresh, refreshAuth]);

  async function openPortal() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>("/billing/portal");
      window.location.href = r.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open billing portal");
      setBusy(false);
    }
  }

  async function startCheckout() {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ url: string }>("/billing/checkout");
      window.location.href = r.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  async function joinWaitlist() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/billing/waitlist", { note: note.trim() || undefined });
      await refresh();
      setBusy(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not join the waitlist");
      setBusy(false);
    }
  }

  async function leaveWaitlist() {
    setBusy(true);
    try {
      await api.del("/billing/waitlist");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const subscribed = usage?.subscribed === true;
  const paidOpen = usage?.paidPlansEnabled === true;
  const onWaitlist = usage?.onWaitlist === true;

  return (
    <AppShell>
      <header className="mb-8 flex items-start gap-3">
        <Sparkles className="h-7 w-7 text-accent mt-1" />
        <div>
          <h1 className="font-serif text-4xl text-primary mb-2">
            {paidOpen ? "Upgrade Synops Teacher" : "Unlimited is coming soon"}
          </h1>
          <p className="text-muted-foreground">
            {paidOpen
              ? "Free teachers get 10 AI generations per calendar month across lesson plans, worksheets, quizzes, and parent updates. Upgrade for unlimited generations."
              : "Free teachers get 10 AI generations per calendar month. Paid plans aren't open yet. Join the waitlist and we'll let you know the moment they go live."}
          </p>
        </div>
      </header>

      {paidOpen && checkoutStatus === "success" ? (
        <div className="mb-6 rounded-lg border-2 border-primary bg-primary/5 p-4 text-sm">
          Thank you. Your subscription is being activated. It may take a few seconds to reflect here.
        </div>
      ) : paidOpen && checkoutStatus === "cancelled" ? (
        <div className="mb-6 rounded-lg border bg-secondary/30 p-4 text-sm">
          Checkout was cancelled. You can try again any time.
        </div>
      ) : null}

      {usage ? (
        <div className="mb-6 rounded-lg border bg-card p-4 text-sm">
          {subscribed ? (
            <div className="text-primary font-medium">You are on the unlimited plan. Generate as much as you like.</div>
          ) : (
            <div>
              You have used <strong>{usage.used}</strong> of <strong>{usage.limit}</strong> free generations this month.
              {usage.remaining === 0 ? " You have reached the limit." : ` ${usage.remaining} remaining.`}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <div className="rounded-lg border bg-card p-6">
          <div className="font-serif text-2xl text-primary mb-1">Free</div>
          <div className="text-3xl font-semibold mb-4">$0<span className="text-base font-normal text-muted-foreground">/month</span></div>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> 10 AI generations per month</li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Library, sharing, and class profiles</li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Print or save any resource as PDF</li>
          </ul>
        </div>
        <div className="rounded-lg border-2 border-primary bg-card p-6 relative">
          <span className="absolute -top-3 left-6 bg-accent text-white text-xs font-semibold px-2 py-1 rounded">
            {paidOpen ? "Recommended" : "Coming soon"}
          </span>
          <div className="font-serif text-2xl text-primary mb-1">Unlimited</div>
          <div className="text-3xl font-semibold mb-4">$9<span className="text-base font-normal text-muted-foreground">/month</span></div>
          <ul className="space-y-2 text-sm mb-6">
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Unlimited AI generations</li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Everything in Free</li>
            <li className="flex gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Priority support from the founder</li>
          </ul>

          {subscribed ? (
            <div className="space-y-2">
              <Button className="w-full" onClick={openPortal} disabled={busy}>
                {busy ? "Opening..." : "Manage billing"}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setLoc("/dashboard")}>Back to dashboard</Button>
            </div>
          ) : paidOpen ? (
            <Button className="w-full" onClick={startCheckout} disabled={busy}>
              {busy ? "Starting checkout..." : "Upgrade for $9 / month"}
            </Button>
          ) : onWaitlist ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-sm">
                <MailCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-primary">You're on the waitlist</div>
                  <div className="text-muted-foreground text-xs mt-0.5">
                    We'll get in touch the moment paid plans open. Thank you for the support.
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={leaveWaitlist} disabled={busy}>
                {busy ? "Removing..." : "Leave the waitlist"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Anything you'd like the founder to know? (optional)</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. I plan four classes per week and run out of generations by Wednesday."
                  rows={3}
                  maxLength={500}
                />
              </div>
              <Button className="w-full" onClick={joinWaitlist} disabled={busy}>
                {busy ? "Adding you..." : "Notify me when paid plans open"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}
    </AppShell>
  );
}
