import { Router, type IRouter } from "express";
import { requireStudyUser } from "../../middlewares/auth.js";
import {
  getAmbassadorByUserId,
  joinAmbassadorProgram,
  getAmbassadorSettings,
  getAmbassadorBalances,
  getReferredCustomers,
  getRecentCommissionEvents,
  getPayoutHistory,
  confirmDueCommissionEvents,
  requestCashout,
  setPayoutMethod,
  isPayoutMethod,
} from "../../lib/billing/ambassador.js";

const router: IRouter = Router();
router.use(requireStudyUser);

// Whether the current user is enrolled, plus the public program settings the
// dashboard needs to render rates and payout options.
// A user may only join once they are a paying subscriber (Plus or Pro).
function isPayingTier(tier: string | null | undefined): boolean {
  return tier === "plus" || tier === "pro";
}

router.get("/status", async (req, res) => {
  const userId = req.studyUser!.id;
  const ambassador = await getAmbassadorByUserId(userId);
  const settings = await getAmbassadorSettings();
  res.json({
    enrolled: !!ambassador,
    eligible: isPayingTier(req.studyUser!.subscriptionTier),
    program: {
      schedule: settings.schedule,
      standardCapMonths: settings.standardCapMonths,
      lifetimeThresholdReferrals: settings.lifetimeThresholdReferrals,
      holdbackDays: settings.holdbackDays,
      payoutMethods: settings.payoutMethods,
      cashoutIncrementUsdMinor: settings.cashoutIncrementUsdMinor,
    },
  });
});

// Paying subscribers only. Idempotent: returns the existing profile if already enrolled.
router.post("/join", async (req, res) => {
  const userId = req.studyUser!.id;
  if (!isPayingTier(req.studyUser!.subscriptionTier)) {
    res.status(403).json({ error: "Upgrade to a paid plan to join the ambassador program" });
    return;
  }
  const method = typeof req.body?.payoutMethod === "string" ? req.body.payoutMethod : undefined;
  const handle = typeof req.body?.payoutHandle === "string" ? req.body.payoutHandle : undefined;
  if (method && !isPayoutMethod(method)) {
    res.status(400).json({ error: "Invalid payout method" });
    return;
  }
  const ambassador = await joinAmbassadorProgram(userId, method, handle);

  // Best-effort ambassador welcome explaining how to earn and learn. Skips until
  // the user is reachable on WhatsApp; the opt-in trigger then sends it.
  try {
    const { sendAmbassadorWelcome } = await import("../../lib/notifications/service.js");
    await sendAmbassadorWelcome(req.studyUser!);
  } catch {
    // Welcome is non-critical; never block joining.
  }

  res.status(201).json({ referralCode: ambassador.referralCode });
});

// Full dashboard payload. Confirms any due holdback first so balances are current.
router.get("/me", async (req, res) => {
  const userId = req.studyUser!.id;
  const ambassador = await getAmbassadorByUserId(userId);
  if (!ambassador) {
    res.status(404).json({ error: "Not enrolled" });
    return;
  }

  await confirmDueCommissionEvents();
  const settings = await getAmbassadorSettings();
  const [balances, customers, events, payouts] = await Promise.all([
    getAmbassadorBalances(ambassador.id, settings),
    getReferredCustomers(ambassador, settings),
    getRecentCommissionEvents(ambassador.id),
    getPayoutHistory(ambassador.id),
  ]);

  res.json({
    profile: {
      referralCode: ambassador.referralCode,
      tier: ambassador.tier,
      status: ambassador.status,
      payoutMethod: ambassador.payoutMethod,
      payoutHandle: ambassador.payoutHandle,
    },
    program: {
      schedule: settings.schedule,
      standardCapMonths: settings.standardCapMonths,
      lifetimeThresholdReferrals: settings.lifetimeThresholdReferrals,
      holdbackDays: settings.holdbackDays,
      payoutMethods: settings.payoutMethods,
      cashoutIncrementUsdMinor: settings.cashoutIncrementUsdMinor,
    },
    balances,
    customers,
    events: events.map((e) => ({
      ...e,
      confirmAt: e.confirmAt instanceof Date ? e.confirmAt.toISOString() : e.confirmAt,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    })),
    payouts: payouts.map((p) => ({
      ...p,
      requestedAt: p.requestedAt instanceof Date ? p.requestedAt.toISOString() : p.requestedAt,
      settledAt: p.settledAt instanceof Date ? p.settledAt.toISOString() : p.settledAt,
    })),
  });
});

// Set / update the payout rail and handle.
router.patch("/payout-method", async (req, res) => {
  const userId = req.studyUser!.id;
  const method = req.body?.payoutMethod;
  const handle = req.body?.payoutHandle;
  if (!isPayoutMethod(method)) {
    res.status(400).json({ error: "Invalid payout method" });
    return;
  }
  if (typeof handle !== "string" || handle.trim().length < 3) {
    res.status(400).json({ error: "A valid payout handle is required" });
    return;
  }
  const updated = await setPayoutMethod(userId, method, handle);
  if (!updated) {
    res.status(404).json({ error: "Not enrolled" });
    return;
  }
  res.json({ payoutMethod: updated.payoutMethod, payoutHandle: updated.payoutHandle });
});

// Request a payout of the largest whole-increment amount currently available.
router.post("/cashout", async (req, res) => {
  const userId = req.studyUser!.id;
  const ambassador = await getAmbassadorByUserId(userId);
  if (!ambassador) {
    res.status(404).json({ error: "Not enrolled" });
    return;
  }
  await confirmDueCommissionEvents();
  const result = await requestCashout(ambassador.id);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json({
    payout: {
      id: result.payout.id,
      amountUsdMinor: result.payout.amountUsdMinor,
      method: result.payout.method,
      status: result.payout.status,
    },
  });
});

export default router;
