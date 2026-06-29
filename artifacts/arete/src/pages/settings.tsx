import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useClerk } from "@clerk/react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Globe, Download, Trash2, ShieldCheck, Sparkles, CreditCard, Gift, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useT, LanguageSwitcher } from "@/lib/i18n";
import { DeveloperSettings } from "@/components/developer-settings";
import { useIsAdmin } from "@/lib/admin-api";

export default function Settings() {
  const { data: profile, isLoading } = useGetProfile();
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useT();
  const { signOut } = useClerk();
  const { data: adminData } = useIsAdmin();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [billing, setBilling] = useState<any | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [referral, setReferral] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/billing/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setBilling(data);
      })
      .catch(() => {});
    fetch("/api/referral", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) setReferral(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleCopyInvite = async () => {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: referral.link, variant: "destructive" });
    }
  };

  const [formData, setFormData] = useState({
    goal: "",
    examDate: "",
    hoursPerWeek: "10",
    coachPersonality: "",
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        goal: profile.goal || "",
        examDate: profile.examDate ? profile.examDate.split("T")[0] : "",
        hoursPerWeek: profile.hoursPerWeek?.toString() || "10",
        coachPersonality: profile.coachPersonality || "socratic",
      });
    }
  }, [profile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      data: {
        goal: formData.goal,
        examDate: formData.examDate || null,
        hoursPerWeek: parseInt(formData.hoursPerWeek, 10),
        coachPersonality: formData.coachPersonality,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        toast({
          title: t("set.savedTitle"),
          description: t("set.savedDesc"),
        });
      },
      onError: () => {
        toast({
          title: t("set.errTitle"),
          description: t("set.errDesc"),
          variant: "destructive",
        });
      }
    });
  };

  const handleUpgrade = async (plan: "monthly" | "yearly") => {
    setBillingBusy(true);
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
      setBillingBusy(false);
    }
  };

  const handleManageBilling = async () => {
    setBillingBusy(true);
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
      setBillingBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "arete-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("Delete your account and all your data? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      await signOut({ redirectUrl: "/" });
    } catch {
      setDeleting(false);
      toast({ title: "Could not delete account", description: "Please try again.", variant: "destructive" });
    }
  };

  const trialDaysLeft =
    billing?.inTrial && billing?.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / 86400000))
      : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="p-4 md:p-6 md:px-8 border-b border-border bg-background/95 sticky top-0 z-10">
        <h1 className="font-serif text-xl md:text-2xl text-primary font-medium">{t("nav.settings")}</h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">{t("set.subtitle")}</p>
      </div>

      <div className="p-4 md:p-8 max-w-3xl mx-auto w-full">
        <Card className="shadow-sm border-border bg-card mb-6">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> {t("set.lang.title")}
            </CardTitle>
            <CardDescription>{t("set.lang.desc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSwitcher />
          </CardContent>
        </Card>

        {!adminData?.isAdmin && <form onSubmit={handleSubmit} className="space-y-6">

          <Card className="shadow-sm border-border bg-card">
            <CardHeader>
              <CardTitle className="font-serif">{t("set.goals.title")}</CardTitle>
              <CardDescription>{t("set.goals.desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="goal">{t("set.goal.label")}</Label>
                <Select
                  value={formData.goal}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, goal: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("set.goal.ph")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="certification">{t("set.goal.cert")}</SelectItem>
                    <SelectItem value="university">{t("set.goal.university")}</SelectItem>
                    <SelectItem value="general">{t("set.goal.general")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="examDate">{t("set.examDate")}</Label>
                  <Input
                    type="date"
                    id="examDate"
                    value={formData.examDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, examDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hoursPerWeek">{t("set.hours")}</Label>
                  <Input
                    type="number"
                    id="hoursPerWeek"
                    min="1"
                    max="100"
                    value={formData.hoursPerWeek}
                    onChange={(e) => setFormData(prev => ({ ...prev, hoursPerWeek: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border bg-card">
            <CardHeader>
              <CardTitle className="font-serif">{t("set.persona.title")}</CardTitle>
              <CardDescription>{t("set.persona.desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Select
                  value={formData.coachPersonality}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, coachPersonality: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("set.persona.ph")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drill">{t("set.persona.drill")}</SelectItem>
                    <SelectItem value="socratic">{t("set.persona.socratic")}</SelectItem>
                    <SelectItem value="warm">{t("set.persona.warm")}</SelectItem>
                    <SelectItem value="analyst">{t("set.persona.analyst")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" className="gap-2 px-8 w-full md:w-auto" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t("set.save")}
            </Button>
          </div>
        </form>}

        <Card className="shadow-sm border-border bg-card mt-6">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Subscription
            </CardTitle>
            <CardDescription>
              {!billing
                ? "Loading your plan..."
                : billing.tier === "pro"
                  ? billing.inTrial
                    ? `You're on a Pro trial${trialDaysLeft != null ? ` — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left` : ""}. Pro unlocks unlimited concepts, all four coaches, and weekly retrospectives.`
                    : "You're on Pro: unlimited concepts, all four coaches, and weekly retrospectives."
                  : "You're on the Free plan: up to 20 concepts and one coach. Upgrade to Pro for unlimited concepts, all four coaches, and weekly retrospectives."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            {billing && billing.subscriptionStatus !== "active" && (
              <>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => handleUpgrade("monthly")}
                  disabled={billingBusy || !billing.stripeEnabled}
                >
                  {billingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Upgrade — {billing.prices?.monthly?.label ?? "$19 / month"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => handleUpgrade("yearly")}
                  disabled={billingBusy || !billing.stripeEnabled}
                >
                  Yearly — {billing.prices?.yearly?.label ?? "$149 / year"}
                </Button>
              </>
            )}
            {billing?.hasStripeCustomer && (
              <Button type="button" variant="outline" className="gap-2" onClick={handleManageBilling} disabled={billingBusy}>
                <CreditCard className="w-4 h-4" /> Manage billing
              </Button>
            )}
          </CardContent>
          {billing && !billing.stripeEnabled && billing.subscriptionStatus !== "active" && (
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">Billing is not configured in this environment yet.</p>
            </CardContent>
          )}
        </Card>

        {adminData?.isAdmin && <DeveloperSettings />}

        <Card className="shadow-sm border-border bg-card mt-6">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" /> Invite friends
            </CardTitle>
            <CardDescription>
              {referral
                ? `Share your link. You both get ${referral.refereeBonusDays ?? 14} bonus Pro days when a friend joins.${referral.referrals ? ` ${referral.referrals} ${referral.referrals === 1 ? "friend has" : "friends have"} joined so far.` : ""}`
                : "Loading your invite link..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Input
              readOnly
              value={referral?.link ?? ""}
              className="flex-1 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" variant="outline" className="gap-2" onClick={handleCopyInvite} disabled={!referral?.link}>
              {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border bg-card mt-6">
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" /> Your data
            </CardTitle>
            <CardDescription>
              You own your material. Export everything as JSON, or permanently delete your account and all of its data.
              Your study material is sent to Anthropic's API to power the coach; it is not used to train models.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button type="button" variant="outline" className="gap-2" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export my data
            </Button>
            <Button type="button" variant="destructive" className="gap-2" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete account and data
            </Button>
          </CardContent>
          <CardContent className="pt-0">
            <p className="text-xs text-muted-foreground">
              Read our{" "}
              <Link href="/legal/privacy" className="text-primary underline">Privacy Policy</Link>
              {" "}and{" "}
              <Link href="/legal/terms" className="text-primary underline">Terms</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
