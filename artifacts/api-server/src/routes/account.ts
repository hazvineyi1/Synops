import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  conceptsTable,
  coachMessagesTable,
  dailyPlansTable,
  checkpointsTable,
  retrospectivesTable,
  cohortMembersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// GET /account/export — the learner owns their data. Returns everything we hold
// about them as a single downloadable JSON document.
router.get("/account/export", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  const [user, profile, concepts, messages, plans, checkpoints, retros] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)),
    db.select().from(profilesTable).where(eq(profilesTable.userId, userId)),
    db.select().from(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db.select().from(coachMessagesTable).where(eq(coachMessagesTable.userId, userId)),
    db.select().from(dailyPlansTable).where(eq(dailyPlansTable.userId, userId)),
    db.select().from(checkpointsTable).where(eq(checkpointsTable.userId, userId)),
    db.select().from(retrospectivesTable).where(eq(retrospectivesTable.userId, userId)),
  ]);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="arete-export.json"');
  res.send(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        account: user[0] ?? null,
        profile: profile[0] ?? null,
        concepts,
        coachMessages: messages,
        dailyPlans: plans,
        checkpoints,
        retrospectives: retros,
      },
      null,
      2,
    ),
  );
});

// DELETE /account — delete everything. Wipes the learner's data from our database
// and best-effort removes the auth account so it is a true account deletion.
router.delete("/account", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  // Child/owned rows first, then the profile and the user record.
  await Promise.all([
    db.delete(conceptsTable).where(eq(conceptsTable.userId, userId)),
    db.delete(coachMessagesTable).where(eq(coachMessagesTable.userId, userId)),
    db.delete(dailyPlansTable).where(eq(dailyPlansTable.userId, userId)),
    db.delete(checkpointsTable).where(eq(checkpointsTable.userId, userId)),
    db.delete(retrospectivesTable).where(eq(retrospectivesTable.userId, userId)),
    db.delete(cohortMembersTable).where(eq(cohortMembersTable.userId, userId)),
  ]);
  await db.delete(profilesTable).where(eq(profilesTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));

  // Best-effort: remove the Clerk auth account too. If this fails (permissions,
  // network), the data is already gone; the learner can be told to retry.
  let authDeleted = false;
  try {
    await clerkClient.users.deleteUser(userId);
    authDeleted = true;
  } catch (err) {
    logger.error({ err, userId }, "account deletion: clerk user delete failed (data already wiped)");
  }

  res.json({ deleted: true, authDeleted });
});

export default router;
