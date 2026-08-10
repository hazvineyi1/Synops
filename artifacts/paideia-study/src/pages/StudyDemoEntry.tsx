import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";

// One-click, no-sign-up demo entry. On mount it POSTs to the demo-login endpoint,
// which sets an httpOnly session cookie for a pre-seeded demo learner. On success
// we do a FULL navigation (not client-side) so StudyAuthProvider re-hydrates
// /auth/me from the fresh cookie. On failure the visitor gets a clear message
// and a "Try again" button.
export default function StudyDemoEntry() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const startDemo = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/study/auth/demo-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.ok) {
        // Full reload so the auth context refetches with the new session cookie.
        window.location.href = import.meta.env.BASE_URL || "/study/";
        return;
      }
      if (res.status === 404) {
        setError("The live demo isn't available right now. Please try again later.");
        return;
      }
      if (res.status === 503) {
        setError("The demo is warming up. Give it a moment, then try again.");
        return;
      }
      setError("We couldn't start the demo. Please try again.");
    } catch {
      setError("We couldn't reach the demo. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    startDemo();
  }, [startDemo, attempt]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 gap-6 text-center">
      <div className="flex items-center gap-2">
        <BookOpen className="h-6 w-6 text-primary" />
        <span className="font-bold text-lg">Synops Coach</span>
      </div>

      {!error ? (
        <>
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-sm text-muted-foreground">Starting your demo…</p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 max-w-sm">
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}
    </div>
  );
}
