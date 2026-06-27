import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { MessageSquare, Library, TrendingUp, Settings, LogOut, Loader2, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/lib/admin-api";
import { useT, LanguageSwitcher } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/coach", labelKey: "nav.coach", icon: MessageSquare },
  { href: "/material", labelKey: "nav.library", icon: Library },
  { href: "/progress", labelKey: "nav.progress", icon: TrendingUp },
  { href: "/cohorts", labelKey: "nav.cohorts", icon: Users },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

export function MobileTopBar() {
  const { signOut } = useClerk();
  const { user, isLoaded } = useUser();
  const { t } = useT();

  return (
    <header
      className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-30 flex-shrink-0"
      style={{ paddingTop: "env(safe-area-inset-top)", height: "calc(3.5rem + env(safe-area-inset-top))" }}
    >
      <Link href="/coach" className="flex items-center gap-2 no-underline">
        <img src="/logo.svg" alt="Arete" className="w-7 h-7 rounded" />
        <span className="font-serif font-semibold text-base tracking-tight text-sidebar-foreground">
          Arete
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open account menu"
        >
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground overflow-hidden">
            {!isLoaded ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : user?.hasImage ? (
              <img
                src={user.imageUrl}
                alt={user.fullName || "User"}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-semibold">
                {user?.firstName?.charAt(0) ||
                  user?.emailAddresses[0]?.emailAddress?.charAt(0) ||
                  "?"}
              </span>
            )}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {user && (
            <>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="text-sm font-medium truncate">
                  {user.fullName || user.firstName || "Learner"}
                </span>
                <span className="text-xs text-muted-foreground font-normal truncate">
                  {user.emailAddresses[0]?.emailAddress}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <div className="px-2 py-1.5">
            <LanguageSwitcher className="w-full" />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => signOut({ redirectUrl: "/" })}
            className="gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {t("nav.signout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function MobileTabBar() {
  const [location] = useLocation();
  const { t } = useT();
  const { data: adminData } = useIsAdmin();
  const items = adminData?.isAdmin
    ? [...navItems, { href: "/admin", labelKey: "nav.admin", icon: Shield }]
    : navItems;

  return (
    <nav
      className="md:hidden flex border-t border-border bg-background/95 backdrop-blur sticky bottom-0 z-30 flex-shrink-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const isActive = location.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-sm",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <item.icon
              className={cn(
                "w-5 h-5",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
