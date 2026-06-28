import { type ReactNode } from "react";
import { Link } from "wouter";

/**
 * Shared layout for the per-product auth screens (login / register). When an
 * `accent` is supplied the side panel adopts that product's brand color.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  eyebrow = "Client Portal",
  panelLine = "One platform for the Synops Advisory Group products you rely on.",
  panelNote,
  accent,
  logoUrl,
  brandName = "Synops Advisory",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
  panelLine?: string;
  panelNote?: string;
  accent?: string;
  // When a white-label org is resolved by host, its logo and name replace the
  // default Synops mark on the sign-in screen.
  logoUrl?: string;
  brandName?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link
            href="/"
            className="mb-8 inline-flex items-center gap-2.5 font-semibold tracking-tight"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-auto" />
            ) : (
              <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-primary to-teal-400 text-white">
                <span className="absolute inset-0 m-auto h-3.5 w-3.5 rotate-45 border border-white/80" />
                <span className="relative z-10 text-[11px] font-bold">SA</span>
              </span>
            )}
            <span>{brandName}</span>
          </Link>

          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
          )}
        </div>
      </div>

      <div
        className="relative hidden items-center justify-center p-12 text-white lg:flex"
        style={accent ? { backgroundColor: accent } : undefined}
      >
        {!accent && (
          <div
            className="absolute inset-0 bg-gradient-to-br from-primary to-teal-700"
            aria-hidden="true"
          />
        )}
        <div className="relative max-w-md space-y-6">
          <p className="text-sm font-medium uppercase tracking-widest text-white/70">
            {eyebrow}
          </p>
          <p className="text-2xl font-semibold leading-snug">{panelLine}</p>
          {panelNote && <p className="text-sm text-white/80">{panelNote}</p>}
        </div>
      </div>
    </div>
  );
}
