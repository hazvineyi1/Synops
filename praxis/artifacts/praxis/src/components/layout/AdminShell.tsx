import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { useSession } from "@/context/SessionContext";

/**
 * Admin console shell — layout ported from Sokratify's SuperAdmin (AdminLayout): a dark
 * navy sidebar with section nav over a warm off-white content area, sticky on desktop
 * with a mobile drawer. Self-contained and full-screen (rendered outside AppLayout).
 */
interface Section {
  id: string;
  label: string;
}
interface AdminShellProps {
  sections: Section[];
  active: string;
  onSelect: (id: string) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const SIDEBAR_BG = "hsl(222 47% 11%)";
const CONTENT_BG = "hsl(43 30% 97%)";

export function AdminShell({ sections, active, onSelect, title, subtitle, children }: AdminShellProps) {
  const { user, signOut } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const sidebar = (
    <aside className="flex flex-col w-60 flex-shrink-0 h-full" style={{ background: SIDEBAR_BG }}>
      <div className="px-5 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div>
          <Link href="/dashboard">
            <span style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: "-0.01em", cursor: "pointer" }}>Synops Praxis</span>
          </Link>
          <p style={{ fontSize: "0.67rem", color: "rgba(255,255,255,0.3)", marginTop: 3 }}>Platform Admin</p>
        </div>
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          className="lg:hidden p-1.5 rounded-md"
          style={{ color: "rgba(255,255,255,0.55)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M6 18L18 6" /></svg>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto flex flex-col gap-0.5">
        {sections.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => { onSelect(s.id); setDrawerOpen(false); }}
              className="text-left px-3 py-2 rounded-md text-sm"
              style={{
                background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                color: isActive ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.42)",
                fontWeight: isActive ? 500 : 400,
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)"; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.42)"; } }}
            >
              {s.label}
            </button>
          );
        })}

        <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <Link href="/dashboard">
            <span className="block px-3 py-2 rounded-md text-sm cursor-pointer" style={{ color: "rgba(255,255,255,0.42)" }}>← Back to app</span>
          </Link>
        </div>
      </nav>

      <div className="px-5 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 500, color: "rgba(255,255,255,0.52)", marginBottom: 2 }}>
          {user?.firstName} {user?.lastName}
        </p>
        <p style={{ fontSize: "0.67rem", color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>{user?.role?.replace(/_/g, " ")}</p>
        <button
          onClick={() => void signOut()}
          style={{ background: "none", border: "none", padding: 0, fontSize: "0.72rem", color: "rgba(255,255,255,0.22)", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.22)")}
        >
          Sign out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex" style={{ background: CONTENT_BG }}>
      {/* Desktop sticky sidebar */}
      <div className="hidden lg:flex" style={{ position: "sticky", top: 0, height: "100vh", alignSelf: "flex-start" }}>
        {sidebar}
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} className="lg:hidden fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.45)" }} />
          <div className="lg:hidden fixed inset-y-0 left-0 z-50 shadow-2xl">{sidebar}</div>
        </>
      )}

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 h-14" style={{ background: SIDEBAR_BG }}>
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" style={{ color: "#fff", background: "transparent", border: "none", cursor: "pointer" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>Platform Admin</span>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl">
          <div className="mb-6">
            <h1 className="font-serif text-2xl" style={{ color: "hsl(60 5% 14%)" }}>{title}</h1>
            {subtitle && <p className="text-sm mt-1" style={{ color: "hsl(43 10% 45%)" }}>{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
