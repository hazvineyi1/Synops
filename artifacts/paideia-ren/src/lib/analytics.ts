type Props = Record<string, unknown>;

const ANON_KEY = "pr_anon_id";
const SESSION_KEY = "pr_session_id";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxxxxxx4xxx".replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function getAnonymousId(): string {
  try {
    let v = localStorage.getItem(ANON_KEY);
    if (!v) {
      v = uuid();
      localStorage.setItem(ANON_KEY, v);
    }
    return v;
  } catch {
    return "unknown";
  }
}

export function getSessionId(): string {
  try {
    let v = sessionStorage.getItem(SESSION_KEY);
    if (!v) {
      v = uuid();
      sessionStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    return "unknown";
  }
}

export function getUtm(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof window === "undefined") return out;
  const params = new URLSearchParams(window.location.search);
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

interface QueuedEvent {
  name: string;
  surface: "app" | "site" | "student";
  path: string | null;
  referrer: string | null;
  props: Props;
  occurredAt: string;
}

const queue: QueuedEvent[] = [];
const FLUSH_INTERVAL_MS = 5000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let surfaceDefault: "app" | "site" | "student" = "site";
let endpointBase = "/api/copilot";

export interface InitOpts {
  surface: "app" | "site" | "student";
  endpoint?: string;
}

export function initAnalytics(opts: InitOpts): void {
  surfaceDefault = opts.surface;
  if (opts.endpoint) endpointBase = opts.endpoint;
  if (typeof window === "undefined") return;
  // SPA page views are emitted by the AnalyticsTracker on location change.
  // The initial view fires from there with utm props attached at first render.
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const el = target.closest<HTMLElement>("[data-track]");
    if (!el) return;
    const name = el.getAttribute("data-track");
    if (!name) return;
    const props: Props = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith("data-track-") && a.name !== "data-track") {
        props[a.name.slice("data-track-".length)] = a.value;
      }
    }
    track(`click:${name}`, props);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

export function track(name: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  queue.push({
    name,
    surface: surfaceDefault,
    path: window.location.pathname + window.location.search,
    referrer: document.referrer || null,
    props,
    occurredAt: new Date().toISOString(),
  });
  if (!flushTimer) flushTimer = setTimeout(() => void flush(false), FLUSH_INTERVAL_MS);
  if (queue.length >= 20) void flush(false);
}

export function trackPageView(path?: string): void {
  track("page_view", { path: path ?? (typeof window !== "undefined" ? window.location.pathname : null) });
}

async function flush(useBeacon: boolean): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({
    anonymousId: getAnonymousId(),
    sessionId: getSessionId(),
    events,
  });
  const url = `${endpointBase}/events`;
  try {
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
    await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // silently drop
  }
}
