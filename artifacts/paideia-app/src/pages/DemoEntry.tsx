import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { Teacher } from "@/lib/types";

// Number of automatic retries while the demo is warming up (503).
const MAX_WARMUP_RETRIES = 8;
const WARMUP_DELAY_MS = 2000;

export default function DemoEntry() {
  const [, setLoc] = useLocation();
  const { setTeacher } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const retriesRef = useRef(0);

  const start = useCallback(async () => {
    setError(null);
    // Remember that this visitor arrived from the marketing site, so the app can offer a
    // one-tap route back to Synops home from anywhere in the demo.
    try { window.localStorage.setItem("synops_from_marketing", "1"); } catch { /* ignore */ }
    try {
      const res = await api.post<{ teacher: Teacher }>("/auth/demo-login");
      setTeacher(res.teacher);
      setLoc("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.status === 503 && retriesRef.current < MAX_WARMUP_RETRIES) {
        retriesRef.current += 1;
        setTimeout(() => void start(), WARMUP_DELAY_MS);
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setError("The live demo isn't available right now. Please sign in or create an account.");
        return;
      }
      setError(err instanceof ApiError ? err.message : "We couldn't start the demo. Please try again.");
    }
  }, [setTeacher, setLoc]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [start]);

  const retry = () => {
    retriesRef.current = 0;
    void start();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-8 py-6 border-b bg-card">
        <Link href="/" className="inline-block">
          <div className="font-serif text-2xl text-primary leading-tight">Synops</div>
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          {error ? (
            <>
              <h1 className="font-serif text-4xl text-primary mb-3">Demo unavailable</h1>
              <p className="text-muted-foreground mb-8">{error}</p>
              <div className="flex flex-col gap-3">
                <Button className="w-full" onClick={retry}>Try again</Button>
                <Button variant="outline" className="w-full" onClick={() => setLoc("/signup")}>
                  Create a free account
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="relative h-12 w-12 mb-6 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
              <h1 className="font-serif text-4xl text-primary mb-3">Starting your demo…</h1>
              <p className="text-muted-foreground">Setting up a ready-made teacher account. No sign-up needed.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
