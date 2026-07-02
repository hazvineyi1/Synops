import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Frontend error tracking. No-op unless VITE_SENTRY_DSN is set at build time, so
// dev and un-configured builds behave exactly as before. Errors only (no perf).
const sentryDsn = (import.meta.env as Record<string, string | undefined>)["VITE_SENTRY_DSN"];
if (sentryDsn) {
  try {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0,
    });
  } catch {
    /* never let error tracking break app startup */
  }
}

createRoot(document.getElementById("root")!).render(<App />);
