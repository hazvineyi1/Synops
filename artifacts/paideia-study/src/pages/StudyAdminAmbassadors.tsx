import { useEffect, useState } from "react";
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
  useAdminAmbassadorSettings,
  useAdminUpdateAmbassadorSettings,
  useAdminAmbassadors,
  useAdminPayouts,
  useAdminUpdatePayout,
  useAdminSetAmbassadorTier,
  useAdminSetAmbassadorStatus,
  type AmbassadorSettings,
  type AdminAmbassadorRow,
} from "@/hooks/use-study-api";
import { ArrowLeft, Loader2, Save } from "lucide-react";

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

const PAYOUT_STATUSES = ["requested", "processing", "paid", "failed"];

function errMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return fallback;
}

export default function StudyAdminAmbassadors() {
  const [, setLoc] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const settingsQuery = useAdminAmbassadorSettings();
  const updateSettings = useAdminUpdateAmbassadorSettings();
  const ambassadorsQuery = useAdminAmbassadors();
  const [payoutFilter, setPayoutFilter] = useState<string>("requested");
  const payoutsQuery = useAdminPayouts(payoutFilter === "all" ? undefined : payoutFilter);
  const updatePayout = useAdminUpdatePayout();
  const setTier = useAdminSetAmbassadorTier();
  const setStatus = useAdminSetAmbassadorStatus();

  const [draft, setDraft] = useState<AmbassadorSettings | null>(null);

  useEffect(() => {
    if (settingsQuery.data?.settings && !draft) {
      setDraft(settingsQuery.data.settings);
    }
  }, [settingsQuery.data, draft]);

  function refreshAll() {
    queryClient.invalidateQueries({ queryKey: ["adminAmbassadorSettings"] });
    queryClient.invalidateQueries({ queryKey: ["adminAmbassadors"] });
    queryClient.invalidateQueries({ queryKey: ["adminPayouts"] });
  }

  async function handleSaveSettings() {
    if (!draft) return;
    try {
      await updateSettings.mutateAsync({
        schedule: draft.schedule,
        standardCapMonths: draft.standardCapMonths,
        lifetimeThresholdReferrals: draft.lifetimeThresholdReferrals,
        holdbackDays: draft.holdbackDays,
        cashoutIncrementUsdMinor: draft.cashoutIncrementUsdMinor,
        payoutMethods: draft.payoutMethods,
        fxRatesToUsd: draft.fxRatesToUsd,
      });
      queryClient.invalidateQueries({ queryKey: ["adminAmbassadorSettings"] });
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Could not save", description: errMessage(e, "Try again."), variant: "destructive" });
    }
  }

  async function handlePayout(id: string, status: string) {
    try {
      await updatePayout.mutateAsync({ id, status });
      queryClient.invalidateQueries({ queryKey: ["adminPayouts"] });
      queryClient.invalidateQueries({ queryKey: ["adminAmbassadors"] });
      toast({ title: "Payout updated" });
    } catch (e) {
      toast({ title: "Could not update", description: errMessage(e, "Try again."), variant: "destructive" });
    }
  }

  async function handleTier(a: AdminAmbassadorRow) {
    const tier = a.tier === "lifetime" ? "standard" : "lifetime";
    try {
      await setTier.mutateAsync({ id: a.id, tier });
      queryClient.invalidateQueries({ queryKey: ["adminAmbassadors"] });
      toast({ title: `Tier set to ${tier}` });
    } catch (e) {
      toast({ title: "Could not update", description: errMessage(e, "Try again."), variant: "destructive" });
    }
  }

  async function handleStatus(a: AdminAmbassadorRow) {
    const status = a.status === "suspended" ? "active" : "suspended";
    try {
      await setStatus.mutateAsync({ id: a.id, status });
      queryClient.invalidateQueries({ queryKey: ["adminAmbassadors"] });
      toast({ title: `Account ${status}` });
    } catch (e) {
      toast({ title: "Could not update", description: errMessage(e, "Try again."), variant: "destructive" });
    }
  }

  function updateBracket(index: number, field: "minMonth" | "maxMonth" | "ratePct", value: string) {
    if (!draft) return;
    const schedule = draft.schedule.map((b, i) => {
      if (i !== index) return b;
      if (field === "maxMonth") {
        return { ...b, maxMonth: value === "" ? null : Number(value) };
      }
      return { ...b, [field]: Number(value) };
    });
    setDraft({ ...draft, schedule });
  }

  function updateFx(code: string, value: string) {
    if (!draft) return;
    setDraft({ ...draft, fxRatesToUsd: { ...draft.fxRatesToUsd, [code]: Number(value) } });
  }

  if (settingsQuery.isLoading || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Button variant="ghost" size="sm" className="gap-1.5 mb-2" onClick={() => setLoc("/dashboard")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-semibold">Ambassador admin</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Program settings</CardTitle>
            <CardDescription>Rates, holdback, caps, FX, and payout rails.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label className="mb-2 block">Commission schedule</Label>
              <div className="space-y-2">
                {draft.schedule.map((b, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-xs text-muted-foreground">From month</span>
                      <Input
                        type="number"
                        value={b.minMonth}
                        onChange={(e) => updateBracket(i, "minMonth", e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">To month (blank = open)</span>
                      <Input
                        type="number"
                        value={b.maxMonth ?? ""}
                        onChange={(e) => updateBracket(i, "maxMonth", e.target.value)}
                      />
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Rate %</span>
                      <Input
                        type="number"
                        value={b.ratePct}
                        onChange={(e) => updateBracket(i, "ratePct", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Standard cap (months)"
                value={draft.standardCapMonths}
                onChange={(v) => setDraft({ ...draft, standardCapMonths: v })}
              />
              <Field
                label="Lifetime threshold (referrals)"
                value={draft.lifetimeThresholdReferrals}
                onChange={(v) => setDraft({ ...draft, lifetimeThresholdReferrals: v })}
              />
              <Field
                label="Holdback (days)"
                value={draft.holdbackDays}
                onChange={(v) => setDraft({ ...draft, holdbackDays: v })}
              />
              <div className="space-y-1.5">
                <Label>Cash-out increment (USD)</Label>
                <Input
                  type="number"
                  value={draft.cashoutIncrementUsdMinor / 100}
                  onChange={(e) =>
                    setDraft({ ...draft, cashoutIncrementUsdMinor: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">FX rates to USD</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(draft.fxRatesToUsd).map(([code, rate]) => (
                  <div key={code} className="flex items-center gap-2">
                    <span className="w-14 text-sm font-mono">{code}</span>
                    <Input
                      type="number"
                      step="0.0001"
                      value={rate}
                      onChange={(e) => updateFx(code, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={updateSettings.isPending} className="gap-2">
              {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ambassadors</CardTitle>
            <CardDescription>{ambassadorsQuery.data?.ambassadors.length ?? 0} enrolled</CardDescription>
          </CardHeader>
          <CardContent>
            {ambassadorsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : ambassadorsQuery.data && ambassadorsQuery.data.ambassadors.length > 0 ? (
              <div className="divide-y">
                {ambassadorsQuery.data.ambassadors.map((a) => (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        {a.userName}
                        {a.tier === "lifetime" && <Badge>Lifetime</Badge>}
                        {a.status === "suspended" && <Badge variant="destructive">Suspended</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.userEmail} - code {a.referralCode} - {a.referralsActive}/{a.referralsTotal} active
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Available {usd(a.balances.availableUsdMinor)} - lifetime {usd(a.balances.lifetimeEarnedUsdMinor)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleTier(a)} disabled={setTier.isPending}>
                        {a.tier === "lifetime" ? "Make standard" : "Make lifetime"}
                      </Button>
                      <Button
                        variant={a.status === "suspended" ? "outline" : "destructive"}
                        size="sm"
                        onClick={() => handleStatus(a)}
                        disabled={setStatus.isPending}
                      >
                        {a.status === "suspended" ? "Reactivate" : "Suspend"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No ambassadors yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>Payouts</CardTitle>
                <CardDescription>Process cash-out requests.</CardDescription>
              </div>
              <Select value={payoutFilter} onValueChange={setPayoutFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {PAYOUT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {payoutsQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : payoutsQuery.data && payoutsQuery.data.payouts.length > 0 ? (
              <div className="divide-y">
                {payoutsQuery.data.payouts.map((p) => (
                  <div key={p.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {usd(p.amountUsdMinor)} - {p.userName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {METHOD_LABELS[p.method] ?? p.method}: {p.handle ?? "no handle"} - {p.userEmail}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={p.status === "paid" ? "default" : p.status === "failed" ? "destructive" : "secondary"}
                      >
                        {p.status}
                      </Badge>
                      {p.status === "requested" && (
                        <Button variant="outline" size="sm" onClick={() => handlePayout(p.id, "processing")}>
                          Mark processing
                        </Button>
                      )}
                      {(p.status === "requested" || p.status === "processing") && (
                        <>
                          <Button size="sm" onClick={() => handlePayout(p.id, "paid")}>
                            Mark paid
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handlePayout(p.id, "failed")}>
                            Fail
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payouts in this view.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
