import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { apiKeysTable, webhooksTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getEntitlement } from "./billing";
import { logger } from "./logger";

export const API_KEY_PREFIX = "coach_sk_";

export function hashApiKey(full: string): string {
  return crypto.createHash("sha256").update(full).digest("hex");
}

// Returns the plaintext key (shown once), its hash (stored), and a display prefix.
export function generateApiKey(): { full: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(24).toString("base64url");
  const full = `${API_KEY_PREFIX}${raw}`;
  return { full, hash: hashApiKey(full), prefix: full.slice(0, API_KEY_PREFIX.length + 6) };
}

// Auth for the public API: `Authorization: Bearer coach_sk_...`. Resolves the key
// to its owner and attaches userId + entitlement (so the v1 routes reuse the same
// gating/rate-limit helpers as the session API).
export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const header = (req.headers.authorization as string) || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token || !token.startsWith(API_KEY_PREFIX)) {
    res.status(401).json({ error: "Missing or malformed API key. Use 'Authorization: Bearer coach_sk_...'." });
    return;
  }

  const rows = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, hashApiKey(token)))
    .limit(1);
  const key = rows[0];
  if (!key || key.revokedAt) {
    res.status(401).json({ error: "Invalid or revoked API key." });
    return;
  }

  const userRows = await db.select().from(usersTable).where(eq(usersTable.id, key.ownerId)).limit(1);
  (req as any).userId = key.ownerId;
  (req as any).apiKeyId = key.id;
  (req as any).entitlement = getEntitlement(userRows[0] ?? {});

  // Best-effort last-used stamp; never block the request on it.
  void db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id))
    .catch(() => {});

  next();
}

// ----------------------------------------------------------------------------
// Webhooks
// ----------------------------------------------------------------------------

// Sign a webhook payload the same way Stripe does, so receivers can verify it:
// HMAC-SHA256 over `${timestamp}.${payload}`.
export function signWebhook(secret: string, payload: string): string {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

// Deliver an event to the owner's active, subscribed webhooks. Fire-and-forget:
// failures are logged, never thrown, and never block the caller.
export async function emitWebhook(ownerId: string, event: string, data: unknown): Promise<void> {
  try {
    const hooks = await db
      .select()
      .from(webhooksTable)
      .where(and(eq(webhooksTable.ownerId, ownerId), eq(webhooksTable.active, true)));
    if (hooks.length === 0) return;

    const payload = JSON.stringify({ event, data, sentAt: new Date().toISOString() });
    for (const hook of hooks) {
      const subscribed =
        hook.events.trim() === "*" ||
        hook.events
          .split(",")
          .map((s) => s.trim())
          .includes(event);
      if (!subscribed) continue;
      fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Coach-Signature": signWebhook(hook.secret, payload) },
        body: payload,
        signal: AbortSignal.timeout(5000),
      }).catch((err) => logger.warn({ err, url: hook.url, event }, "webhook delivery failed"));
    }
  } catch (err) {
    logger.error({ err, event }, "emitWebhook failed");
  }
}
