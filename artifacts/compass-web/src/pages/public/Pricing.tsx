import { Link } from "wouter";
import { Check, Minus } from "lucide-react";
import { usePageMeta } from "@/lib/seo";
import {
  useListPlans,
  type PlanCatalogEntry,
  type PlanFeatures,
} from "@workspace/compass-api-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FEATURE_ROWS: { key: keyof PlanFeatures; label: string }[] = [
  { key: "whiteLabel", label: "White-label branding" },
  { key: "multiAccreditorExport", label: "Multi-accreditor export" },
  { key: "customDomain", label: "Custom domain" },
];

function priceLabel(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

function limitLabel(limit: number | null): string {
  if (limit === null) return "Unlimited active courses";
  return `Up to ${limit} active ${limit === 1 ? "course" : "courses"}`;
}

function PlanCard({ plan, featured }: { plan: PlanCatalogEntry; featured: boolean }) {
  return (
    <Card
      className={cn(
        "flex flex-col",
        featured && "border-primary shadow-md ring-1 ring-primary/20",
      )}
    >
      <CardHeader className="space-y-3">
        {featured && (
          <span className="inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            Most popular
          </span>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{plan.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
        </div>
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight">
            {priceLabel(plan.monthlyPriceCents)}
          </span>
          <span className="text-sm text-muted-foreground">per month</span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6">
        <Button asChild variant={featured ? "default" : "outline"} className="w-full">
          <Link href="/compass/register">Start free trial</Link>
        </Button>
        <div className="space-y-3">
          <p className="text-sm font-medium">{limitLabel(plan.activeCourseLimit)}</p>
          <ul className="space-y-2">
            {plan.highlights.map((highlight) => (
              <li
                key={highlight}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-2 border-t border-border pt-3">
            {FEATURE_ROWS.map((row) => {
              const included = plan.features[row.key];
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
                  <span className={cn(included ? "text-foreground" : "text-muted-foreground/60")}>
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
  );
}

export default function Pricing() {
  usePageMeta(
    "Pricing",
    "Curriculum Builder pricing. Start a 14-day free trial, then choose a plan. Pricing meters on the number of simultaneously active courses.",
  );

  const { data: plans, isLoading, isError } = useListPlans();
  const paid = (plans ?? [])
    .filter((p) => p.tier !== "trial")
    .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Pricing
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          Plans that scale with your curriculum
        </h1>
        <p className="text-lg text-muted-foreground">
          Every plan starts with a 14-day free trial. No credit card required.
          Pricing meters on the number of simultaneously active courses, so you
          only pay for what you are actively building.
        </p>
      </div>

      {isError ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          Plan details are unavailable right now. Please try again shortly or
          contact us for current pricing.
        </p>
      ) : isLoading ? (
        <div className="mt-12 grid gap-6 md:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-96 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : (
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {paid.map((plan) => (
            <PlanCard
              key={plan.tier}
              plan={plan}
              featured={plan.tier === "professional"}
            />
          ))}
        </div>
      )}

      <div className="mt-12 space-y-2 text-center text-sm text-muted-foreground">
        <p>
          Already have an account?{" "}
          <Link href="/compass/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
        <p>
          Need a tailored rollout for your district or system?{" "}
          <Link href="/contact" className="font-medium text-primary hover:underline">
            Talk to us
          </Link>
        </p>
      </div>
    </div>
  );
}
