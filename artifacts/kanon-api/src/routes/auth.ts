import { Router } from "express";
import { eq, or, like } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import { db, usersTable, organizationsTable, clientsTable } from "@workspace/kanon-db";
import type { UserRow } from "@workspace/kanon-db";
import { hashPassword, verifyPassword } from "../lib/auth";
import { PRODUCT_KEYS, isSelfServiceProductKey } from "../lib/products";
import { ensureStripeCustomer } from "../lib/stripeBilling";
import {
  loadOrgBilling,
  buildBillingSummary,
  globalBillingSummary,
  type BillingSummary,
} from "../lib/billing";
import {
  createVerificationToken,
  consumeVerificationToken,
  invalidateUserTokens,
  sendVerificationEmail,
  purgeStaleUnverifiedAccounts,
} from "../lib/verification";
import { logger } from "../lib/logger";

const router = Router();

// Email verification gates self-serve trials by default. It is a deliberately
// narrow, LOUD kill-switch: set REQUIRE_EMAIL_VERIFICATION to a false-y value to
// let signups in without confirming their address (the escape hatch for a broken
// email transport in production). When off, register provisions and signs the
// user in immediately and login stops blocking unverified accounts.
const REQUIRE_EMAIL_VERIFICATION = (() => {
  const raw = (process.env.REQUIRE_EMAIL_VERIFICATION ?? "").trim().toLowerCase();
  const disabled = raw === "false" || raw === "0" || raw === "off" || raw === "no";
  return !disabled;
})();
if (!REQUIRE_EMAIL_VERIFICATION) {
  const msg =
    "REQUIRE_EMAIL_VERIFICATION is OFF: self-serve signups bypass email verification and are auto-activated.";
  if (process.env.NODE_ENV === "production") logger.error(msg);
  else logger.warn(msg);
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

// Registration is tighter than login: each successful sign-up provisions a whole
// new tenant (org + user), so we cap creation attempts well below the login rate
// to blunt automated tenant-spam.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-up attempts. Please try again later." },
});

// Resending a verification email triggers an outbound send, so it is rate-limited
// as tightly as registration to prevent using it as a mail-bomb relay.
const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in a few minutes." },
});

const TRIAL_DAYS = 14;

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "school";
}

/**
 * Build a unique org slug from a display name. We pre-resolve a free slug by
 * scanning existing slugs that share the base and picking the first opening,
 * then fall back to a numeric suffix. The DB unique constraint on `slug` is the
 * backstop for the rare concurrent-signup race.
 */
