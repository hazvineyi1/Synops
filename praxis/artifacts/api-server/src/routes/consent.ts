import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, consentEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { clientIp } from "../lib/auth";
import { PRIVACY_POLICY_VERSION, consentRequired } from "../lib/popia";

const router = Router();

/**
 * GET /consent/status - what the signed-in user needs to accept.
 * The SPA also gets this via /auth/me; this is a lightweight direct check.
 */
router.get("/consent/status", requireAuth, (req, res) => {
  const version = req.dbUser?.consentVersion ?? null;
  res.json({
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    consentVersion: version,
    consentRequired: consentRequired(version),
  });
});

/**
 * POST /consent - record that the signed-in user accepted the current privacy
 * policy. Writes an append-only consent_events row (with ip + user agent) and
 * denormalises the accepted version onto the user so the gate clears. Idempotent
 * per version: re-accepting the same version just logs another event.
 */
router.post("/consent", requireAuth, async (req, res) => {
  const userId = req.userId!;
  const version = PRIVACY_POLICY_VERSION;

  await db.insert(consentEventsTable).values({
    userId,
    app: "praxis",
    policyVersion: version,
    ip: clientIp(req as never),
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
  });

  await db
    .update(usersTable)
    .set({ consentVersion: version, consentedAt: new Date(), updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  res.json({ ok: true, privacyPolicyVersion: version });
});

export default router;
