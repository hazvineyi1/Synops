import { db, auditEventsTable } from "@workspace/kanon-db";
import type { ActorContext } from "./actor";

/**
 * Record an attributed audit event for a curriculum mutation. The acting user's
 * id is denormalized onto the event so a school admin can review per-builder
 * activity (see GET /compass/builders/:id/activity). `actorName` is resolved at
 * read time by joining users on `actorUserId`, so callers need not supply it.
 *
 * Best-effort: never let an audit write failure break the underlying mutation.
 */
export async function recordActorAudit(
  actor: ActorContext,
  event: {
    action: string;
    entityType: string;
    entityTitle: string;
    projectId?: number | null;
    projectTitle?: string | null;
  },
): Promise<void> {
  try {
    await db.insert(auditEventsTable).values({
      projectId: event.projectId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityTitle: event.entityTitle,
      projectTitle: event.projectTitle ?? null,
      actorUserId: actor.userId,
      impersonatorUserId: actor.impersonatorUserId ?? null,
    });
  } catch {
    // Audit is best-effort; swallow so the mutation still succeeds.
  }
}
