// Helper that reflects the synced stripe.subscriptions table back onto our
// copilot_teachers row, so the rest of the app can read subscription state
// without any Stripe API calls.
import { db, teachersTable } from "@workspace/paideia-db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function syncTeacherFromCustomer(customerId: string): Promise<void> {
  if (!customerId) return;
  try {
    const rows = (await db.execute(sql`
      SELECT id, status, current_period_end
      FROM stripe.subscriptions
      WHERE customer = ${customerId}
      ORDER BY created DESC
      LIMIT 1
    `)) as unknown as { rows: Array<{ id: string; status: string; current_period_end: number | null }> };
    const sub = rows.rows[0];
    if (!sub) {
      await db
        .update(teachersTable)
        .set({ subscriptionStatus: "free", stripeSubscriptionId: null, subscriptionCurrentPeriodEnd: null })
        .where(eq(teachersTable.stripeCustomerId, customerId));
      return;
    }
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    await db
      .update(teachersTable)
      .set({
        subscriptionStatus: sub.status,
        stripeSubscriptionId: sub.id,
        subscriptionCurrentPeriodEnd: periodEnd,
      })
      .where(eq(teachersTable.stripeCustomerId, customerId));
  } catch (err) {
    logger.error({ err, customerId }, "syncTeacherFromCustomer failed");
  }
}
