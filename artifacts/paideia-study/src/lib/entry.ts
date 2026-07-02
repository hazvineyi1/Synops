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

// The US-facing marketing brand's domain(s). Loading the Coach on one of these,
// or arriving from one, means the visitor is in the US audience.
const US_HOSTS = ["synops-consulting.com", "www.synops-consulting.com"];

// True for the US audience: on the US marketing domain, or arrived from it. Anyone
// on the Coach's own domain (e.g. synopscoach.com) or reaching it directly is treated
// as the African/global audience.
export function isUsAudience(): boolean {
  try {
    const host = window.location.hostname.toLowerCase();
    if (US_HOSTS.includes(host)) return true;
    return cameFromMarketing();
  } catch {
    return false;
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
