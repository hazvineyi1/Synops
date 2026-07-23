import { Router, type IRouter } from "express";
import { db, studyUsersTable, studyConsentsTable } from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import { requireStudyUser } from "../middlewares/auth.js";
import { PRIVACY_POLICY_VERSION, consentRequired } from "../lib/popia.js";

const router: IRouter = Router();

function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0]!.trim();
  return req.ip ?? null;
}

/** GET /consent/status - what the signed-in learner needs to accept. */
router.get("/consent/status", requireStudyUser, (req, res) => {
  const version = req.studyUser!.consentVersion ?? null;
  res.json({
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    consentVersion: version,
    consentRequired: consentRequired(version),
  });
});

/**
 * POST /consent - record that the signed-in learner accepted the current privacy
 * policy. Appends a study_consents row (with ip + user agent) and denormalises
 * the accepted version onto the learner so the gate clears.
 */
router.post("/consent", requireStudyUser, async (req, res) => {
  const userId = req.studyUser!.id;
  const version = PRIVACY_POLICY_VERSION;

  await db.insert(studyConsentsTable).values({
    userId,
    app: "coach",
    policyVersion: version,
    ip: clientIp(req as never),
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  });

  await db
    .update(studyUsersTable)
    .set({ consentVersion: version, consentedAt: new Date() })
    .where(eq(studyUsersTable.id, userId));

  res.json({ ok: true, privacyPolicyVersion: version });
});

export default router;
