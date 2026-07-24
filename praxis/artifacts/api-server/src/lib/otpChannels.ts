import { randomInt, timingSafeEqual, createHash } from "node:crypto";
import { sendEmail, emailEnabled } from "./email";

/**
 * One-time-passcode delivery channels for MFA: email (via the existing Resend lib) and SMS (via a
 * Twilio adapter behind env config). Both are optional and degrade gracefully - if a channel is not
 * configured the option is simply unavailable, never a hard error. Codes are 6 digits, generated
 * with a CSPRNG, and only ever stored/compared as hashes.
 */

const CODE_DIGITS = 6;

/** A fresh 6-digit numeric code (leading zeros preserved). */
export function generateOtp(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/** Hash an OTP for storage/compare. Codes are low-entropy, so this is a fast lookup hash, not a KDF. */
export function hashOtp(code: string): string {
  return createHash("sha256").update(String(code ?? "").trim()).digest("hex");
}

/** Constant-time compare of a submitted code against a stored hash. */
export function verifyOtpHash(submitted: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(submitted));
  const b = Buffer.from(String(storedHash ?? ""));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── SMS via Twilio (env-configured adapter) ─────────────────────────────────────
// Twilio has a per-message cost, so it stays off until a human configures it. When the env is
// absent the SMS option is hidden/disabled in the UI and send attempts report not-configured.

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM,
  );
}

/** Send an SMS via Twilio's REST API (no SDK, same dependency-free pattern as the email lib). */
export async function sendSms(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!smsEnabled()) return { ok: false, error: "sms_not_configured" };
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM!;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, error: `twilio ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sms send failed" };
  }
}

/** Mask a phone number for a "code sent to ..." hint: keep the last 3 digits. */
export function maskPhone(phone: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "your phone";
  return `••• ••• ${digits.slice(-3)}`;
}

/** Mask an email for a hint: k****@domain. */
export function maskEmail(email: string): string {
  const [user, domain] = String(email ?? "").split("@");
  if (!domain) return "your email";
  const head = user.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, user.length - 1))}@${domain}`;
}

// ── Send helpers (compose the message + deliver) ────────────────────────────────

const OTP_TTL_MINUTES = 10;

export async function sendEmailOtp(to: string, code: string, purpose: "sign in" | "recovery" = "sign in"): Promise<{ ok: boolean; error?: string }> {
  if (!emailEnabled()) return { ok: false, error: "email_not_configured" };
  const html = `<p>Your ${purpose} verification code is:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>
    <p>It expires in ${OTP_TTL_MINUTES} minutes. If you did not request it, you can ignore this email.</p>`;
  return sendEmail({ to, subject: `Your verification code: ${code}`, html, text: `Your verification code is ${code} (expires in ${OTP_TTL_MINUTES} minutes).` });
}

export async function sendSmsOtp(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  return sendSms(to, `Your verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`);
}

export const OTP_EXPIRY_MS = OTP_TTL_MINUTES * 60 * 1000;
