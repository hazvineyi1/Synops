import { createHash } from "crypto";
import type { Request } from "express";
import { db, analyticsEventsTable } from "@workspace/paideia-db";

const IP_SALT = process.env["ANALYTICS_IP_SALT"] ?? "paideia-ren-default-salt";
if (!process.env["ANALYTICS_IP_SALT"]) {
  // eslint-disable-next-line no-console
  console.warn(
    "[analytics] ANALYTICS_IP_SALT is not set; using a default salt. Set this environment variable in production for consistent IP anonymisation.",
  );
}

export function hashIp(ip: string | undefined | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(IP_SALT + "|" + ip).digest("hex").slice(0, 32);
}

function clientIp(req: Request): string | undefined {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  return req.socket?.remoteAddress ?? undefined;
}

export interface LogEventOpts {
  surface?: string;
  path?: string | null;
  referrer?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  occurredAt?: Date;
}

export async function logEvent(
  req: Request,
  eventName: string,
  props: Record<string, unknown> = {},
  opts: LogEventOpts = {},
): Promise<void> {
  try {
    await db.insert(analyticsEventsTable).values({
      teacherId: req.teacher?.id ?? null,
      studentId: req.student?.id ?? null,
      anonymousId: opts.anonymousId ?? (typeof req.headers["x-anon-id"] === "string" ? req.headers["x-anon-id"] : null),
      sessionId: opts.sessionId ?? (typeof req.headers["x-session-id"] === "string" ? req.headers["x-session-id"] : null),
      surface: opts.surface ?? "api",
      eventName,
      path: opts.path ?? null,
      referrer: opts.referrer ?? null,
      props,
      userAgent: (req.headers["user-agent"] ?? "").toString().slice(0, 500) || null,
      ipHash: hashIp(clientIp(req)),
      ...(opts.occurredAt ? { occurredAt: opts.occurredAt } : {}),
    });
  } catch (err) {
    req.log?.warn({ err, eventName }, "logEvent failed");
  }
}

export { clientIp };
