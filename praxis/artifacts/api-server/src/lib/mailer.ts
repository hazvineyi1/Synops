/**
 * Minimal transactional mailer.
 *
 * Sends email via Resend's HTTP API using plain fetch — no SMTP client, no npm dependency,
 * nothing to bundle/externalise. It is a SAFE NO-OP until the environment is configured, so
 * shipping it never breaks anything: in-app notifications keep working; email simply starts
 * flowing once RESEND_API_KEY + EMAIL_FROM are set.
 *
 * Env:
 *   RESEND_API_KEY   - a Resend API key (required to send).
 *   EMAIL_FROM       - verified sender, e.g. "Praxis <noreply@yourdomain.com>" (required).
 *   PUBLIC_APP_URL   - absolute base for links in emails, e.g. https://synops-production.up.railway.app
 *                      (falls back to https://$RAILWAY_PUBLIC_DOMAIN when present).
 */

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Absolute URL for a same-app path, for use in emails. Returns the path unchanged if no base. */
export function appUrl(path: string): string {
  const base =
    process.env.PUBLIC_APP_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Send one email. Never throws; returns whether it was actually sent. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailerConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        subject: mail.subject,
        html: mail.html,
        ...(mail.text ? { text: mail.text } : {}),
      }),
    });
    if (!res.ok) {
      console.warn(`[mailer] Resend responded ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[mailer] send failed: ${(e as Error)?.message ?? e}`);
    return false;
  }
}

/** Wrap body content in a simple, brandable HTML shell. */
export function emailShell(opts: { heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string }): string {
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding:8px 0 4px"><a href="${opts.ctaUrl}" style="display:inline-block;background:#0F6E56;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${opts.ctaLabel}</a></td></tr>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f8f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14231f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #dce4e1;border-radius:14px;overflow:hidden">
      <tr><td style="padding:20px 24px 0"><div style="font-weight:800;font-size:16px;color:#0F6E56">Praxis</div></td></tr>
      <tr><td style="padding:12px 24px 20px">
        <h1 style="margin:0 0 10px;font-size:19px;line-height:1.3">${opts.heading}</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;color:#4b5b57">
          <tr><td>${opts.bodyHtml}</td></tr>
          ${cta}
        </table>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#8a9995;padding:12px 0">You're receiving this because of your role in Praxis.</div>
  </td></tr></table>
  </body></html>`;
}
