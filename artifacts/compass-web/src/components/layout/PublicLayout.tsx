import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { name: "About", href: "/about" },
  { name: "Healthcare", href: "/healthcare" },
  { name: "Learning & AI", href: "/learning" },
  { name: "Platforms", href: "/platforms" },
  { name: "Insights", href: "/insights" },
];

function Brandmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
    >
      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-primary to-teal-400 text-white">
        <span className="absolute inset-0 m-auto h-3.5 w-3.5 rotate-45 border border-white/80" />
        <span className="relative z-10 text-[11px] font-bold">SA</span>
      </span>
      <span className="text-base leading-tight">
        Synops <span className="text-muted-foreground font-normal">Consulting</span>
      </span>
    </Link>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Brandmark />

          <nav
            aria-label="Primary"
            className="hidden items-center gap-1 lg:flex"
          >
            {NAV.map((item) => {
              const active =
                location === item.href || location.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/portals"
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Curriculum Builder
            </Link>
            <Button asChild variant="outline">
              <Link href="/compass/register">Start free trial</Link>
            </Button>
            <Button asChild>
              <Link href="/contact">Book a consultation</Link>
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className="border-t border-border bg-background lg:hidden"
          >
            <div className="space-y-1 px-4 py-3">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-muted"
                >
                  {item.name}
                </Link>
              ))}
              <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                <Link
                  href="/portals"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-base font-medium text-foreground hover:bg-muted"
                >
                  Curriculum Builder
                </Link>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/compass/register" onClick={() => setMobileOpen(false)}>
                    Start free trial
                  </Link>
                </Button>
                <Button asChild className="w-full">
                  <Link href="/contact" onClick={() => setMobileOpen(false)}>
                    Book a consultation
                  </Link>
                </Button>
              </div>
            </div>
          </nav>
        )}
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Brandmark />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="/about" className="hover:text-foreground">About</Link>
            <Link href="/insights" className="hover:text-foreground">Insights</Link>
            <Link href="/contact" className="hover:text-foreground">Contact</Link>
            <Link href="/portals" className="hover:text-foreground">Curriculum Builder</Link>
          </nav>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <p>&copy; {new Date().getFullYear()} Synops Consulting Group. All rights reserved.</p>
            <p>Built to WCAG 2.1 AA. Contact us if you encounter any barrier using this site.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