async function generateOrgSlug(name: string): Promise<string> {
  const root = slugify(name);
  const rows = await db
    .select({ slug: organizationsTable.slug })
    .from(organizationsTable)
    .where(or(eq(organizationsTable.slug, root), like(organizationsTable.slug, `${root}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

// Drizzle wraps the pg driver error, so a unique_violation (SQLSTATE 23505) may
// sit on the thrown error or anywhere along its cause chain.
function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    if (typeof cur === "object" && cur !== null && (cur as { code?: string }).code === "23505") {
      return true;
    }
    cur = (cur as { cause?: unknown } | null)?.cause;
  }
  return false;
}

/**
 * Start the trial clock and provision the first client for a freshly verified
 * tenant. Idempotent: the trial clock is only set if it has not started, and the
 * first client is only created when the org has none, so a double verify or a
 * kill-switch re-run is harmless. The Stripe customer is best-effort and never
 * blocks activation (mirrors the email degrade-to-log).
 */
async function activateTrial(orgId: number, email: string, log: typeof logger): Promise<void> {
  await db.transaction(async (tx) => {
    const [org] = await tx
      .select({ id: organizationsTable.id, name: organizationsTable.name, trialEndsAt: organizationsTable.trialEndsAt })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId));
    if (!org) return;

    if (org.trialEndsAt == null) {
      await tx
        .update(organizationsTable)
        .set({
          planTier: "trial",
          subscriptionStatus: "trialing",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
        })
        .where(eq(organizationsTable.id, orgId));
    }

    const [existingClient] = await tx
      .select({ id: clientsTable.id })
      .from(clientsTable)
      .where(eq(clientsTable.organizationId, orgId))
      .limit(1);
    if (!existingClient) {
      await tx.insert(clientsTable).values({ organizationId: orgId, name: org.name });
    }
  });

  try {
    await ensureStripeCustomer(orgId, email);
  } catch (err) {
    log.warn({ err, orgId }, "Deferred Stripe customer creation at trial activation");
  }
}

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().min(1).max(200),
  organization: z.string().max(200).optional(),
  productKey: z.enum(PRODUCT_KEYS).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1).max(512),
});

const resendSchema = z.object({
  email: z.string().email().max(255),
});

interface ImpersonatorInfo {
  id: number;
  name: string;
  email: string;
}

async function billingSummaryForUser(u: UserRow): Promise<BillingSummary> {
  if (u.organizationId == null) return globalBillingSummary();
  const org = await loadOrgBilling(u.organizationId);
  return org ? buildBillingSummary(org) : globalBillingSummary();
}

async function publicUser(u: UserRow, impersonator: ImpersonatorInfo | null = null) {
  let organizationName: string | null = null;
  let organizationType: string | null = null;
  let organizationSlug: string | null = null;
  if (u.organizationId != null) {
    const [org] = await db
      .select({
        name: organizationsTable.name,
        type: organizationsTable.type,
        slug: organizationsTable.slug,
      })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, u.organizationId));
    organizationName = org?.name ?? null;
    organizationType = org?.type ?? null;
    organizationSlug = org?.slug ?? null;
  }
  const billing = await billingSummaryForUser(u);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    organization: u.organization,
    role: u.role,
    productKey: u.productKey,
    status: u.status,
    organizationId: u.organizationId,
    organizationName,
    organizationType,
    organizationSlug,
    // Present only while a super admin is acting as this user. The frontend uses
    // it to render a persistent banner with a "Stop impersonating" control.
    impersonator,
    // Presentational billing/trial state. NONE of these authorize anything; the
    // server enforces writability independently (see billing.canWrite and the
    // read-only middleware).
    effectiveTier: billing.effectiveTier,
    planLabel: billing.planLabel,
    trialEndsAt: billing.trialEndsAt,
    trialDaysRemaining: billing.trialDaysRemaining,
    readOnly: billing.readOnly,
    createdAt: u.createdAt.toISOString(),
  };
}

// express-session callbacks are node-style; wrap them so we can await in order.
// Regenerating on login/register/verify issues a brand-new session id (defeats
// session fixation) AND, critically, drops any stale `impersonatorUserId` so an
// impersonated session cannot silently swap identity outside the audited
// impersonation routes.
function regenerateSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function establishSession(req: import("express").Request, user: UserRow): Promise<void> {
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.role = user.role;
  await saveSession(req);
}

router.post("/auth/register", registerLimiter, async (req, res): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Compass (Curriculum Builder) is the only self-service product. The server
  // FORCES the product key, role, and tenant; a client-supplied productKey,
  // role, or organization id is never trusted (registerSchema carries only
  // display fields, and zod strips unknown keys). The allowlist check keeps the
  // policy explicit: empty the allowlist and self-serve sign-up closes again.
  const productKey = "compass" as const;
  if (!isSelfServiceProductKey(productKey)) {
    res.status(403).json({ error: "Self-service sign-up is not available right now." });
    return;
  }

  const fullName = parsed.data.name.trim();
  const orgName = parsed.data.organization?.trim() || `${fullName}'s programs`;

  // Opportunistic, best-effort cleanup of long-abandoned unverified signups so
  // they cannot accumulate. Never blocks the request.
  void purgeStaleUnverifiedAccounts(req.log);

  // Enumeration-safe duplicate handling. The contract promises an identical 202
  // shape whether or not the address already exists, so a duplicate must NEVER
  // 409 (that would leak which emails are registered). For an active, still
  // unverified account we resend a fresh link so "check your email" stays
  // truthful; otherwise we send nothing. We never establish a session here, so a
  // duplicate can never take over an existing account. The DB unique constraint
  // still guards a concurrent-signup race (handled enumeration-safely in the
  // catch below).
  const [existing] = await db
    .select({
      id: usersTable.id,
      status: usersTable.status,
      emailVerifiedAt: usersTable.emailVerifiedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing) {
    if (
      REQUIRE_EMAIL_VERIFICATION &&
      existing.status !== "deactivated" &&
      existing.emailVerifiedAt == null
    ) {
      const token = await createVerificationToken(existing.id);
      await sendVerificationEmail(req.log, email, token);
    }
    res.status(202).json({ ok: true, email, verificationRequired: REQUIRE_EMAIL_VERIFICATION });
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const slug = await generateOrgSlug(orgName);

  // Provision the tenant atomically: a new school organization plus the owning
  // school_admin user bound to it. The trial clock does NOT start here
  // (trialEndsAt stays null) and, when verification is required, the user is
  // created unverified (emailVerifiedAt null). Both are finalized at verification
  // so the 14 days begin only once the address is confirmed.
  let user: UserRow;
  let orgId: number;
  try {
    const created = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizationsTable)
        .values({
          name: orgName,
          slug,
          type: "school",
          planTier: "trial",
          subscriptionStatus: "trialing",
          trialEndsAt: null,
        })
        .returning({ id: organizationsTable.id });
      const [u] = await tx
        .insert(usersTable)
        .values({
          email,
          passwordHash,
          name: fullName,
          organization: orgName,
          productKey,
          role: "school_admin",
          organizationId: org.id,
          emailVerifiedAt: REQUIRE_EMAIL_VERIFICATION ? null : new Date(),
        })
        .returning();
      return { orgId: org.id, user: u };
    });
    user = created.user;
    orgId = created.orgId;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a concurrent-signup race for this email. The winning request already
      // provisioned the account and sent its verification email, so stay
      // enumeration-safe and return the same shape instead of leaking with a 409.
      res.status(202).json({ ok: true, email, verificationRequired: REQUIRE_EMAIL_VERIFICATION });
      return;
    }
    req.log.error({ err }, "Self-serve registration failed");
    res.status(500).json({ error: "Could not create your account. Please try again." });
    return;
  }

  if (REQUIRE_EMAIL_VERIFICATION) {
    const token = await createVerificationToken(user.id);
    await sendVerificationEmail(req.log, user.email, token);
    res.status(202).json({ ok: true, email, verificationRequired: true });
    return;
  }

  // Kill-switch OFF: skip email confirmation, start the trial, and sign the user
  // in immediately so a broken email transport never locks signups out.
  await activateTrial(orgId, email, logger);
  await establishSession(req, user);
  res.status(202).json({ ok: true, email, verificationRequired: false });
});

