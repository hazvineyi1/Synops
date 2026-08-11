import type { ReactNode } from "react";
import { Link } from "wouter";

export function AuthShell({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  // Wider layout for multi-column forms (e.g. onboarding). Login/sign-up stay narrow.
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-8 py-6 border-b bg-card">
        <Link href="/" className="inline-block">
          <div className="font-serif text-2xl text-primary leading-tight">Synops</div>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"}`}>
          <div className="text-center mb-8">
            <h1 className="font-serif text-4xl text-primary mb-3">{title}</h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="bg-card border rounded-lg p-8 shadow-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
