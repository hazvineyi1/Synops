import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { MessageSquare, Library, TrendingUp, Settings, LogOut, Loader2, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/lib/admin-api";
import { useT, LanguageSwitcher } from "@/lib/i18n";

const navItems = [
  { href: "/coach", labelKey: "nav.coach", icon: MessageSquare },
  { href: "/material", labelKey: "nav.library", icon: Library },
  { href: "/progress", labelKey: "nav.progress", icon: TrendingUp },
  { href: "/cohorts", labelKey: "nav.cohorts", icon: Users },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { t } = useT();
  const { data: adminData } = useIsAdmin();
  const items = adminData?.isAdmin
    ? [...navItems, { href: "/admin", labelKey: "nav.admin", icon: Shield }]
    : navItems;

  const handleSignOut = () => {
    signOut({ redirectUrl: "/" });
  };

  return (
    <div className="hidden md:flex w-64 border-r border-border bg-sidebar flex-col h-full h-[100dvh] flex-shrink-0 relative z-20">
      <div className="p-6">
        <Link href="/coach" className="flex items-center gap-3 no-underline outline-none">
          <img src="/logo.svg" alt="Arete Logo" className="w-8 h-8 rounded" />
          <span className="font-serif font-semibold text-xl tracking-tight text-sidebar-foreground">Arete</span>
        </Link>
      </div>

      <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-4">
        <LanguageSwitcher className="w-full" />
        <div className="flex items-center gap-3 px-2">
          {!isLoaded ? (
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          ) : user ? (
            <>
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground overflow-hidden">
                {user.hasImage ? (
                  <img src={user.imageUrl} alt={user.fullName || "User"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-semibold">{user.firstName?.charAt(0) || user.emailAddresses[0]?.emailAddress?.charAt(0) || "?"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{user.fullName || user.firstName || "Learner"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.emailAddresses[0]?.emailAddress}</p>
              </div>
            </>
          ) : null}
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="w-4 h-4" />
          {t("nav.signout")}
        </button>
      </div>
    </div>
  );
}
