import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Usage } from "@/lib/types";

interface UsageCtx {
  usage: Usage | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<UsageCtx | null>(null);

export function UsageProvider({ children }: { children: ReactNode }) {
  const { teacher } = useAuth();
  const [usage, setUsage] = useState<Usage | null>(null);

  const refresh = useCallback(async () => {
    if (!teacher || teacher.status !== "active" || !teacher.onboardedAt) {
      setUsage(null);
      return;
    }
    try {
      const u = await api.get<Usage>("/billing/usage");
      setUsage(u);
    } catch {
      setUsage(null);
    }
  }, [teacher?.id, teacher?.status, teacher?.onboardedAt]);

  useEffect(() => { void refresh(); }, [refresh]);

  return <Ctx.Provider value={{ usage, refresh }}>{children}</Ctx.Provider>;
}

export function useUsage(): UsageCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUsage outside UsageProvider");
  return v;
}
