import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  referralCodeFor,
  extendTrial,
  REFERRAL_REWARD_DAYS,
  REFEREE_BONUS_DAYS,
  REFERRAL_CLAIM_WINDOW_DAYS,
} from "../lib/referral";

const router = Router();

function appBaseUrl(req: any): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
  return `${proto}://${host}`;
}

// GET /referral — the user's invite code, share link, and referral count.
router.get("/referral", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  let user = rows[0];
  // Backfill a code for accounts created before referrals existed.
  if (user && !user.referralCode) {
    const code = referralCodeFor(userId);
    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
    user = { ...user, referralCode: code };
  }
  const code = user?.referralCode ?? referralCodeFor(userId);
  res.json({
    code,
    link: `${appBaseUrl(req)}/?ref=${code}`,
    referrals: user?.referralCount ?? 0,
    rewardDays: REFERRAL_REWARD_DAYS,
    refereeBonusDays: REFEREE_BONUS_DAYS,
  });
});

// POST /referral/claim — attribute the current (new) user to a referrer's code,
// once, and grant both sides bonus Pro days.
router.post("/referral/claim", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const raw = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
  if (!raw) {
    res.status(400).json({ claimed: false, reason: "missing_code" });
    return;
  }

  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    res.status(404).json({ claimed: false, reason: "no_user" });
    return;
  }
  if (user.referredBy) {
    res.json({ claimed: false, reason: "already_claimed" });
    return;
  }
  if (user.referralCode === raw) {
    res.json({ claimed: false, reason: "self" });
    return;
  }
  // Only genuinely-new accounts can claim a referral (anti-abuse).
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  if (ageMs > REFERRAL_CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    res.json({ claimed: false, reason: "account_too_old" });
    return;
  }

  const referrerRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.referralCode, raw))
    .limit(1);
  const referrer = referrerRows[0];
  if (!referrer || referrer.id === userId) {
    res.json({ claimed: false, reason: "invalid_code" });
    return;
  }

  // Reward both sides: the new user and the referrer each get bonus Pro days.
  await db
    .update(usersTable)
    .set({ referredBy: referrer.id, trialEndsAt: extendTrial(user.trialEndsAt, REFEREE_BONUS_DAYS) })
    .where(eq(usersTable.id, userId));

  await db
    .update(usersTable)
    .set({
      referralCount: (referrer.referralCount ?? 0) + 1,
      trialEndsAt: extendTrial(referrer.trialEndsAt, REFERRAL_REWARD_DAYS),
    })
    .where(eq(usersTable.id, referrer.id));

  logger.info({ userId, referrer: referrer.id }, "referral claimed");
  res.json({ claimed: true, bonusDays: REFEREE_BONUS_DAYS });
});

export default router;
