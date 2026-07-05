// Email-verification token lifecycle and delivery for self-serve trial signups.
//
// The raw token is emailed to the user; only its sha256 hash is persisted, so a
// dump of `email_verification_tokens` cannot be replayed against the verify
// endpoint. Tokens are single-use and expire after 24h. Delivery is best-effort
// via the Resend connector and degrades to structured logging (in non-prod the
// link is always logged so a developer can verify without inbox access).
import crypto from "node:crypto";
import { and, eq, gt, isNull, lt, inArray } from "drizzle-orm";
import {
  db,
  emailVerificationTokensTable,
  usersTable,
  organizationsTable,
  clientsTable,
} from "@workspace/compass-db";

interface MinimalLogger {
  info: (obj: object, msg?: string) => void;
  warn?: (obj: object, msg?: string) => void;
  error?: (obj: object, msg?: string) => void;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SEND_TIMEOUT_MS = 8000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Unverified accounts older than this never activated (no client, no data) and
// are safe to purge so abandoned signups cannot accumulate as tenant-spam.
const STALE_UNVERIFIED_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_PURGE_BATCH = 50;

// Matches the contact-email default: Resend's shared onboarding domain only
// delivers to the Resend account owner. Set CONTACT_FROM_EMAIL to an address on
// a verified domain for real delivery to arbitrary recipients.
const DEFAULT_FROM = "Synops Consulting <onboarding@resend.dev>";

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a fresh single-use verification token for a user and persist only its
 * hash. Returns the raw token to embed in the verification link.
 */
export async function createVerificationToken(userId: number): Promise<string> {
  const raw = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(emailVerificationTokensTable).values({
    userId,
    tokenHash: hashToken(raw),
    expiresAt,
  });
  return raw;
}

/**
 * Atomically consume a verification token: a single UPDATE ... RETURNING marks
 * the one matching unexpired, unused row as used and yields its userId. The
 * atomicity makes the token single-use even under concurrent submissions.
 * Returns null when the token is unknown, already used, or expired.
 */
export async function consumeVerificationToken(raw: string): Promise<number | null> {
  const now = new Date();
  const [row] = await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailVerificationTokensTable.tokenHash, hashToken(raw)),
        isNull(emailVerificationTokensTable.usedAt),
        gt(emailVerificationTokensTable.expiresAt, now),
      ),
    )
    .returning({ userId: emailVerificationTokensTable.userId });
  return row?.userId ?? null;
}

/**
 * Invalidate any still-outstanding tokens for a user (after they verify, so a
 * second link in a forwarded email cannot be replayed).
 */
export async function invalidateUserTokens(userId: number): Promise<void> {
  await db
    .update(emailVerificationTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokensTable.userId, userId),
        isNull(emailVerificationTokensTable.usedAt),
      ),
    );
}

/**
 * The public link a recipient clicks. It lands on the frontend verify page.
 * Base URL resolution order: APP_URL (full origin) -> first ALLOWED_ORIGINS host
 * -> legacy Replit domains.
 * which POSTs the token (no GET mutation). Built from the deployment host
 * (REPLIT_DOMAINS in prod, REPLIT_DEV_DOMAIN in dev).
 */
export function buildVerificationLink(token: string): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const host = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] ||
    process.env.REPLIT_DOMAINS?.split(",")[0] ||
    process.env.REPLIT_DEV_DOMAIN ||
    ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const base = explicit || (host ? `https://${host}` : "");
  return `${base}/compass/verify-email?token=${encodeURIComponent(token)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Resend request timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function resendErrorCode(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { name?: unknown };
    if (typeof parsed.name === "string") return parsed.name;
  } catch {
    // body was not JSON
  }
  return "unknown";
}

function buildBodies(link: string): { text: string; html: string } {
  const text =
    "Welcome to Curriculum Builder.\n\n" +
    "Confirm your email address to start your 14 day free trial:\n\n" +
    `${link}\n\n` +
    "This link expires in 24 hours. If you did not request a trial, you can ignore this email.\n";

  const html =
    `<h2>Welcome to Curriculum Builder</h2>` +
    `<p>Confirm your email address to start your 14 day free trial.</p>` +
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px">Confirm your email</a></p>` +
    `<p style="color:#555">Or paste this link into your browser:<br><span style="word-break:break-all">${link}</span></p>` +
    `<p style="color:#777;font-size:13px">This link expires in 24 hours. If you did not request a trial, you can ignore this email.</p>`;

  return { text, html };
}

