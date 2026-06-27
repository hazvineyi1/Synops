import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable, activitySessionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// A gap longer than this since the last heartbeat starts a new session/visit.
const SESSION_GAP_MS = 15 * 60 * 1000; // 15 minutes

// Coarse device/browser/OS from the user-agent — no third-party dependency.
function parseDevice(ua: string): string {
  if (!ua) return "Unknown";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Android/i.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "";
  const kind = /Mobile|Android|iPhone|iPad/i.test(ua) ? "Mobile" : "Desktop";
  return [browser, os, kind].filter(Boolean).join(" · ") || "Unknown";
}

// Best-effort geo lookup for a public IP (ip-api.com free tier, no key). Skips
// private/loopback addresses. Never throws.
async function geoLookup(ip: string): Promise<{ country?: string; region?: string; city?: string } | null> {
  if (
    !ip ||
    ip === "::1" ||
    ip.startsWith("127.") ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("169.254.")
  ) {
    return null;
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: AbortSignal.timeout(4000) },
    );
    const j: any = await res.json();
    if (j?.status === "success") return { country: j.country, region: j.regionName, city: j.city };
  } catch {
    /* ignore */
  }
  return null;
}

// POST /activity/heartbeat — the client pings this while the app is open and
// focused. Updates last-seen and extends (or starts) the current session. On a
// new session we capture IP, device, and location so the admin can see who is
// logging in, from where, and on what.
router.post("/activity/heartbeat", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const now = new Date();

  await db.update(usersTable).set({ lastSeenAt: now }).where(eq(usersTable.id, userId));

  const recent = await db
    .select()
    .from(activitySessionsTable)
    .where(eq(activitySessionsTable.userId, userId))
    .orderBy(desc(activitySessionsTable.id))
    .limit(1);
  const last = recent[0];

  if (last && now.getTime() - new Date(last.lastSeenAt).getTime() < SESSION_GAP_MS) {
    await db
      .update(activitySessionsTable)
      .set({ lastSeenAt: now })
      .where(eq(activitySessionsTable.id, last.id));
    res.json({ ok: true });
    return;
  }

  const ip = String(req.ip ?? "").replace(/^::ffff:/, "");
  const ua = (req.headers["user-agent"] as string) || "";
  const [created] = await db
    .insert(activitySessionsTable)
    .values({
      userId,
      startedAt: now,
      lastSeenAt: now,
      ipAddress: ip || null,
      userAgent: ua || null,
      device: parseDevice(ua),
    })
    .returning();
  res.json({ ok: true, newSession: true });

  // Fill in location asynchronously so we don't slow the heartbeat.
  if (created && ip) {
    geoLookup(ip)
      .then((geo) => {
        if (!geo) return;
        return db
          .update(activitySessionsTable)
          .set({ country: geo.country ?? null, region: geo.region ?? null, city: geo.city ?? null })
          .where(eq(activitySessionsTable.id, created.id));
      })
      .catch((err) => logger.warn({ err }, "geo lookup failed"));
  }
});

export default router;
