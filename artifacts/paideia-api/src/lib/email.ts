import { logger } from "./logger.js";

/**
 * Minimal transactional email sender.
 *
 * Deliberately uses Resend's HTTP API over fetch rather than an SDK: adding an npm
 * dependency here means declaring it as an esbuild external, and a missing external
 * is resolved by Node at BOOT (not lazily), which has taken the whole service down
 * before. fetch is built in, so there is nothing to install and nothing to hoist.
 *
 * Configuration (Railway env):
 *   RESEND_API_KEY  - if unset, email is disabled and send() is a no-op that reports
 *                     configured:false. Nothing throws; callers degrade gracefully.
 *   EMAIL_FROM      - e.g. "Synops Coach <noreply@synopscoach.com>". The sending
 *                     domain must be verified in Resend or delivery will fail.
 */

export function isEmailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"] && process.env["EMAIL_FROM"]);
}

export interface SendResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];

  if (!apiKey || !from) {
    logger.warn({ to: opts.to, subject: opts.subject }, "email not configured; skipping send");
    return { ok: false, configured: false, error: "Email is not configured on this server." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error({ status: res.status, body }, "email send failed");
      return { ok: false, configured: true, error: `Email provider returned ${res.status}` };
    }
    return { ok: true, configured: true };
  } catch (err) {
    logger.error({ err }, "email send threw");
    return { ok: false, configured: true, error: "Could not reach the email provider." };
  }
}

/** Absolute base URL of the Coach app, used to build links inside emails. */
export function coachBaseUrl(): string {
  const explicit = process.env["STUDY_APP_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  return "https://www.synopscoach.com/study";
}

export function passwordResetEmail(name: string, link: string) {
  const safeName = name || "there";
  return {
    subject: "Reset your Synops Coach password",
    text: `Hi ${safeName},\n\nWe received a request to reset your Synops Coach password.\n\nReset it here (this link expires in 1 hour and can only be used once):\n${link}\n\nIf you did not request this, you can ignore this email. Your password will not change.\n\nSynops Coach`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1f2937;max-width:520px">
  <h2 style="margin:0 0 16px;font-size:20px;color:#7f1d1d">Reset your password</h2>
  <p style="margin:0 0 16px">Hi ${safeName},</p>
  <p style="margin:0 0 16px">We received a request to reset your Synops Coach password.</p>
  <p style="margin:0 0 24px">
    <a href="${link}" style="display:inline-block;background:#7f1d1d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Reset my password</a>
  </p>
  <p style="margin:0 0 16px;font-size:14px;color:#6b7280">This link expires in 1 hour and can only be used once.</p>
  <p style="margin:0;font-size:14px;color:#6b7280">If you did not request this, you can ignore this email. Your password will not change.</p>
</div>`,
  };
}
