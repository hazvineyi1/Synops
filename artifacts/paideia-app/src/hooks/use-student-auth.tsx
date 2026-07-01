import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Student } from "@/lib/types";

interface Ctx {
  student: Student | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setStudent: (s: Student | null) => void;
  signOut: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);

export function StudentAuthProvider({ children }: { children: ReactNode }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await api.get<{ student: Student | null }>("/student/me");
      setStudent(res.student);
    } catch {
      setStudent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const signOut = async () => {
    await api.post("/student/logout");
    setStudent(null);
  };

  return (
    <C.Provider value={{ student, loading, refresh, setStudent, signOut }}>
      {children}
    </C.Provider>
  );
}

export function useStudentAuth(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useStudentAuth outside provider");
  return v;
}
