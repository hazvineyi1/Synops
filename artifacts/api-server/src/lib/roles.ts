import type { Request, Response, NextFunction } from "express";
import { db, usersTable, adminAuditLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isAdminUser } from "@workspace/identity";

export type Role = "user" | "support" | "content_editor" | "moderator" | "super_admin";

export const ROLES: Role[] = ["user", "support", "content_editor", "moderator", "super_admin"];

const LEVEL: Record<Role, number> = {
  user: 0,
  support: 1,
  content_editor: 2,
  moderator: 3,
  super_admin: 4,
};

export function roleLevel(role: string | null | undefined): number {
  return LEVEL[(role as Role) ?? "user"] ?? 0;
}

export function isValidRole(role: string): role is Role {
  return (ROLES as string[]).includes(role);
}

/**
 * Effective role for a user. ADMIN_EMAILS accounts are always super_admin
 * (so the original founders keep full access); everyone else gets their
 * stored users.role, defaulting to "user".
 */
export async function getUserRole(userId: string): Promise<Role> {
  if (await isAdminUser(userId)) return "super_admin";
  const [u] = await db
    .select({ role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return (u?.role as Role) ?? "user";
}

/**
 * Middleware: require at least `min` role. Assumes requireAuth ran first so
 * req.userId is set. Attaches the resolved role to req.role.
 */
export function requireRole(min: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId as string | undefined;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = await getUserRole(userId);
    (req as any).role = role;
    if (roleLevel(role) < roleLevel(min)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/**
 * Append an entry to the admin audit log. Best-effort — auditing must never
 * break the action it is recording, so failures are swallowed.
 */
export async function logAdminAction(opts: {
  actorUserId: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: unknown;
}): Promise<void> {
  try {
    await db.insert(adminAuditLogTable).values({
      actorUserId: opts.actorUserId,
      actorEmail: opts.actorEmail ?? null,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      metadata: (opts.metadata ?? null) as never,
    });
  } catch {
    // intentionally swallowed
  }
}
