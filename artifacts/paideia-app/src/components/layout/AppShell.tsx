import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useUsage } from "@/hooks/use-usage";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { LayoutDashboard, FileText, ClipboardList, MessageSquare, HelpCircle, BookOpen, Users, Settings, LogOut, BarChart3, FolderOpen, Inbox, Sparkles } from "lucide-react";

const NAV = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/plans/new", label: "Lesson planner", icon: FileText },
  { path: "/worksheets/new", label: "Worksheet generator", icon: ClipboardList },
  { path: "/parent-drafts/new", label: "Parent update", icon: MessageSquare },
  { path: "/quizzes/new", label: "Quiz and exit tickets", icon: HelpCircle },
  { path: "/library", label: "Library", icon: FolderOpen },
  { path: "/shared", label: "Shared with me", icon: Inbox },
  { path: "/classes", label: "Classes and students", icon: Users },
  { path: "/samples", label: "Samples library", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_NAV = { path: "/admin", label: "Founder admin", icon: BarChart3 };

export function AppShell({ children }: { children: ReactNode }) {
  const { teacher, signOut, impersonator, stopImpersonating } = useAuth();
  const { usage } = useUsage();
  const [loc, setLoc] = useLocation();
  const [inboxCount, setInboxCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);

  useEffect(() => {
    if (!teacher?.isAdmin) return;
    let cancelled = false;
    const load = () => {
      api.get<{ pendingTeachers: number; newPilots: number }>("/admin/inbox-counts")
        .then((r) => { if (!cancelled) setInboxCount(r.pendingTeachers + r.newPilots); })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [teacher?.isAdmin]);

  useEffect(() => {
    if (!teacher) return;
    let cancelled = false;
    const load = () => {
      api.get<{ count: number }>("/resource-shares/inbox-count")
        .then((r) => { if (!cancelled) setSharedCount(r.count); })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [teacher?.id]);

  const onSignOut = async () => {
    await signOut();
    setLoc("/login");
  };

  const onStopImpersonating = async () => {
    await stopImpersonating();
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 border-r bg-card flex flex-col no-print">
        <div className="p-6 border-b">
          <Link href="/dashboard" className="block">
            <div className="font-serif text-2xl text-primary leading-tight">Synops</div>
            <div className="text-xs tracking-wider uppercase text-muted-foreground mt-1">Teacher</div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {[...NAV, ...(teacher?.isAdmin ? [ADMIN_NAV] : [])].map((item) => {
            const Icon = item.icon;
            const active = loc === item.path || (item.path !== "/dashboard" && loc.startsWith(item.path.replace("/new", "")));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {item.path === "/admin" && inboxCount > 0 ? (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold">
                    {inboxCount}
                  </span>
                ) : null}
                {item.path === "/shared" && sharedCount > 0 ? (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold">
                    {sharedCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          {usage && !usage.subscribed ? (
            <Link
              href="/upgrade"
              className="block mb-2 px-3 py-2 rounded-md bg-secondary/60 hover:bg-secondary text-xs"
            >
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="font-medium">{usage.used} of {usage.limit} free generations</span>
              </div>
              <div className="text-muted-foreground">
                {usage.remaining === 0
                  ? (usage.paidPlansEnabled ? "Upgrade for unlimited" : (usage.onWaitlist ? "You're on the waitlist" : "Join the waitlist"))
                  : `${usage.remaining} left this month`}
              </div>
            </Link>
          ) : null}
          {usage?.subscribed ? (
            <div className="mb-2 px-3 py-2 rounded-md bg-primary/10 text-xs flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-primary">Unlimited plan</span>
            </div>
          ) : null}
          {impersonator ? (
            <div className="mb-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs">
              <div className="font-semibold text-amber-700">Impersonating {teacher?.name}</div>
              <div className="text-amber-600 mt-1">Logged in as super admin</div>
              <button
                onClick={onStopImpersonating}
                className="mt-2 w-full text-center px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-medium text-xs"
              >
                Stop impersonating
              </button>
            </div>
          ) : null}
          <div className="px-3 py-2 mb-1">
            <div className="text-sm font-medium truncate">{teacher?.name}</div>
            <div className="text-xs text-muted-foreground truncate">{teacher?.email}</div>
          </div>
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-secondary"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {impersonator ? (
          <div className="bg-amber-50 border-b border-amber-200 px-8 py-2 text-xs text-amber-800 flex items-center gap-2">
            <span className="font-semibold">Impersonation mode:</span>
            You are viewing as <strong>{teacher?.name}</strong> ({teacher?.email})
          </div>
        ) : null}
        <div className="max-w-5xl mx-auto px-8 py-10">{children}</div>
      </main>
    </div>
  );
}
