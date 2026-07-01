// Usage telemetry: the client posts a heartbeat while the app is open. We keep one
// open activity_session per user (continued while heartbeats keep arriving), and
// start a fresh session after a gap. This yields login times, time-on-app, device,
// IP and geo per visit, plus the user's last_active_at marker — the raw data behind
// the admin analytics and upgrade targeting. Any authenticated user may call it.
import { Router, type IRouter, type Request } from "express";
import { db, studyUsersTable, studyActivitySessionsTable } from "@workspace/paideia-db";
import { and, desc, eq, gte } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireStudyUser);

// A new session starts if no heartbeat has arrived within this many minutes.
const SESSION_WINDOW_MIN = 30;

function firstHeader(req: Request, name: string): string | null {
  const v = req.headers[name];
  const s = Array.isArray(v) ? v[0] : v;
  return s ? String(s) : null;
}

function clientIp(req: Request): string | null {
  const xff = firstHeader(req, "x-forwarded-for");
  const ip = (xff ? xff.split(",")[0] : req.socket?.remoteAddress) ?? "";
  return ip.trim() || null;
}

// Coarse "Browser · OS · FormFactor" label from the user-agent string.
function parseDevice(ua: string): string {
  const browser = /Edg/i.test(ua)
    ? "Edge"
    : /OPR|Opera/i.test(ua)
      ? "Opera"
      : /Chrome/i.test(ua)
        ? "Chrome"
        : /Firefox/i.test(ua)
          ? "Firefox"
          : /Safari/i.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Unknown";
  const form = /Mobile/i.test(ua) ? "Mobile" : /Tablet|iPad/i.test(ua) ? "Tablet" : "Desktop";
  return `${browser} · ${os} · ${form}`;
}

// POST /telemetry/heartbeat  { path?: string }
router.post("/heartbeat", async (req, res) => {
  const user = req.studyUser;
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const now = new Date();
  const cutoff = new Date(now.getTime() - SESSION_WINDOW_MIN * 60_000);

  // Recency marker for "active users" metrics and upgrade targeting.
  await db.update(studyUsersTable).set({ lastActiveAt: now }).where(eq(studyUsersTable.id, user.id));

  // Continue the open session if the last heartbeat was recent; else open a new one.
  const open = await db
    .select({ id: studyActivitySessionsTable.id })
    .from(studyActivitySessionsTable)
    .where(and(eq(studyActivitySessionsTable.userId, user.id), gte(studyActivitySessionsTable.lastSeenAt, cutoff)))
    .orderBy(desc(studyActivitySessionsTable.lastSeenAt))
    .limit(1);

  if (open[0]) {
    await db.update(studyActivitySessionsTable).set({ lastSeenAt: now }).where(eq(studyActivitySessionsTable.id, open[0].id));
    res.json({ ok: true, sessionId: open[0].id, continued: true });
    return;
  }

  const ua = firstHeader(req, "user-agent") ?? "";
  // Geo comes from edge/CDN headers when present (Cloudflare / Vercel-style); null otherwise.
  const country = firstHeader(req, "cf-ipcountry") ?? firstHeader(req, "x-vercel-ip-country") ?? null;
  const region = firstHeader(req, "x-vercel-ip-country-region");
  const city = firstHeader(req, "x-vercel-ip-city");
  const path = typeof req.body?.path === "string" ? req.body.path.slice(0, 300) : null;

  const inserted = await db
    .insert(studyActivitySessionsTable)
    .values({
      userId: user.id,
      startedAt: now,
      lastSeenAt: now,
      ipAddress: clientIp(req),
      userAgent: ua || null,
      device: ua ? parseDevice(ua) : null,
      country,
      region,
      city,
      entryPath: path,
    })
    .returning({ id: studyActivitySessionsTable.id });

  res.json({ ok: true, sessionId: inserted[0]?.id, continued: false });
});

export default router;
