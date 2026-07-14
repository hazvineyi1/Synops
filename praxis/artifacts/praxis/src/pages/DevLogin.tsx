import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { API } from "@/lib/api";

interface SeedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  partnerId: string | null;
  organisationId: string | null;
}

const ROLE_ORDER = ["super_admin", "partner_admin", "org_admin", "coach", "learner"];

const ROLE_META: Record<string, { label: string; color: string; bg: string; description: string }> = {
  super_admin:    { label: "Super Admin",    color: "text-purple-700",  bg: "bg-purple-50 border-purple-200",  description: "Full platform control — partners, orgs, billing" },
  partner_admin:  { label: "Partner Admin",  color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",      description: "Manage organisations and coaches within a partner" },
  org_admin:      { label: "Org Admin",      color: "text-teal-700",    bg: "bg-teal-50 border-teal-200",      description: "Manage learners, courses, and reporting for one org" },
  coach:          { label: "Coach",          color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",    description: "Review submissions, send feedback, track progress" },
  learner:        { label: "Learner",        color: "text-slate-700",   bg: "bg-slate-50 border-slate-200",    description: "Take courses, earn PraxisMark credentials" },
};

const ORG_NAMES: Record<string, string> = {
  org_mtn: "MTN Skills Academy",
  org_voda: "Vodacom Learning Centre",
  org_shoprite: "Shoprite Workforce Development",
};

const PARTNER_NAMES: Record<string, string> = {
  partner_talentforge: "TalentForge SA",
  partner_skillbridge: "SkillBridge Africa",
};

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? { label: role, color: "text-slate-600", bg: "bg-slate-100 border-slate-200", description: "" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${m.bg} ${m.color}`}>
      {m.label}
    </span>
  );
}

export function DevLogin() {
  const [users, setUsers] = useState<SeedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // These two calls are handled INDEPENDENTLY on purpose.
    //
    // They used to be a single Promise.all, which meant one failing request threw away
    // the other's result: a 404 on /dev/impersonate rejected the whole chain, so the
    // successfully-fetched account list was never rendered. The page still cleared its
    // spinner (the .finally ran) and simply showed nothing -- a silent, confusing
    // failure. Knowing who you are signed in as is a nice-to-have; the account list is
    // the entire point of the page, so it must not depend on it.
    let cancelled = false;

    fetch(`${API}/dev/seed-users`)
      .then((r) => {
        if (!r.ok) throw new Error(`Seed users request failed (${r.status})`);
        return r.json();
      })
      .then((seedUsers: SeedUser[]) => {
        if (!cancelled) setUsers(seedUsers);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Could not reach the API on port 3001.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetch(`${API}/dev/impersonate`)
      .then((r) => (r.ok ? r.json() : { impersonating: null }))
      .then(({ impersonating: current }) => {
        if (!cancelled && current) setImpersonating(current.id);
      })
      .catch(() => {
        /* Not signed in yet is the normal case. Never block the list on this. */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loginAs = async (userId: string) => {
    setImpersonating(userId);
    await fetch(`${API}/dev/impersonate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      credentials: "include",
    });
    setLocation("/dashboard");
    window.location.href = "/dashboard";
  };

  const grouped = ROLE_ORDER.reduce<Record<string, SeedUser[]>>((acc, role) => {
    acc[role] = users.filter((u) => u.role === role);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm">P</div>
          <span className="font-semibold tracking-tight">Synops Praxis</span>
          <span className="ml-2 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
            DEV MODE
          </span>
          <div className="ml-auto text-sm text-slate-400">
            Pick any demo user below to sign in
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Demo Login</h1>
          <p className="text-slate-400">
            Click any account to log in instantly as that user with all their seeded data — courses, enrolments, notifications, and content.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-slate-400 py-20 justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin" />
            Loading seed accounts…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-6">
            <div className="font-semibold text-red-300 mb-1">Could not load accounts</div>
            <div className="text-sm text-red-400/90 mb-3">{error}</div>
            <div className="text-sm text-slate-400">
              Check that the API window is still running on port 3001.
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-6">
            <div className="font-semibold text-amber-300 mb-1">No seed accounts found</div>
            <div className="text-sm text-slate-400">
              The API responded, but the database has no users. Run the seed script.
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {ROLE_ORDER.map((role) => {
              const roleUsers = grouped[role] ?? [];
              if (!roleUsers.length) return null;
              const meta = ROLE_META[role] ?? { label: role, description: "", color: "", bg: "" };
              return (
                <section key={role}>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-lg font-semibold">{meta.label}</h2>
                    <span className="text-sm text-slate-500">{meta.description}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {roleUsers.map((user) => {
                      const isActive = impersonating === user.id;
                      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
                      const orgLabel = user.organisationId ? ORG_NAMES[user.organisationId] ?? user.organisationId : null;
                      const partnerLabel = !orgLabel && user.partnerId ? PARTNER_NAMES[user.partnerId] ?? user.partnerId : null;

                      return (
                        <button
                          key={user.id}
                          onClick={() => loginAs(user.id)}
                          disabled={isActive}
                          className={`
                            text-left rounded-xl border p-4 transition-all group relative
                            ${isActive
                              ? "border-indigo-500 bg-indigo-600/20 cursor-default"
                              : "border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800/80 cursor-pointer"
                            }
                          `}
                        >
                          {isActive && (
                            <span className="absolute top-3 right-3 text-xs font-semibold text-indigo-400 bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 rounded-full">
                              Active
                            </span>
                          )}
                          <div className="flex items-center gap-3 mb-2">
                            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-sm shrink-0">
                              {(user.firstName?.[0] ?? user.email[0]).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{displayName}</div>
                              <div className="text-xs text-slate-400 truncate">{user.email}</div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <RoleBadge role={user.role} />
                            {orgLabel && (
                              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">{orgLabel}</span>
                            )}
                            {partnerLabel && (
                              <span className="text-xs text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">{partnerLabel}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-12 p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
          <strong className="text-slate-400">Note:</strong> This page is only available in development. In production it returns 404. 
          To switch accounts while browsing, use the <span className="text-slate-300">Dev Tools</span> panel (bottom-right corner).
        </div>
      </div>
    </div>
  );
}
