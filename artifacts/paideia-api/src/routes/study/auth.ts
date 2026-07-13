import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import {
  db,
  studyUsersTable,
  studySessionsTable,
  studyLearnerProfilesTable,
  studyPasswordResetsTable,
} from "@workspace/paideia-db";
import { eq, and, isNull, gt } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  STUDY_SESSION_COOKIE,
  STUDY_IMPERSONATOR_COOKIE,
  studySessionExpiry,
} from "../../lib/studyAuth.js";
import { requireStudyUser } from "../../middlewares/auth.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { sendEmail, isEmailConfigured, passwordResetEmail, coachBaseUrl } from "../../lib/email.js";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Hash a reset token for storage. We never persist the raw token. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a single-use reset token for a user and persist only its hash.
 * Returns the RAW token (shown once) and the full reset link.
 */
export async function createResetToken(
  userId: string,
  issuedBy: "self_service" | "admin",
): Promise<{ token: string; link: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.insert(studyPasswordResetsTable).values({
    userId,
    tokenHash: hashResetToken(token),
    expiresAt,
    issuedBy,
  });
  return { token, link: `${coachBaseUrl()}/reset-password?token=${token}`, expiresAt };
}

const router: IRouter = Router();

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  // Age gate: ISO date of birth (required for new signups).
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // For 13-17 learners: a guardian's email and an affirmed consent.
  guardianEmail: z.string().email().max(200).optional(),
  guardianConsent: z.boolean().optional(),
  // Optional ambassador referral code captured from a ?ref= link.
  ref: z.string().max(64).optional(),
});

// Whole years between a "YYYY-MM-DD" date of birth and today (UTC).
function ageFromDob(dob: string): number {
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return NaN;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

router.post("/signup", rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const emailLower = data.email.trim().toLowerCase();

  // Age gate: under-13 blocked; 13-17 require a guardian email + consent; 18+ ok.
  const age = ageFromDob(data.dateOfBirth);
  if (!Number.isFinite(age) || age < 0 || age > 120) {
    res.status(400).json({ error: "Please enter a valid date of birth." });
    return;
  }
  if (age < 13) {
    res.status(403).json({
      error: "You must be at least 13 years old to use Synops Coach.",
      code: "under_13",
    });
    return;
  }
  let ageBand = "adult";
  let guardianEmail: string | null = null;
  let guardianConsentAt: Date | null = null;
  if (age < 18) {
    ageBand = "minor";
    if (!data.guardianEmail || data.guardianConsent !== true) {
      res.status(422).json({
        error: "A parent or guardian's email and consent are required for learners under 18.",
        code: "guardian_required",
      });
      return;
    }
    guardianEmail = data.guardianEmail.trim().toLowerCase();
    guardianConsentAt = new Date();
  }

  const existing = await db
    .select({ id: studyUsersTable.id })
    .from(studyUsersTable)
    .where(eq(studyUsersTable.email, emailLower))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = hashPassword(data.password);
  const [user] = await db
    .insert(studyUsersTable)
    .values({
      email: emailLower,
      passwordHash,
      name: data.name,
      dateOfBirth: data.dateOfBirth,
      ageBand,
      guardianEmail,
      guardianConsentAt,
    })
    .returning();

  // Create default learner profile
  await db.insert(studyLearnerProfilesTable).values({
    userId: user.id,
    studyStyle: "balanced",
    preferredSessionLength: 25,
    preferredDifficulty: "mixed",
    dailyStudyMinutes: 30,
  });

  // Best-effort ambassador attribution from a referral link. Never mints
  // commission (that only happens on a cleared payment) and never blocks signup.
  if (data.ref) {
    try {
      const { attributeReferral } = await import("../../lib/billing/ambassador.js");
      await attributeReferral(user.id, data.ref);
    } catch {
      // Attribution is non-critical; ignore failures so signup always succeeds.
    }
  }

  // Best-effort platform welcome. Skips until the user has a WhatsApp number on
  // file and has opted in; the same welcome then sends from the opt-in trigger.
  try {
    const { sendPlatformWelcome } = await import("../../lib/notifications/service.js");
    await sendPlatformWelcome(user);
  } catch {
    // Welcome is non-critical; never block signup.
  }

  const token = newSessionToken();
  await db.insert(studySessionsTable).values({
    token,
    userId: user.id,
    expiresAt: studySessionExpiry(),
  });

  res.cookie(STUDY_SESSION_COOKIE, token, cookieOptions());
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const data = parsed.data;
  const emailLower = data.email.trim().toLowerCase();

  const users = await db
    .select()
    .from(studyUsersTable)
    .where(eq(studyUsersTable.email, emailLower))
    .limit(1);
  const user = users[0];
  if (!user || !verifyPassword(data.password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = newSessionToken();
  await db.insert(studySessionsTable).values({
    token,
    userId: user.id,
    expiresAt: studySessionExpiry(),
  });

  res.cookie(STUDY_SESSION_COOKIE, token, cookieOptions());
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  });
});

