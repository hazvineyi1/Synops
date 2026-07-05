import { Link } from "wouter";
import { usePageMeta } from "@/lib/seo";
import { PRODUCTS, type Product, type ProductVertical } from "@/lib/products";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const VERTICALS: ProductVertical[] = [
  "Education",
  "Healthcare",
  "Project Management",
];

function PortalCard({ product }: { product: Product }) {
  const Icon = product.icon;
  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-3">
        <div className="flex items-center">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: product.accent }}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{product.name}</h3>
          <p className="text-sm text-muted-foreground">{product.title}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <p className="text-sm text-muted-foreground">{product.blurb}</p>
        <div className="flex flex-wrap items-center gap-3">
          {product.hasRegister && (
            <Button asChild>
              <Link href={`/${product.key}/register`}>Start free trial</Link>
            </Button>
          )}
          <Link
            href={`/${product.key}/login`}
            className="text-sm font-medium hover:underline"
            style={{ color: product.accent }}
          >
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Portals() {
  usePageMeta(
    "Curriculum Builder",
    "Sign in to Curriculum Builder, the Synops Consulting Group standards-aligned curriculum platform.",
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Platform access
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          Curriculum Builder
        </h1>
        <p className="text-lg text-muted-foreground">
          A secure, branded workspace for standards-aligned curriculum design.
          Start a free 14 day trial, no credit card required, or sign in to your
          account.
        </p>
      </div>

      <div className="mt-12 space-y-12">
        {VERTICALS.map((vertical) => {
          const items = PRODUCTS.filter((p) => p.vertical === vertical);
          if (items.length === 0) return null;
          return (
            <section key={vertical} aria-labelledby={`vertical-${vertical}`}>
              <h2
                id={`vertical-${vertical}`}
                className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {vertical}
              </h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((product) => (
                  <PortalCard key={product.key} product={product} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
