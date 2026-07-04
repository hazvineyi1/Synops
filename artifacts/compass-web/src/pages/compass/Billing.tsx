import { Link } from "wouter";
import { Check, Minus, AlertTriangle } from "lucide-react";
import {
  useGetBillingSubscription,
  getGetBillingSubscriptionQueryKey,
  type PlanFeatures,
} from "@workspace/compass-api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { canManageSchool } from "@/lib/roles";

const FEATURE_ROWS: { key: keyof PlanFeatures; label: string }[] = [
  { key: "whiteLabel", label: "White-label branding" },
  { key: "multiAccreditorExport", label: "Multi-accreditor export" },
  { key: "customDomain", label: "Custom domain" },
];

function limitLabel(limit: number | null): string {
  if (limit === null) return "Unlimited active courses";
  return `Up to ${limit} active ${limit === 1 ? "course" : "courses"}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "trialing":
      return "Trial";
    case "active":
      return "Active";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    case "incomplete":
      return "Incomplete";
    case "incomplete_expired":
      return "Expired";
    case "unpaid":
      return "Unpaid";
    case "none":
      return "No subscription";
    default:
      return status;
  }
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Billing() {
  const { user } = useAuth();

  const { data: sub, isLoading: subLoading } = useGetBillingSubscription({
    query: { queryKey: getGetBillingSubscriptionQueryKey() },
  });

  if (!canManageSchool(user?.role)) {
    return null;
  }

  const trialEnds = fmtDate(sub?.trialEndsAt);
  const renews = fmtDate(sub?.currentPeriodEnd);
  const limit = sub?.activeCourseLimit ?? null;
  const used = sub?.activeCourseCount ?? 0;
  const usagePct =
    limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Plan status</h1>
        <p className="text-sm text-muted-foreground">
          Your organization's current plan and usage. Contact us to add capacity
          or unlock more features.
        </p>
      </header>

      {subLoading || !sub ? (
        <div
          className="h-40 animate-pulse rounded-lg border border-border bg-muted/40"
          aria-hidden="true"
        />
      ) : (
        <>
          {sub.trialExpired && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium text-destructive">Your free trial has ended</p>
                <p className="text-muted-foreground">
                  You can still view everything, but creating and editing are
                  paused. Contact us to continue building.
                </p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {sub.planLabel}
                    <Badge variant={sub.subscriptionStatus === "active" ? "default" : "secondary"}>
                      {statusLabel(sub.subscriptionStatus)}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    {sub.tier === "trial" && trialEnds
                      ? `Free trial ends ${trialEnds}.`
                      : renews
                        ? `Renews ${renews}.`
                        : "Contact us to make changes to your plan."}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Active courses</span>
                  <span className="font-medium">
                    {used}
                    {limit === null ? " used (unlimited)" : ` of ${limit}`}
                  </span>
                </div>
                {limit !== null && (
                  <Progress
                    value={usagePct}
                    aria-label={`${used} of ${limit} active courses used`}
                  />
                )}
                <p className="text-sm text-muted-foreground">{limitLabel(limit)}</p>
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-medium">Included features</p>
                <ul className="space-y-2">
                  {FEATURE_ROWS.map((row) => {
                    const included = sub.features[row.key];
                    return (
                      <li key={row.key} className="flex items-center gap-2 text-sm">
                        {included ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        ) : (
                          <Minus
                            className="h-4 w-4 shrink-0 text-muted-foreground/50"
                            aria-hidden="true"
                          />
                        )}
                        <span className={included ? "text-foreground" : "text-muted-foreground/60"}>
                          {row.label}
                        </span>
                        <span className="sr-only">{included ? "included" : "not included"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            Need more active courses or additional features?{" "}
            <Link href="~/contact" className="font-medium text-primary hover:underline">
              Contact us
            </Link>{" "}
            and we will help you continue.
          </p>
        </>
      )}
    </div>
  );
}
