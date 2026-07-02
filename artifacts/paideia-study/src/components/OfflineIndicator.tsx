import { useEffect, useState } from "react";

// A small, unobtrusive banner shown when the browser goes offline. The service
// worker keeps previously-viewed study content readable offline; this just makes
// the state visible and sets expectations (AI actions need a connection). Sized
// and positioned to stay out of the way on small Android screens.
export function OfflineIndicator() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && !navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-0 inset-x-0 z-[70] bg-neutral-800 text-white text-xs text-center px-3 py-1.5"
    >
      You are offline. Showing saved content; new questions and uploads need a connection.
    </div>
  );
}
