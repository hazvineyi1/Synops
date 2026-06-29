import { ReactNode } from "react";
import { Link } from "wouter";
import { useClerk } from "@clerk/react";
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

const adminSections = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: UsersIcon },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "access", label: "Access & audit", icon: ShieldCheck },
  { id: "developers", label: "Developer API", icon: KeyRound },
];

// Dedicated admin console layout — its own sidebar and chrome, separate from
// the learner app. Section links jump to anchored sections in the content.
export function AdminShell({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  return (
    <div className="flex h-[100dvh] w-full bg-muted/20">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border px-4 py-4">
          <div className="font-serif text-lg font-semibold text-primary">Arete Admin</div>
          <div className="text-[11px] text-muted-foreground">Platform console</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {adminSections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <s.icon className="h-4 w-4 text-muted-foreground" /> {s.label}
            </a>
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
