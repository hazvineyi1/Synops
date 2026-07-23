import { Router, type IRouter } from "express";
import { db, studyUsersTable } from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { requireStudyUser } from "../../middlewares/auth.js";
import {
  verifyPassword,
  STUDY_SESSION_COOKIE,
  STUDY_IMPERSONATOR_COOKIE,
} from "../../lib/studyAuth.js";
import { logger } from "../../lib/logger.js";
import { assembleLearnerExport } from "../../lib/learnerExport.js";

// Learner data rights (GDPR): a self-service export of everything we hold on the
// signed-in learner, and a password-confirmed self-deletion of their account.
const router: IRouter = Router();
router.use(requireStudyUser);

// GET /export — a complete machine-readable copy of the learner's own data.
// Streamed as a downloadable JSON attachment. The password hash is never included.
router.get("/export", async (req, res) => {
  const userId = req.studyUser!.id;
  const payload = await assembleLearnerExport(userId);
  if (!payload) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="synops-coach-data-${userId.slice(0, 8)}.json"`,
  );
  res.send(JSON.stringify(payload, null, 2));
});

// POST /delete — permanently delete the learner's own account and all their data.
// Requires the account password to confirm (also blocks an impersonating admin,
// who would not know it). Every study_* row cascades from the user row, including
// sessions, so this is a hard delete.
router.post("/delete", async (req, res) => {
  const userId = req.studyUser!.id;
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) {
    res.status(400).json({ error: "Your password is required to delete your account" });
    return;
  }

  const [acct] = await db
    .select({ passwordHash: studyUsersTable.passwordHash })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.id, userId));
  if (!acct || !verifyPassword(password, acct.passwordHash)) {
    res.status(401).json({ error: "Incorrect password" });
    return;
  }

  await db.delete(studyUsersTable).where(eq(studyUsersTable.id, userId));
  res.clearCookie(STUDY_SESSION_COOKIE, { path: "/", sameSite: "lax" });
  res.clearCookie(STUDY_IMPERSONATOR_COOKIE, { path: "/", sameSite: "lax" });
  logger.info({ userId }, "learner self-deleted account and all data");
  res.json({ ok: true });
});

export default router;
