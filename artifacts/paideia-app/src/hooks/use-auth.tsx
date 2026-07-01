import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { identify, track } from "@/lib/analytics";
import type { Teacher, ImpersonationStatus } from "@/lib/types";

interface AuthCtx {
  teacher: Teacher | null;
  impersonator: Teacher | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setTeacher: (t: Teacher | null) => void;
  signOut: () => Promise<void>;
  impersonateTeacher: (id: string) => Promise<Teacher | null>;
  impersonateStudent: (id: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [impersonator, setImpersonator] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await api.get<{ teacher: Teacher | null; impersonator: Teacher | null }>("/auth/me");
      setTeacher(res.teacher);
      setImpersonator(res.impersonator ?? null);
      if (res.teacher) identify();
    } catch {
      setTeacher(null);
      setImpersonator(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const setTeacherTracked = (t: Teacher | null) => {
    setTeacher(t);
    if (t) {
      identify();
      track("session_started");
    }
  };

  const signOut = async () => {
    track("sign_out_clicked");
    await api.post("/auth/logout");
    setTeacher(null);
    setImpersonator(null);
  };

  const impersonateTeacher = async (id: string): Promise<Teacher | null> => {
    const res = await api.post<{ teacher: Teacher }>(`/admin/impersonate/teacher/${id}`);
    if (res.teacher) {
      setTeacher(res.teacher);
      setImpersonator((prev) => prev ?? teacher);
    }
    return res.teacher ?? null;
  };

  const impersonateStudent = async (id: string): Promise<void> => {
    await api.post(`/admin/impersonate/student/${id}`);
    await refresh();
  };

  const stopImpersonating = async (): Promise<void> => {
    await api.post("/admin/impersonate/stop");
    await refresh();
  };

  return (
    <Ctx.Provider
      value={{
        teacher,
        impersonator,
        loading,
        refresh,
        setTeacher: setTeacherTracked,
        signOut,
        impersonateTeacher,
        impersonateStudent,
        stopImpersonating,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
