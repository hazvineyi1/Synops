import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileTopBar, MobileTabBar } from "./mobile-nav";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative z-10">
        <MobileTopBar />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
