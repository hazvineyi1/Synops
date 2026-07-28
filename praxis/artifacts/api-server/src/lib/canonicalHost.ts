/**
 * Should this request be permanently redirected from the raw Railway host to the branded domain?
 *
 * The app is reached on both `*.up.railway.app` (Railway's default domain) and the branded
 * `praxis.synops-consulting.com`. Old bookmarks and stale email links carry the Railway host and
 * expose it in the address bar. This predicate decides, for one request, whether to 301 it to the
 * canonical host.
 *
 * Only navigational GET/HEAD requests are redirected. Deliberately excluded:
 *  - `/api/*` — includes Railway's `/api/readyz` health check (a 301 there would fail deploys) and
 *    all API mutations, which must never be bounced or have their body dropped.
 *  - `/c/*` and `/a/*` — token embeds designed to render inside external sites; leave their host alone.
 *  - the canonical host itself — it does not end with `.up.railway.app`, so no redirect loop.
 * Set `canonicalHost` to "" (via the CANONICAL_HOST env) to disable entirely.
 */
export function shouldRedirectToCanonical(
  host: string,
  method: string,
  path: string,
  canonicalHost: string,
): boolean {
  if (!canonicalHost) return false;
  if (method !== "GET" && method !== "HEAD") return false;
  if (!host.endsWith(".up.railway.app")) return false;
  if (path.startsWith("/api") || path.startsWith("/c/") || path.startsWith("/a/")) return false;
  return true;
}
