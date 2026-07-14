import React, { createContext, useContext, useEffect, useState } from "react";
import { API } from "@/lib/api";

interface DevUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface DevSessionState {
  devUser: DevUser | null;
  isDevSession: boolean;
  loading: boolean;
  clearDevSession: () => Promise<void>;
}

const DevSessionContext = createContext<DevSessionState>({
  devUser: null,
  isDevSession: false,
  loading: true,
  clearDevSession: async () => {},
});

export function DevSessionProvider({ children }: { children: React.ReactNode }) {
  const [devUser, setDevUser] = useState<DevUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/dev/impersonate`, { credentials: "include" })
      .then((r) => r.json())
      .then(({ impersonating }) => setDevUser(impersonating ?? null))
      .catch(() => setDevUser(null))
      .finally(() => setLoading(false));
  }, []);

  const clearDevSession = async () => {
    await fetch(`${API}/dev/impersonate`, { method: "DELETE", credentials: "include" });
    setDevUser(null);
    window.location.href = "/dev-login";
  };

  return (
    <DevSessionContext.Provider value={{ devUser, isDevSession: !!devUser, loading, clearDevSession }}>
      {children}
    </DevSessionContext.Provider>
  );
}

export function useDevSession() {
  return useContext(DevSessionContext);
}
