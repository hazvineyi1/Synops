import { ReactNode } from "react";
import { useAuth, useUser, useClerk } from "@clerk/react";
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

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-[100dvh] w-full flex-col bg-background overflow-hidden">
      <ImpersonationBanner />
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
