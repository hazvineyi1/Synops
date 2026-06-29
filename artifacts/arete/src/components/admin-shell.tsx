import { ReactNode } from "react";
import { Link } from "wouter";
import { useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users as UsersIcon,
  CreditCard,
  Megaphone,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  LogOut,
} from "lucide-react";

export const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: UsersIcon },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "access", label: "Access & audit", icon: ShieldCheck },
  { id: "developers", label: "Developer API", icon: KeyRound },
];

// Dedicated admin console layout — its own sidebar and chrome, separate from the
// learner app. Each section is a distinct view (only the active one renders).
export function AdminShell({
  active,
  onNavigate,
  children,
}: {
  active: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}) {
  const { signOut } = useClerk();
  return (
    <div className="flex h-[100dvh] w-full bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-4 py-4">
          <div className="font-serif text-lg font-semibold text-primary">Arete Admin</div>
          <div className="text-[11px] text-muted-foreground">Platform console</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {ADMIN_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onNavigate(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                active === s.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border p-2">
          <Link
            href="/coach"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" /> Open learner app
          </Link>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
