/**
 * Pure helpers for white-label branding. Kept free of Express/DB so the host
 * normalization and the accent/url/domain validators can be unit-tested without
 * a server. Branding is cosmetic: a resolved host NEVER authorizes anything.
 */

/**
 * Normalize a Host header into a bare, comparable hostname:
 *   - lowercased and trimmed,
 *   - port stripped ("example.com:443" -> "example.com"),
 *   - a single trailing dot stripped ("example.com." -> "example.com").
 * Returns null for an empty/missing host. We intentionally read the raw Host
 * header (not forwarded-host) at the call site so a client cannot spoof another
 * tenant's branding.
 */
export function normalizeHost(host: string | undefined | null): string | null {
  if (!host) return null;
  let h = host.trim().toLowerCase();
  if (!h) return null;
  // Strip a trailing ":port" (hostnames never contain a colon; IPv6 literals are
  // not used for tenant domains).
  h = h.replace(/:\d+$/, "");
  // Strip a single fully-qualified trailing dot.
  if (h.endsWith(".")) h = h.slice(0, -1);
  return h || null;
}

/** A 3- or 6-digit hex color, e.g. "#0a7" or "#0aa77c". */
export function isValidAccentColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * A safe logo URL: either an absolute https URL or a site-relative path. We
 * reject http (mixed content), protocol-relative ("//evil"), and anything that
 * is not parseable, to avoid storing javascript:/data: or insecure references.
 */
export function isValidLogoUrl(value: string): boolean {
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * A plausible DNS hostname for a custom domain: dot-separated labels of
 * letters/digits/hyphens (no leading/trailing hyphen), a letters-only TLD, and
 * an overall length within DNS limits. Validate the already-normalized value.
 */
export function isValidDomain(value: string): boolean {
  if (value.length > 253) return false;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value);
}
