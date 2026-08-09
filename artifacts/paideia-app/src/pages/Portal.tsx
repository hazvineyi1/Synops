import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ExternalLink, ShieldCheck, ArrowUpRight } from "lucide-react";

/**
 * Cross-product admin hub. One sign-in (this app's admin session) is the identity anchor.
 * Same-origin products (Teacher, Coach, Builder) share this session, so their tiles link directly.
 * Separate products (Praxis, Arete, Kanon, and any added later) are reached through the SSO issuer
 * endpoint, which mints a short-lived signed token and hands the admin off already authenticated.
 */

interface SsoProduct { key: string; label: string }

// Same-origin products that share this app's admin session (no token needed).
const LOCAL_TILES: Array<{ label: string; href: string; note: string }> = [
  { label: "Synops Teacher", href: "/app/admin", note: "This app · admin console" },
  { label: "Synops Coach", href: "/study/", note: "Learner coaching" },
  { label: "Curriculum Builder", href: "/builder/", note: "Course & curriculum builder" },
];

function ssoMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === "denied") return "That account is not an admin, so single sign-on was declined.";
  if (code === "unconfigured") return "Single sign-on is not configured yet. Set SSO_SHARED_SECRET on each service.";
  if (code === "unknown") return "Unknown product.";
  return null;
}

export default function Portal() {
  const { teacher, loading } = useAuth();
  const [ssoProducts, setSsoProducts] = useState<SsoProduct[]>([]);
  const params = new URLSearchParams(window.location.search);
  const notice = ssoMessage(params.get("sso"));

  const isAdmin = !!teacher?.isAdmin;

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ products: SsoProduct[] }>("/admin/sso/products")
      .then((r) => setSsoProducts(r.products))
      .catch(() => setSsoProducts([]));
  }, [isAdmin]);

  if (loading) return <AppShell><p className="text-muted-foreground">Loading.</p></AppShell>;

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto text-center py-16">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h1 className="font-serif text-2xl text-primary mb-2">Admin access only</h1>
          <p className="text-muted-foreground text-sm">This portal is for platform administrators. Sign in with an admin account to continue.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="font-serif text-4xl">Admin portal</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          One sign-in for every product. Open any product below and you arrive already signed in as {teacher?.name || teacher?.email}.
        </p>
      </header>

      {notice && (
        <div className="mb-6 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-4 py-3">{notice}</div>
      )}

      <section className="mb-10">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">This platform</div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LOCAL_TILES.map((t) => (
            <a
              key={t.href}
              href={t.href}
              className="group bg-card border rounded-lg p-5 hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="font-medium">{t.label}</div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{t.note}</div>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Other products (single sign-on)</div>
        {ssoProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No linked products.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ssoProducts.map((p) => (
              <a
                key={p.key}
                href={`/api/copilot/admin/sso/${p.key}`}
                className="group bg-card border rounded-lg p-5 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="font-medium">{p.label}</div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </div>
                <div className="text-xs text-muted-foreground mt-1">Opens signed in via SSO</div>
              </a>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
