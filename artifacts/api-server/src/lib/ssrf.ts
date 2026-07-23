import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for outbound webhook delivery. User-registered webhook URLs are
 * POSTed to server-side, so without this a caller could point a webhook at
 * loopback, RFC-1918, link-local, or the cloud metadata endpoint
 * (169.254.169.254) and drive requests against internal infrastructure. We
 * block those destinations both when a webhook is registered and again at
 * delivery time (a public hostname can still resolve into private space).
 */

/** True if an IPv4/IPv6 literal is loopback, private, link-local, CGNAT, or otherwise non-public. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

function hostnameOf(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  let host = u.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // strip IPv6 brackets
  return host || null;
}

/**
 * Structural check on the URL alone (no DNS): rejects non-http(s) schemes,
 * localhost/.local/.internal names, and private/loopback IP literals. Cheap and
 * synchronous, suitable for request validation.
 */
export function isBlockedWebhookUrl(raw: string): boolean {
  const host = hostnameOf(raw);
  if (!host) return true;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (net.isIP(host) && isPrivateIp(host)) return true;
  return false;
}

/**
 * Full check: the structural guard plus a DNS resolution that rejects public
 * hostnames which resolve into private space. Returns false (unsafe) on any
 * parse/resolution failure so delivery fails closed.
 */
export async function isSafeWebhookTarget(raw: string): Promise<boolean> {
  if (isBlockedWebhookUrl(raw)) return false;
  const host = hostnameOf(raw);
  if (!host) return false;
  if (net.isIP(host)) return true; // literal already validated above
  try {
    const results = await dns.lookup(host, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateIp(r.address));
  } catch {
    return false; // unresolvable -> do not deliver
  }
}
