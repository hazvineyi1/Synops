import { db, studyCouponsTable } from "@workspace/paideia-db";
import { eq } from "drizzle-orm";
import type { TierId } from "./config.js";

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function getCouponByCode(code: string) {
  const rows = await db
    .select()
    .from(studyCouponsTable)
    .where(eq(studyCouponsTable.code, normalizeCode(code)))
    .limit(1);
  return rows[0] ?? null;
}

export interface CouponPreview {
  valid: boolean;
  reason?: string;
  code?: string;
  description?: string | null;
  discountMinor: number;
  finalMinor: number;
}

// Validate a coupon against a concrete purchase (tier + currency + base price)
// and return the discount it produces. Pure read - does not redeem.
export async function previewCoupon(opts: {
  code: string;
  tier: TierId;
  currency: string;
  baseMinor: number;
}): Promise<CouponPreview> {
  const { tier, currency, baseMinor } = opts;
  const coupon = await getCouponByCode(opts.code);

  const invalid = (reason: string): CouponPreview => ({
    valid: false,
    reason,
    discountMinor: 0,
    finalMinor: baseMinor,
  });

  if (!coupon) return invalid("That coupon code was not found.");
  if (!coupon.active) return invalid("This coupon is no longer active.");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return invalid("This coupon has expired.");
  }
  if (
    coupon.maxRedemptions != null &&
    coupon.timesRedeemed >= coupon.maxRedemptions
  ) {
    return invalid("This coupon has been fully redeemed.");
  }
  if (coupon.appliesToTier && coupon.appliesToTier !== tier) {
    return invalid(`This coupon only applies to the ${coupon.appliesToTier} plan.`);
  }

  let discountMinor = 0;
  if (coupon.discountType === "percent") {
    const pct = coupon.percentOff ?? 0;
    discountMinor = Math.round((baseMinor * pct) / 100);
  } else if (coupon.discountType === "fixed") {
    if (coupon.currency && coupon.currency !== currency) {
      return invalid(`This coupon can only be used for ${coupon.currency} payments.`);
    }
    discountMinor = coupon.amountOffMinor ?? 0;
  }

  // Never discount below zero.
  if (discountMinor > baseMinor) discountMinor = baseMinor;
  if (discountMinor < 0) discountMinor = 0;

  return {
    valid: true,
    code: coupon.code,
    description: coupon.description,
    discountMinor,
    finalMinor: baseMinor - discountMinor,
  };
}
