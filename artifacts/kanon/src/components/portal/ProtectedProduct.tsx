import { Redirect } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { isGlobalAdmin } from "@/lib/roles";
import { Spinner } from "@/components/ui/spinner";
import { ProductApp } from "@/components/portal/ProductApp";
import type { Product } from "@/lib/products";

/**
 * Client-side gate for a single product, mounted under a `nest`ed `/{key}`
 * route. Redirects anonymous visitors to the product's branded login, and
 * redirects authenticated users who belong to a different product back to their
 * own. The server independently enforces auth + product access on every gated
 * API route; this is a UX gate, not the security boundary.
 */
export function ProtectedProduct({ product }: { product: Product }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`~/${product.key}/login`} />;
  }

  if (!isGlobalAdmin(user.role) && user.productKey !== product.key) {
    return <Redirect to={`~/${user.productKey}`} />;
  }

  return <ProductApp product={product} />;
}
