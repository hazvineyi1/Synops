import { db } from "@workspace/db";
import { usersTable, authSessionsTable, auditEventsTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { sendEmail, emailEnabled } from "./email";
import { logger } from "./logger";

/**
 * Security alerts for partner-side sign-ins.
 *
 * The super admin asked to be emailed for every partner account sign-in with the time, IP, place and
 * device, and — when the session ends — how long they were on and what they did. These are the two
 * calls that deliver that: notifyLogin() fires the instant they sign in; notifyLogout() fires when the
 * session is revoked, computing duration and summarising recorded activity. Both are best-effort and
 * fire-and-forget: they must never block or fail a login/logout.
 */

// Which roles count as "partner side". Super admins and platform IDs are excluded — we only watch the
// partner tenants' people (admins, coaches, learners).
const PARTNER_ROLES = new Set(["partner_admin", "org_admin", "coach", "learner"]);

function isPartnerSide(user: { role: string; partnerId?: string | null }): boolean {
  return PARTNER_ROLES.has(user.role) || !!user.partnerId;
}

/** Super-admin recipient addresses, plus an optional SECURITY_ALERT_EMAIL override/addition. */
async function alertRecipients(): Promise<string[]> {
  const set = new Set<string>();
  const env = process.env.SECURITY_ALERT_EMAIL?.trim();
  if (env) env.split(",").map((e) => e.trim()).filter(Boolean).forEach((e) => set.add(e));
  try {
    const rows = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.role, "super_admin"));
    rows.forEach((r) => r.email && set.add(r.email));
  } catch { /* best-effort */ }
  return [...set];
}

/** Best-effort IP → "City, Region, Country". Skips private/loopback addresses; never throws. */
async function placeFromIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const bare = ip.replace(/^::ffff:/, "");
  if (bare === "127.0.0.1" || bare === "::1" || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(bare)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(bare)}?fields=status,city,regionName,country`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = (await r.json()) as { status?: string; city?: string; regionName?: string; country?: string };
    if (j.status !== "success") return null;
    return [j.city, j.regionName, j.country].filter(Boolean).join(", ") || null;
  } catch { return null; }
}

/** Light device description from a user-agent string. */
function deviceFromUa(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${br} on ${os}`;
}

function fullName(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || (u.email ?? "Unknown user");
}

type AlertUser = { id: string; email?: string | null; firstName?: string | null; lastName?: string | null; role: string; partnerId?: string | null };

/** Email the super admin the moment a partner-side account signs in. */
export async function notifyLogin(user: AlertUser, ip: string | null, userAgent: string | null): Promise<void> {
  if (!isPartnerSide(user) || !emailEnabled()) return;
  try {
    const [recipients, place] = await Promise.all([alertRecipients(), placeFromIp(ip)]);
    if (!recipients.length) return;
    const when = new Date().toUTCString();
    const rows = [
      ["User", `${fullName(user)} (${user.email ?? ""})`],
      ["Role", user.role],
      ["Time", when],
      ["IP address", (ip ?? "unknown").replace(/^::ffff:/, "")],
      ["Location", place ?? "Unknown (could not resolve)"],
      ["Device", deviceFromUa(userAgent)],
    ];
    const html = `<h2 style="font-family:sans-serif">Partner sign-in</h2><table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`).join("")}</table>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    for (const to of recipients) await sendEmail({ to, subject: `Sign-in: ${fullName(user)} (${user.role})`, html, text });
  } catch (err) {
    logger.error({ err }, "notifyLogin failed");
  }
}

/** On logout, email a summary: how long the session lasted and what was recorded during it. */
export async function notifyLogout(user: AlertUser, sessionToken: string | null): Promise<void> {
  if (!isPartnerSide(user) || !emailEnabled() || !sessionToken) return;
  try {
    const [session] = await db.select().from(authSessionsTable).where(eq(authSessionsTable.token, sessionToken)).limit(1);
    if (!session) return;
    const start = session.createdAt ?? new Date();
    const end = new Date();
    const mins = Math.max(0, Math.round((end.getTime() - new Date(start).getTime()) / 60000));
    const durationLabel = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;

    const activity = await db.select({ action: auditEventsTable.action, resourceType: auditEventsTable.resourceType, createdAt: auditEventsTable.createdAt })
      .from(auditEventsTable)
      .where(and(eq(auditEventsTable.actorId, user.id), gte(auditEventsTable.createdAt, new Date(start))))
      .orderBy(desc(auditEventsTable.createdAt))
      .limit(50);

    const recipients = await alertRecipients();
    if (!recipients.length) return;

    const actionList = activity.length
      ? activity.map((a) => `<li>${new Date(a.createdAt).toUTCString()} — ${a.action} (${a.resourceType})</li>`).join("")
      : "<li>No recorded actions during this session.</li>";
    const rows = [
      ["User", `${fullName(user)} (${user.email ?? ""})`],
      ["Signed in", new Date(start).toUTCString()],
      ["Signed out", end.toUTCString()],
      ["Time logged in", durationLabel],
      ["IP address", (session.ipAddress ?? "unknown").replace(/^::ffff:/, "")],
      ["Recorded actions", String(activity.length)],
    ];
    const html = `<h2 style="font-family:sans-serif">Partner session ended</h2><table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><strong>${v}</strong></td></tr>`).join("")}</table><h3 style="font-family:sans-serif;font-size:14px">Activity</h3><ul style="font-family:sans-serif;font-size:13px">${actionList}</ul>`;
    const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\nActivity:\n" + (activity.length ? activity.map((a) => `- ${new Date(a.createdAt).toUTCString()} ${a.action} (${a.resourceType})`).join("\n") : "No recorded actions.");
    for (const to of recipients) await sendEmail({ to, subject: `Session ended: ${fullName(user)} (${durationLabel})`, html, text });
  } catch (err) {
    logger.error({ err }, "notifyLogout failed");
  }
}
