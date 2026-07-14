import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetMe } from '@workspace/api-client-react';
import { API } from '@/lib/api';

const ROLES = ['super_admin', 'partner_admin', 'org_admin', 'coach', 'learner'] as const;

export function DevRoleSwitcher() {
  const { data: user } = useGetMe();
  const currentRole = user?.role ?? '';
  const [loading, setLoading] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const switchRole = async (role: string) => {
    setLoading(role);
    try {
      await fetch(`${API}/dev/set-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      await queryClient.invalidateQueries();
      window.location.reload();
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {open && (
        <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-3 flex flex-col gap-2 min-w-[160px]">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Dev Tools</div>
          <div className="flex flex-col gap-1">
            {ROLES.map((role) => {
              const isActive = currentRole === role;
              const isLoading = loading === role;
              return (
                <button
                  key={role}
                  onClick={() => switchRole(role)}
                  disabled={isLoading}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                  } disabled:opacity-60`}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                      {role}
                    </span>
                  ) : role}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle pill */}
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-indigo-400 inline-block" />
        {currentRole || 'dev'}
      </button>
    </div>
  );
}
