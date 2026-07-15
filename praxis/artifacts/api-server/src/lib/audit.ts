import type { Request } from "express";
import { db } from "@workspace/db";
import { auditEventsTable } from "@workspace/db";

/**
 * Append a tamper-evident admin audit event (decision doc §8.1; pattern adapted from
 * Sokratify's admin_audit_logs). Fire-and-forget: it must NEVER block or fail the
 * operation it records.
 *
 * Attribution: an action taken while a super_admin is impersonating is credited to the
 * REAL admin (impersonatorId), not the impersonated user — the trail always names the
 * true actor.
 */
export async function logAudit(
  req: Request,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata?: unknown,
): Promise<void> {
  const r = req as unknown as {
    impersonatorId?: string;
    userId?: string;
    dbUser?: { role?: string; partnerId?: string | null };
    log?: { error?: (...args: unknown[]) => void };
  };
  await db
    .insert(auditEventsTable)
    .values({
      action,
      resourceType,
      resourceId,
      actorId: r.impersonatorId ?? r.userId ?? null,
      actorRole: r.dbUser?.role ?? null,
      partnerId: r.dbUser?.partnerId ?? null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    })
    .catch(() => {
      r.log?.error?.({ action, resourceType }, "audit write failed");
    });
}
