import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import type { Product } from "@/lib/products";

/**
 * Consistent branded chrome for a product's authenticated workspace: a top bar
 * with the product mark, optional nav, and a sign-out control.
 */
export function ProductLayout({
  product,
  children,
  nav,
}: {
  product: Product;
  children: ReactNode;
  nav?: ReactNode;
}) {
  const { user, logout } = useAuth();
  const Icon = product.icon;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="h-1 w-full" style={{ backgroundColor: product.accent }} aria-hidden="true" />
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md text-white"
            style={{ backgroundColor: product.accent }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{product.name}</div>
            <div className="text-xs text-muted-foreground">{product.title}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {nav}
          {user && (
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.name}</span>
          )}
          <Button variant="outline" size="sm" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