/**
 * Send the verification email. Best-effort: never throws. In non-production the
 * link is always logged so a developer can verify without inbox access; if the
 * Resend send fails or times out, this degrades to a structured warning.
 */
export async function sendVerificationEmail(
  log: MinimalLogger,
  email: string,
  token: string,
): Promise<void> {
  const link = buildVerificationLink(token);

  if (process.env.NODE_ENV !== "production") {
    log.info({ email, link }, "Email verification link (non-prod, logged for local testing)");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    (log.warn ?? log.info).call(
      log,
      {},
      "Verification email: RESEND_API_KEY unset, account persisted (link logged in non-prod)",
    );
    return;
  }

  try {
    const from = process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM;
    const { text, html } = buildBodies(link);

    const sendPromise = fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Confirm your email to start your Curriculum Builder trial",
        text,
        html,
      }),
    });
    // A late rejection (after the timeout wins the race) must not surface as an
    // unhandled rejection.
    sendPromise.catch(() => {});

    const response = await withTimeout(sendPromise, SEND_TIMEOUT_MS);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      (log.warn ?? log.info).call(
        log,
        { status: response.status, reason: resendErrorCode(detail) },
        "Verification email: Resend send failed, account persisted (link logged in non-prod)",
      );
      return;
    }
    log.info({}, "Verification email sent via Resend");
  } catch (err) {
    (log.warn ?? log.info).call(
      log,
      { err: err instanceof Error ? err.message : String(err) },
      "Verification email: Resend send failed, account persisted (link logged in non-prod)",
    );
  }
}

/**
 * Best-effort cleanup of abandoned signups: delete unverified users older than
 * the stale window along with the trial org they own, but ONLY when that org
 * never activated (trialEndsAt still null) and has no clients and no other
 * users. This keeps the purge incapable of touching any tenant that ever got
 * real data. Never throws; bounded to a small batch per call.
 */
export async function purgeStaleUnverifiedAccounts(log: MinimalLogger): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_UNVERIFIED_MS);
    const stale = await db
      .select({ id: usersTable.id, orgId: usersTable.organizationId })
      .from(usersTable)
      .where(and(isNull(usersTable.emailVerifiedAt), lt(usersTable.createdAt, cutoff)))
      .limit(STALE_PURGE_BATCH);
    if (stale.length === 0) return;

    const userIds = stale.map((s) => s.id);
    const candidateOrgIds = Array.from(
      new Set(stale.map((s) => s.orgId).filter((x): x is number => x != null)),
    );

    await db.transaction(async (tx) => {
      await tx
        .delete(emailVerificationTokensTable)
        .where(inArray(emailVerificationTokensTable.userId, userIds));
      await tx.delete(usersTable).where(inArray(usersTable.id, userIds));

      for (const orgId of candidateOrgIds) {
        const [remainingUser] = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.organizationId, orgId))
          .limit(1);
        if (remainingUser) continue;

        const [anyClient] = await tx
          .select({ id: clientsTable.id })
          .from(clientsTable)
          .where(eq(clientsTable.organizationId, orgId))
          .limit(1);
        if (anyClient) continue;

        // Only remove orgs that never activated a trial (no clock, no data).
        await tx
          .delete(organizationsTable)
          .where(and(eq(organizationsTable.id, orgId), isNull(organizationsTable.trialEndsAt)));
      }
    });

    log.info({ purged: userIds.length }, "Purged stale unverified signups");
  } catch (err) {
    (log.warn ?? log.info).call(
      log,
      { err: err instanceof Error ? err.message : String(err) },
      "Stale unverified purge failed (ignored)",
    );
  }
}
