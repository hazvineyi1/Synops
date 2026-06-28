import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Layers,
  LogOut,
  UserCog,
  KeySquare,
  FileBarChart,
  Briefcase,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { canManageSchool, isBuilder, canViewConsole, roleLabel } from "@/lib/roles";
import { PRODUCT_MAP } from "@/lib/products";
import { TrialBanner } from "@/components/portal/TrialBanner";
import React from "react";

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard };
type NavSection = { label: string; items: NavItem[] };

function navForRole(role?: string | null): NavSection[] {
  const builder = isBuilder(role);

  const build: NavItem[] = [];
  if (builder) {
    build.push({ name: "My work", href: "/my-work", icon: Briefcase });
  } else {
    build.push({ name: "Clients", href: "/clients", icon: Users });
  }
  build.push({ name: "Projects", href: "/projects", icon: BookOpen });
  build.push({ name: "Standards", href: "/standards", icon: Layers });

  const sections: NavSection[] = [
    { label: "Overview", items: [{ name: "Dashboard", href: "/", icon: LayoutDashboard }] },
    { label: "Curriculum", items: build },
  ];

  if (canManageSchool(role)) {
    sections.push({
      label: "Manage",
      items: [
        { name: "Builders", href: "/builders", icon: UserCog },
        { name: "Allocations", href: "/allocations", icon: KeySquare },
        { name: "School report", href: "/school-report", icon: FileBarChart },
        { name: "Plan status", href: "/billing", icon: CreditCard },
      ],
    });
  }
  if (canViewConsole(role)) {
    sections.push({
      label: "Platform",
      items: [{ name: "Platform console", href: "/console", icon: ShieldCheck }],
    });
  }
  return sections;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const compass = PRODUCT_MAP.compass;
  const Brand = compass.icon;
  const navigation = navForRole(user?.role);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="h-1 w-full" style={{ backgroundColor: compass.accent }} aria-hidden="true" />
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="hidden border-r border-sidebar-border bg-sidebar md:flex md:w-64 md:flex-col">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 text-sidebar-foreground">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: compass.accent }}
            >
              <Brand className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">
                {compass.name}{" "}
                <span
                  className="font-normal text-[10px] text-sidebar-foreground/50"
                  aria-label="Kanon is pronounced KAH-non"
                >
                  /KAH-non/
                </span>
              </div>
              <div className="text-[11px] text-sidebar-foreground/60">{compass.title}</div>
            </div>
          </div>
          <ScrollArea className="flex-1 py-4">
            <nav className="space-y-6 px-2">
              {navigation.map((section) => (
                <div key={section.label} className="space-y-1">
                  <h2 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                    {section.label}
                  </h2>
                  {section.items.map((item) => {
                    const isActive =
                      location === item.href || (item.href !== "/" && location.startsWith(item.href));
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          isActive
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "group flex items-center rounded-md px-2 py-2 text-sm font-medium"
                        )}
                      >
                        <item.icon
                          className={cn(
                            isActive
                              ? "text-sidebar-primary-foreground"
                              : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground",
                            "mr-3 h-4 w-4 flex-shrink-0"
                          )}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </ScrollArea>
          <div className="border-t border-sidebar-border p-4">
            {user && (
              <div className="mb-2 px-2">
                <div className="truncate text-xs font-medium text-sidebar-foreground/80">
                  {user.name}
                </div>
                <div className="truncate text-[11px] text-sidebar-foreground/50">
                  {roleLabel(user.role)}
                  {user.organizationName ? ` (${user.organizationName})` : ""}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:hidden">
            <div className="flex items-center gap-2 font-semibold">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-white"
                style={{ backgroundColor: compass.accent }}
              >
                <Brand className="h-4 w-4" aria-hidden="true" />
              </span>
              {compass.name}
            </div>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <TrialBanner />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
