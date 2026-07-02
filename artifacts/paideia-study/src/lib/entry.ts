// Detect whether a visitor reached the Coach from the marketing site
// (synops-consulting.com) or directly. Marketing links carry ?from=web; we also
// fall back to the document referrer. The result is stashed in sessionStorage so it
// persists as the visitor moves from the landing into sign-up / sign-in.
const KEY = "coach_entry_source";
const MARKETING_HOSTS = ["synops-consulting.com", "www.synops-consulting.com"];

export function captureEntrySource(): void {
  try {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from) {
      sessionStorage.setItem(KEY, from);
      return;
    }
    if (!sessionStorage.getItem(KEY) && document.referrer) {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (MARKETING_HOSTS.includes(host)) sessionStorage.setItem(KEY, "web");
    }
  } catch {
    /* sessionStorage / URL parsing can throw in odd environments; ignore */
  }
}

// True when the visit originated from the marketing website (US-facing brand).
export function cameFromMarketing(): boolean {
  try {
    const from = new URLSearchParams(window.location.search).get("from");
    if (from === "web" || from === "marketing") return true;
    const stored = sessionStorage.getItem(KEY);
    if (stored === "web" || stored === "marketing") return true;
    if (document.referrer) {
      const host = new URL(document.referrer).hostname.toLowerCase();
      return MARKETING_HOSTS.includes(host);
    }
    return false;
  } catch {
    return false;
  }
}
