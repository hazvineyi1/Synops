import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, analyticsEventsTable } from "@workspace/paideia-db";
import { hashIp, clientIp } from "../../lib/eventLog.js";

const router: IRouter = Router();

// Lightweight in-memory rate limit for the public ingest endpoint.
// Keyed by hashed IP + anonymousId. Burst window of 60s.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_EVENTS_PER_KEY = 600; // up to 10/sec sustained
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateAllow(key: string, weight: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: weight, resetAt: now + RATE_WINDOW_MS });
    return weight <= RATE_MAX_EVENTS_PER_KEY;
  }
  b.count += weight;
  return b.count <= RATE_MAX_EVENTS_PER_KEY;
}
// Periodic cleanup of expired buckets to bound memory.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 5 * 60_000).unref?.();

const MAX_PROP_BYTES = 4000;
function trimProps(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {};
  try {
    const json = JSON.stringify(props);
    if (json.length <= MAX_PROP_BYTES) return props;
    return { _truncated: true, _bytes: json.length };
  } catch {
    return { _invalid: true };
  }
}

const eventSchema = z.object({
  name: z.string().min(1).max(80),
  surface: z.enum(["app", "site", "student"]),
  path: z.string().max(400).optional().nullable(),
  referrer: z.string().max(400).optional().nullable(),
  props: z.record(z.string(), z.unknown()).optional(),
  occurredAt: z.string().datetime().optional(),
});

const batchSchema = z.object({
  anonymousId: z.string().max(80).optional().nullable(),
  sessionId: z.string().max(80).optional().nullable(),
  events: z.array(eventSchema).min(1).max(50),
});

router.post("/", async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { anonymousId, sessionId, events } = parsed.data;
  const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 500) || null;
  const ipHash = hashIp(clientIp(req));
  const rateKey = `${ipHash ?? "no-ip"}|${anonymousId ?? "anon"}`;
  if (!rateAllow(rateKey, events.length)) {
    res.status(429).json({ error: "Too many events" });
    return;
  }
  const teacherId = req.teacher?.id ?? null;
  const studentId = req.student?.id ?? null;
  try {
    await db.insert(analyticsEventsTable).values(
      events.map((e) => ({
        teacherId,
        studentId,
        anonymousId: anonymousId ?? null,
        sessionId: sessionId ?? null,
        surface: e.surface,
        eventName: e.name,
        path: e.path ?? null,
        referrer: e.referrer ?? null,
        props: trimProps(e.props),
        userAgent,
        ipHash,
        ...(e.occurredAt ? { occurredAt: new Date(e.occurredAt) } : {}),
      })),
    );
    res.json({ ok: true, count: events.length });
  } catch (err) {
    req.log?.warn({ err }, "event ingest failed");
    res.status(500).json({ error: "Could not record events" });
  }
});

router.post("/identify", async (_req, res) => {
  // Currently identification is implicit: when a logged-in teacher posts events,
  // their teacherId is attached server-side. This endpoint is reserved for
  // future server-side stitching of anonymousId history to teacherId.
  res.json({ ok: true });
});

export default router;