router.get("/me", async (req, res) => {
  if (!req.studyUser) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  const u = req.studyUser;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    subscriptionStatus: u.subscriptionStatus,
    subscriptionTier: u.subscriptionTier,
    isAdmin: u.isAdmin,
    impersonating: !!(req.cookies as Record<string, string> | undefined)?.[STUDY_IMPERSONATOR_COOKIE],
    subscriptionCurrentPeriodEnd: u.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  });
});

// Return to the admin's own account after impersonating. Restores the stashed admin
// session token and clears the impersonation cookie. Available to any signed-in user
// (while impersonating, the caller is the target user, not an admin).
router.post("/stop-impersonating", requireStudyUser, async (req, res) => {
  const adminToken = (req.cookies as Record<string, string> | undefined)?.[STUDY_IMPERSONATOR_COOKIE];
  if (!adminToken) {
    res.status(400).json({ error: "Not impersonating" });
    return;
  }
  res.cookie(STUDY_SESSION_COOKIE, adminToken, cookieOptions());
  res.clearCookie(STUDY_IMPERSONATOR_COOKIE, { path: "/", sameSite: "lax" });
  res.json({ ok: true });
});

router.post("/logout", async (_req, res) => {
  res.clearCookie(STUDY_SESSION_COOKIE, { path: "/", sameSite: "lax" });
  res.json({ success: true });
});

// POST /study/auth/forgot-password { email }
// Always answers 200 with the same body whether or not the address is registered:
// a different response for "no such user" would let anyone enumerate who has an
// account. Rate limited to blunt brute-force enumeration by timing/volume.
router.post(
  "/forgot-password",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }),
  async (req, res) => {
    const parsed = z.object({ email: z.string().email().max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A valid email is required." });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();

    const [user] = await db
      .select({ id: studyUsersTable.id, name: studyUsersTable.name })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.email, email))
      .limit(1);

    if (user) {
      try {
        const { link } = await createResetToken(user.id, "self_service");
        const msg = passwordResetEmail(user.name, link);
        const sent = await sendEmail({ to: email, ...msg });
        if (!sent.ok) {
          // Email is down or not configured. Don't leak that to the caller, but do
          // log it loudly: without email, self-service reset silently does nothing
          // and the user must be given an admin-issued link instead.
          req.log?.error(
            { email, configured: sent.configured, err: sent.error },
            "password reset email could not be delivered",
          );
        }
      } catch (err) {
        req.log?.error({ err }, "failed to create password reset token");
      }
    }

    res.json({
      ok: true,
      message:
        "If that email has an account, we have sent a reset link. It expires in 1 hour.",
      // Surfaces in the UI only so a self-hosted/admin operator knows delivery is off.
      emailConfigured: isEmailConfigured(),
    });
  },
);

// POST /study/auth/reset-password { token, password }
// Consumes a single-use token, sets the new password, and revokes every existing
// session for that user so a thief holding a stolen cookie is kicked out too.
router.post(
  "/reset-password",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }),
  async (req, res) => {
    const parsed = z
      .object({ token: z.string().min(10).max(200), password: z.string().min(8).max(200) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }

    const tokenHash = hashResetToken(parsed.data.token);
    const [row] = await db
      .select()
      .from(studyPasswordResetsTable)
      .where(
        and(
          eq(studyPasswordResetsTable.tokenHash, tokenHash),
          isNull(studyPasswordResetsTable.usedAt),
          gt(studyPasswordResetsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(400).json({
        error: "This reset link is invalid or has expired. Please request a new one.",
      });
      return;
    }

    await db
      .update(studyUsersTable)
      .set({ passwordHash: hashPassword(parsed.data.password) })
      .where(eq(studyUsersTable.id, row.userId));

    // Burn the token, then revoke all sessions for this user.
    await db
      .update(studyPasswordResetsTable)
      .set({ usedAt: new Date() })
      .where(eq(studyPasswordResetsTable.id, row.id));

    await db.delete(studySessionsTable).where(eq(studySessionsTable.userId, row.userId));

    res.clearCookie(STUDY_SESSION_COOKIE, { path: "/", sameSite: "lax" });
    res.json({ ok: true, message: "Password updated. You can now sign in." });
  },
);

export default router;
