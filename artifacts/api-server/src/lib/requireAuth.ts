import { getAuth, clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getEntitlement, TRIAL_DAYS } from "./billing";
import { referralCodeFor } from "./referral";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // JIT-provision user in our DB
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  let user = existing[0];
  if (!user) {
    let email = (auth as any)?.sessionClaims?.email ?? null;
    let name = (auth as any)?.sessionClaims?.fullName ?? null;
    // Best-effort: pull accurate email/name from Clerk on first provision.
    try {
      const u = await clerkClient.users.getUser(userId);
      const primary =
        u.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)
          ?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress;
      if (primary) email = primary;
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      if (!name && fullName) name = fullName;
    } catch {
      // ignore; fall back to claims/placeholder
    }
    // New users get a 7-day Pro trial, no card required.
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const [created] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email: email ?? `${userId}@unknown.com`,
        name,
        trialEndsAt,
        referralCode: referralCodeFor(userId),
      })
      .onConflictDoNothing()
      .returning();
    // onConflictDoNothing returns nothing if a race already inserted; re-fetch.
    user =
      created ??
      (await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1))[0];
  }
  (req as any).userId = userId;
  (req as any).entitlement = getEntitlement(user ?? {});
  next();
}
