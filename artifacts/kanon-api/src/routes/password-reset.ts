// Self-serve password reset for product accounts (Compass / Curriculum Builder).
//
// Mirrors the email-verification design: a raw token is emailed to the user and
// only its sha256 hash is persisted, so a dump of `password_reset_tokens` cannot
// be replayed against the reset endpoint. Tokens are single-use and expire after
// one hour. The request endpoint is enumeration-safe (always 202) so it never
// reveals whether an address has an account. Email delivery is best-effort via
// Resend and degrades to structured logging (the link is logged in non-prod).
import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { sql } from "drizzle-orm";
import { db } from "@workspace/kanon-db";
import { hashPassword } from "../lib/auth";

const router: IRouter = Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const SEND_TIMEOUT_MS = 8000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Resend's shared onboarding domain only delivers to the Resend account owner.
// Set CONTACT_FROM_EMAIL to an address on a verified domain for real delivery.
const DEFAULT_FROM = "Synops Consulting <onboarding@resend.dev>";

interface MinimalLogger {
  info: (obj: object, msg?: string) => void;
  warn?: (obj: object, msg?: string) => void;
  error?: (obj: object, msg?: string) => void;
}

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// The public link a recipient clicks. Base URL resolution order:
// APP_URL (full origin) -> first ALLOWED_ORIGINS host -> legacy Replit domains.
function buildResetLink(token: string): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/+$/, "");
  const host = (
    process.env.ALLOWED_ORIGINS?.split(",")[0] ||
    process.env.REPLIT_DOMAINS?.split(",")[0] ||
    ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const base = explicit || (host ? `https://${host}` : "");
  return `${base}/compass/reset-password?token=${encodeURIComponent(token)}`;
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

function buildBodies(link: string): { text: string; html: string } {
  const text =
    "We received a request to reset your Curriculum Builder password.\n\n" +
    "Set a new password using the link below (it expires in 1 hour):\n\n" +
    `${link}\n\n` +
    "If you did not request this, you can safely ignore this email.\n";
  const html =
    `<h2>Reset your Curriculum Builder password</h2>` +
    `<p>We received a request to reset your password. This link expires in 1 hour.</p>` +
    `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px">Reset your password</a></p>` +
    `<p style="color:#555">Or paste this link into your browser:<br><span style="word-break:break-all">${link}</span></p>` +
    `<p style="color:#777;font-size:13px">If you did not request this, you can safely ignore this email.</p>`;
  return { text, html };
}

// Best-effort: never throws. In non-production the link is logged so a developer
// can reset without inbox access; on send failure this degrades to a warning.
async function sendResetEmail(log: MinimalLogger, email: string, token: string): Promise<void> {
  const link = buildResetLink(token);

  if (process.env.NODE_ENV !== "production") {
    log.info({ email, link }, "Password reset link (non-prod, logged for local testing)");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    (log.warn ?? log.info).call(log, {}, "Password reset: RESEND_API_KEY unset (link logged in non-prod)");
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
        subject: "Reset your Curriculum Builder password",
        text,
        html,
      }),
    });
    sendPromise.catch(() => {});

    const response = await withTimeout(sendPromise, SEND_TIMEOUT_MS);
    if (!response.ok) {
      (log.warn ?? log.info).call(
        log,
        { status: response.status },
        "Password reset email: Resend send failed",
      );
      return;
    }
    log.info({}, "Password reset email sent via Resend");
  } catch (err) {
    (log.warn ?? log.info).call(
      log,
      { err: err instanceof Error ? err.message : String(err) },
      "Password reset email: Resend send failed",
    );
  }
}

// POST /auth/forgot-password — request a reset link. Always returns 202 with an
// identical shape whether or not the address exists (enumeration-safe).
router.post("/auth/forgot-password", forgotLimiter, async (req, res): Promise<void> => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(202).json({ ok: true });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  try {
    const result = await db.execute(
      sql`SELECT id, status FROM users WHERE email = ${email} LIMIT 1`,
    );
    const user = (result.rows as Array<{ id: number; status: string }>)[0];
    if (user && user.status !== "deactivated") {
      const raw = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await db.execute(
        sql`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${hashToken(raw)}, ${expiresAt})`,
      );
      await sendResetEmail(req.log, email, raw);
    }
  } catch (err) {
    req.log.error({ err }, "forgot-password failed");
  }
  res.status(202).json({ ok: true });
});

// POST /auth/reset-password — consume a token and set the new password. The
// single UPDATE ... RETURNING makes the token single-use even under concurrency.
router.post("/auth/reset-password", resetLimiter, async (req, res): Promise<void> => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input. Your new password must be at least 8 characters." });
    return;
  }
  try {
    const consumed = await db.execute(
      sql`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = ${hashToken(parsed.data.token)} AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
    );
    const userId = (consumed.rows as Array<{ user_id: number }>)[0]?.user_id;
    if (!userId) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await db.execute(
      sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${userId}`,
    );
    // Invalidate any other outstanding reset tokens for this user.
    await db.execute(
      sql`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = ${userId} AND used_at IS NULL`,
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "reset-password failed");
    res.status(500).json({ error: "Could not reset your password. Please try again." });
  }
});

export default router;
