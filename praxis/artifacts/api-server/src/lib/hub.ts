/**
 * Hub mode: run this Praxis deployment as a single client's focused hub (for example the MRB
 * Practice Hub at its own address), from the same codebase and image as the main Praxis service.
 *
 *   HUB_MODE=mrb       the deployment opens on the MRB Practice Hub and hides other Synops demos.
 *   (unset or empty)   ordinary multi-tenant Praxis. Nothing changes.
 *
 * The SPA learns the mode from a <meta name="praxis-hub"> tag the server injects into index.html, so
 * one built image serves both deployments and the mode is a runtime setting, not a rebuild.
 *
 *   MRB_HUB_URL=https://mrb.synops-consulting.com
 *     Set on the MAIN Praxis service only, at go-live: the old public demo path /demos/mrb then
 *     permanently redirects to the MRB hub. Leave unset until the hub is live.
 */
const KNOWN_HUBS = new Set(["mrb"]);

/** The active hub key ("mrb"), or "" when this is ordinary Praxis. Unknown values are ignored. */
export function hubMode(): string {
  const v = (process.env.HUB_MODE ?? "").trim().toLowerCase();
  return KNOWN_HUBS.has(v) ? v : "";
}

/** Add the hub meta tag to an index.html shell. A no-op outside hub mode. */
export function injectHubMeta(html: string, mode: string = hubMode()): string {
  if (!mode) return html;
  return html.replace(/<\/head>/i, `    <meta name="praxis-hub" content="${mode}" />\n  </head>`);
}

/**
 * Where the old /demos/mrb path should redirect, or null to leave it alone. Only an absolute https
 * URL is accepted, and never on the hub itself (that would loop).
 */
export function mrbHubRedirectTarget(mode: string = hubMode()): string | null {
  if (mode === "mrb") return null;
  const raw = (process.env.MRB_HUB_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}
