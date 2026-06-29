import { ReactNode, useState } from "react";
import { useAuth, useUser, useClerk } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./sidebar";
import { MobileTopBar, MobileTabBar } from "./mobile-nav";

interface AppLayoutProps {
  children: ReactNode;
}

// Shown only while an admin is impersonating a learner (Clerk actor session).
function ImpersonationBanner() {
  const { actor } = useAuth();
  const { user } = useUser();
  const clerk = useClerk();
  if (!actor) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span>
        Viewing as{" "}
        <strong>{user?.primaryEmailAddress?.emailAddress ?? "this learner"}</strong> — impersonation mode.
      </span>
      <button
        className="shrink-0 font-medium underline"
        onClick={() => clerk.signOut({ redirectUrl: "/sign-in" })}
      >
        Exit impersonation
      </button>
    </div>
  );
}

type LearnerAnnouncement = { id: number; title: string; body: string };

// Dismissible banner showing active announcements for the current learner.
function AnnouncementsBanner() {
  const { data } = useQuery({
    queryKey: ["announcements"],
    queryFn: () =>
      fetch("/api/announcements", { credentials: "include" }).then((r) =>
        r.ok ? r.json() : { announcements: [] },
      ),
    staleTime: 60_000,
  });
  const [dismissed, setDismissed] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissedAnnouncements") || "[]");
    } catch {
      return [];
    }
  });
  const items: LearnerAnnouncement[] = (data?.announcements ?? []).filter(
    (a: LearnerAnnouncement) => !dismissed.includes(a.id),
  );
  if (items.length === 0) return null;
  const a = items[0];
  function dismiss() {
    const next = [...dismissed, a.id];
    setDismissed(next);
    try {
      localStorage.setItem("dismissedAnnouncements", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm text-foreground">
      <span>
        <strong>{a.title}</strong> — {a.body}
      </span>
      <button
        className="shrink-0 text-muted-foreground hover:text-foreground"
        onClick={dismiss}
        aria-label="Dismiss announcement"
      >
        ✕
      </button>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background overflow-hidden">
      <ImpersonationBanner />
      <AnnouncementsBanner />
      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative z-10">
          <MobileTopBar />
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </main>
          <MobileTabBar />
        </div>
      </div>
    </div>
  );
}
