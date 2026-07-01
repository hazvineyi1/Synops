import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useAmbassadorStatus,
  useAmbassadorDashboard,
  useAmbassadorJoin,
  useAmbassadorSetPayoutMethod,
  useAmbassadorCashout,
  type AmbassadorPayout,
  type AmbassadorCommissionEvent,
} from "@/hooks/use-study-api";
import { ArrowLeft, Loader2, Copy, Check, Wallet, Users, TrendingUp } from "lucide-react";

function usd(minor: number): string {
  return `$${(minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const METHOD_LABELS: Record<string, string> = {
  ecocash: "EcoCash",
  mpesa: "M-Pesa",
  mukuru: "Mukuru",
  bank_transfer: "Bank transfer",
};

function methodLabel(value: string): string {
  return METHOD_LABELS[value] ?? value;
}

function eventStateLabel(state: string): string {
  if (state === "pending") return "Holdback";
  if (state === "confirmed") return "Confirmed";
  if (state === "clawed_back") return "Reversed";
  return state;
}

function payoutStatusLabel(status: string): string {
  if (status === "requested") return "Requested";
  if (status === "processing") return "Processing";
  if (status === "paid") return "Paid";
  if (status === "failed") return "Failed";
  return status;
}

export default function StudyAmbassador() {
  const [, setLoc] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const statusQuery = useAmbassadorStatus();
  const enrolled = statusQuery.data?.enrolled ?? false;
  const eligible = statusQuery.data?.eligible ?? false;
  const dashboard = useAmbassadorDashboard(enrolled);

  const join = useAmbassadorJoin();
  const setPayout = useAmbassadorSetPayoutMethod();
  const cashout = useAmbassadorCashout();

  const [copied, setCopied] = useState(false);
  const [payoutMethod, setPayoutMethodValue] = useState("");
  const [payoutHandle, setPayoutHandle] = useState("");

  const program = statusQuery.data?.program ?? dashboard.data?.program;
  const payoutMethods = program?.payoutMethods ?? [];

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["ambassadorStatus"] });
    queryClient.invalidateQueries({ queryKey: ["ambassadorDashboard"] });
  }

  async function handleJoin() {
    try {
      await join.mutateAsync();
      refresh();
      toast({ title: "You are in", description: "Your referral link is ready to share." });
    } catch (e) {
      toast({
        title: "Could not join",
        description: errMessage(e, "Please try again."),
        variant: "destructive",
      });
    }
  }

  async function handleSavePayout() {
    if (!payoutMethod || payoutHandle.trim().length < 3) {
      toast({
        title: "Missing details",
        description: "Choose a method and enter your account details.",
        variant: "destructive",
      });
      return;
    }
    try {
      await setPayout.mutateAsync({ payoutMethod, payoutHandle: payoutHandle.trim() });
      refresh();
      toast({ title: "Payout method saved" });
    } catch (e) {
      toast({
        title: "Could not save",
        description: errMessage(e, "Please try again."),
        variant: "destructive",
      });
    }
  }

  async function handleCashout() {
    try {
      const res = await cashout.mutateAsync();
      refresh();
      toast({
        title: "Cash-out requested",
        description: `${usd(res.payout.amountUsdMinor)} is on its way for review.`,
      });
    } catch (e) {
      toast({
        title: "Cash-out failed",
        description: errMessage(e, "Please try again."),
        variant: "destructive",
      });
    }
  }

  function copyLink(code: string) {
    const link = `${window.location.origin}${import.meta.env.BASE_URL}signup?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (statusQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" className="gap-1.5 mb-4" onClick={() => setLoc("/dashboard")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>

        <h1 className="text-2xl font-semibold mb-1">Ambassador program</h1>
        <p className="text-muted-foreground mb-6">
          Earn a recurring share of every payment from learners you refer.
        </p>

        {!enrolled ? (
          <Card>
            <CardHeader>
              <CardTitle>Join the program</CardTitle>
              <CardDescription>
                Open to learners on a paid plan. Share your link, and earn on real payments from the
                learners who join through it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {program && (
                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                  <li>
                    Commission tapers over time: {program.schedule.map((b) => `${b.ratePct}%`).join(", ")}.
                  </li>
                  <li>Earnings clear after a {program.holdbackDays} day holdback.</li>
                  <li>
                    Cash out in {usd(program.cashoutIncrementUsdMinor)} increments once your balance
                    qualifies.
                  </li>
                </ul>
              )}
              {eligible ? (
                <Button onClick={handleJoin} disabled={join.isPending} className="gap-2">
                  {join.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Join now
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    The ambassador program is available to learners on a paid plan. Upgrade to Plus
                    or Pro to join and start earning.
                  </p>
                  <Button onClick={() => setLoc("/upgrade")} className="gap-2">
                    Upgrade to join
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ) : dashboard.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dashboard.data ? (
          <div className="space-y-6">
            {dashboard.data.profile.status === "suspended" && (
              <Card className="border-destructive">
                <CardContent className="py-4 text-sm text-destructive">
                  Your ambassador account is suspended. Please contact support.
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Your referral link</CardTitle>
                  {dashboard.data.profile.tier === "lifetime" && <Badge>Lifetime</Badge>}
                </div>
                <CardDescription>Share this link. New sign-ups are credited to you.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${window.location.origin}${import.meta.env.BASE_URL}signup?ref=${dashboard.data.profile.referralCode}`}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyLink(dashboard.data!.profile.referralCode)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Code: <span className="font-mono">{dashboard.data.profile.referralCode}</span>
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Available now"
                value={usd(dashboard.data.balances.availableUsdMinor)}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="In holdback"
                value={usd(dashboard.data.balances.pendingUsdMinor)}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Lifetime earned"
                value={usd(dashboard.data.balances.lifetimeEarnedUsdMinor)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Cash out</CardTitle>
                <CardDescription>
                  You can withdraw {usd(dashboard.data.balances.cashableUsdMinor)} now. Cash-outs are
                  made in {usd(dashboard.data.program.cashoutIncrementUsdMinor)} increments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleCashout}
                  disabled={
                    cashout.isPending ||
                    dashboard.data.balances.cashableUsdMinor <= 0 ||
                    !dashboard.data.profile.payoutMethod
                  }
                  className="gap-2"
                >
                  {cashout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Request cash-out
                </Button>
                {!dashboard.data.profile.payoutMethod && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Set a payout method below before cashing out.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payout method</CardTitle>
                <CardDescription>
                  {dashboard.data.profile.payoutMethod
                    ? `Currently ${methodLabel(dashboard.data.profile.payoutMethod)}: ${dashboard.data.profile.payoutHandle ?? ""}`
                    : "Tell us where to send your money."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={payoutMethod} onValueChange={setPayoutMethodValue}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a method" />
                      </SelectTrigger>
                      <SelectContent>
                        {payoutMethods.map((m) => (
                          <SelectItem key={m} value={m}>
                            {methodLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Account details</Label>
                    <Input
                      value={payoutHandle}
                      onChange={(e) => setPayoutHandle(e.target.value)}
                      placeholder="Phone number or account"
                    />
                  </div>
                </div>
                <Button variant="outline" onClick={handleSavePayout} disabled={setPayout.isPending}>
                  {setPayout.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Save payout method
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Referred learners</CardTitle>
                <CardDescription>{dashboard.data.customers.length} total</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboard.data.customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No referrals yet. Share your link.</p>
                ) : (
                  <div className="divide-y">
                    {dashboard.data.customers.map((c) => (
                      <div key={c.referralId} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium">{c.customerName}</p>
                          <p className="text-xs text-muted-foreground">{c.customerEmail}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{usd(c.earnedUsdMinor)}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.firstPaidAt
                              ? `Month ${c.tenureMonth} at ${c.currentRatePct}%`
                              : "Not yet paying"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent commission</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.data.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing yet.</p>
                ) : (
                  <div className="divide-y">
                    {dashboard.data.events.map((e: AmbassadorCommissionEvent) => (
                      <div key={e.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium">{usd(e.amountUsdMinor)}</p>
                          <p className="text-xs text-muted-foreground">
                            {e.rateApplied}% of {usd(e.grossUsdMinor)} - month {e.customerTenureMonth}
                          </p>
                        </div>
                        <Badge variant={e.state === "confirmed" ? "default" : e.state === "clawed_back" ? "destructive" : "secondary"}>
                          {eventStateLabel(e.state)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payout history</CardTitle>
              </CardHeader>
              <CardContent>
                {dashboard.data.payouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payouts yet.</p>
                ) : (
                  <div className="divide-y">
                    {dashboard.data.payouts.map((p: AmbassadorPayout) => (
                      <div key={p.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="text-sm font-medium">{usd(p.amountUsdMinor)}</p>
                          <p className="text-xs text-muted-foreground">{methodLabel(p.method)}</p>
                        </div>
                        <Badge variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}>
                          {payoutStatusLabel(p.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function errMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return fallback;
}
