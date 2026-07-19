/**
 * Transactional email via Resend's HTTP API (no SDK, no native dep -- same pattern as
 * supabaseStorage). Configure with:
 *   RESEND_API_KEY   your Resend API key
 *   EMAIL_FROM       a verified sender, e.g. "Praxis <no-reply@yourdomain.com>"
 *
 * Email is ADDITIVE: when unconfigured, senders no-op and the caller falls back to handing the
 * link over manually (the platform console already shows a copyable set-password link). So nothing
 * breaks without it; configuring it just makes the links deliver themselves.
 *
 * To use a different provider (SMTP/SendGrid/Postmark), swap the body of sendEmail() only.
 */

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(opts: { to: string; subject: string; html: string; text?: string }): Promise<{ ok: boolean; error?: string }> {
  if (!emailEnabled()) return { ok: false, error: "email_not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { ok: false, error: `resend ${res.status}: ${detail}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));

/**
 * Set-password / reset email. `mode` = "invite" (new account) or "reset" (existing). Returns the
 * send result so callers can report emailed vs. link-to-copy.
 */
export async function sendSetPasswordEmail(to: string, name: string | null, link: string, mode: "invite" | "reset"): Promise<{ ok: boolean; error?: string }> {
  const who = name ? esc(name) : "there";
  const heading = mode === "invite" ? "You've been given access to Praxis" : "Reset your Praxis password";
  const lead = mode === "invite"
    ? "An account has been created for you. Set a password to sign in."
    : "Use the button below to set a new password. If you did not request this, you can ignore this email.";
  const html = `<!doctype html><html><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#14231F;line-height:1.6">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 8px">${heading}</h2>
    <p style="margin:0 0 4px">Hi ${who},</p>
    <p style="margin:0 0 16px;color:#4B5B57">${lead}</p>
    <p style="margin:0 0 20px"><a href="${link}" style="background:#0F6E56;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Set your password</a></p>
    <p style="margin:0 0 8px;color:#4B5B57;font-size:13px">Or paste this link into your browser (it expires in 1 hour):</p>
    <p style="margin:0;font-size:12px;word-break:break-all;color:#185FA5">${esc(link)}</p>
  </div></body></html>`;
  const text = `${heading}\n\nHi ${who},\n${lead}\n\nSet your password: ${link}\n(This link expires in 1 hour.)`;
  return sendEmail({ to, subject: heading, html, text });
}