router.post("/auth/verify-email", verifyLimiter, async (req, res): Promise<void> => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const userId = await consumeVerificationToken(parsed.data.token);
  if (userId == null) {
    res
      .status(400)
      .json({ error: "This verification link is invalid or has expired.", code: "invalid_token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(400).json({ error: "This verification link is invalid or has expired.", code: "invalid_token" });
    return;
  }
  if (user.status === "deactivated") {
    res.status(403).json({ error: "This account has been deactivated. Contact your administrator." });
    return;
  }

  if (user.emailVerifiedAt == null) {
    await db.update(usersTable).set({ emailVerifiedAt: new Date() }).where(eq(usersTable.id, userId));
  }
  if (user.organizationId != null) {
    await activateTrial(user.organizationId, user.email, logger);
  }
  // Invalidate any other outstanding links for this user.
  await invalidateUserTokens(userId);

  const [fresh] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  await establishSession(req, fresh);
  res.json(await publicUser(fresh));
});

router.post("/auth/resend-verification", resendLimiter, async (req, res): Promise<void> => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  // Enumeration-safe: always return the same 202 shape. Only actually send when
  // the address maps to an active, still-unverified account.
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (user && user.status !== "deactivated" && user.emailVerifiedAt == null) {
    const token = await createVerificationToken(user.id);
    await sendVerificationEmail(req.log, user.email, token);
  }
  res.status(202).json({ ok: true, email, verificationRequired: true });
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.status === "deactivated") {
    res.status(403).json({ error: "This account has been deactivated. Contact your administrator." });
    return;
  }

  // Block sign-in until the address is confirmed (unless the kill-switch is off).
  // The client uses the code to offer a "resend verification" action.
  if (REQUIRE_EMAIL_VERIFICATION && user.emailVerifiedAt == null) {
    res.status(403).json({
      error: "Please verify your email address before signing in. Check your inbox for the verification link.",
      code: "email_unverified",
    });
    return;
  }

  await establishSession(req, user);
  res.json(await publicUser(user));
});

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId));
  if (!user || user.status === "deactivated") {
    req.session.destroy(() => undefined);
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // When impersonating, surface the real operator so the client can show a
  // persistent banner. Branding/host never sets this; only the impersonation
  // routes do. If the recorded operator is missing, fail safe to no banner.
  let impersonator: ImpersonatorInfo | null = null;
  if (req.session.impersonatorUserId != null) {
    const [op] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, req.session.impersonatorUserId));
    impersonator = op ?? null;
  }

  res.json(await publicUser(user, impersonator));
});

export default router;
