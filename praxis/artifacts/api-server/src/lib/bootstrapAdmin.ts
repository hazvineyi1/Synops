import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/**
 * First super admin for a FRESH database (for example the new MRB hub deployment).
 *
 * When BOOTSTRAP_SUPER_ADMIN_EMAIL is set AND the database has no super admin yet, create (or promote)
 * that one account as an active super_admin with no password. The owner then uses "Forgot password"
 * on the sign-in page to set one. Once any super admin exists this does nothing, so leaving the
 * variable set is harmless; remove it after first sign-in anyway. Never throws, never blocks boot.
 */
export async function bootstrapSuperAdmin(): Promise<void> {
  const email = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return;
  try {
    const [anyAdmin] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.role, "super_admin")).limit(1);
    if (anyAdmin) return;
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing) {
      await db.update(usersTable).set({ role: "super_admin", status: "active" }).where(eq(usersTable.id, existing.id));
    } else {
      await db.insert(usersTable).values({ email, firstName: "Synops", lastName: "Admin", role: "super_admin", status: "active" });
    }
    logger.info({ email }, "bootstrap: first super admin ensured; set a password via Forgot password");
  } catch (err) {
    logger.error({ err }, "bootstrap: could not ensure the first super admin");
  }
}
