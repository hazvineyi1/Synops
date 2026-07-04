// Email delivery posts directly to Resend's REST API using RESEND_API_KEY.
// (Previously the Replit Resend connector; replaced for host-independent deploy.)
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface MinimalLogger {
  info: (obj: object, msg?: string) => void;
  warn?: (obj: object, msg?: string) => void;
  error?: (obj: object, msg?: string) => void;
}

export interface ContactNotification {
  name: string;
  email: string;
  organization?: string | null;
  phone?: string | null;
  areaOfInterest: string;
  message: string;
  source: string;
}

// Default sender uses Resend's shared onboarding domain, which only delivers to
// the Resend account owner. Set CONTACT_FROM_EMAIL to an address on a verified
// domain (e.g. "Synops Advisory <notifications@synops-consulting.com>") for real
// delivery to arbitrary recipients.
const DEFAULT_FROM = "Synops Advisory <onboarding@resend.dev>";

// Bound the provider call so a slow/hung Resend never stalls the public form.
const SEND_TIMEOUT_MS = 8000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Strip control characters (incl. CR/LF) so user-supplied values cannot inject
// headers or break the subject line.
function sanitizeHeader(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Resend request timed out after ${ms}ms`)),
      ms,
    );
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

// Extract a non-sensitive error code from a Resend error body. The full message
// can contain account/recipient details, so it is never logged verbatim.
function resendErrorCode(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as { name?: unknown };
    if (typeof parsed.name === "string") return parsed.name;
  } catch {
    // body was not JSON
  }
  return "unknown";
}

function buildBodies(n: ContactNotification): { text: string; html: string } {
  const rows: [string, string][] = [
    ["Name", n.name],
    ["Email", n.email],
    ["Organization", n.organization || "-"],
    ["Phone", n.phone || "-"],
    ["Area of interest", n.areaOfInterest],
    ["Source", n.source],
  ];

  const text =
    "New submission from the Synops website.\n\n" +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\nMessage:\n${n.message}\n`;

  const html =
    `<h2>New submission from the Synops website</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="font-weight:600">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join("") +
    `</table>` +
    `<p style="font-weight:600;margin-bottom:4px">Message</p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(n.message)}</p>`;

  return { text, html };
}

/**
 * Send a notification email about a new contact/portal submission.
 *
 * Delivery is best-effort: if no recipient is configured or the Resend send
 * fails, times out, or throws, this degrades to structured logging and never
 * throws, so the public-facing form flow always succeeds.
 */
export async function sendContactNotification(
  log: MinimalLogger,
  n: ContactNotification,
): Promise<void> {
  try {
    const to = process.env.CONTACT_EMAIL;
    if (!to) {
      log.info(
        { from: n.email, area: n.areaOfInterest, source: n.source },
        "Contact notification received, CONTACT_EMAIL unset, logged only",
      );
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      log.info(
        { from: n.email, area: n.areaOfInterest, source: n.source },
        "Contact notification received, RESEND_API_KEY unset, logged only",
      );
      return;
    }

    const from = process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM;
    const { text, html } = buildBodies(n);
    const subject = n.source.startsWith("demo")
      ? `New demo lead: ${n.name}`
      : `New contact form submission: ${n.name}`;

    const sendPromise = fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: n.email,
        subject: sanitizeHeader(subject),
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
      (log.error ?? log.info).call(
        log,
        { recipient: to, status: response.status, reason: resendErrorCode(detail) },
        "Contact notification: Resend send failed, submission persisted only",
      );
      return;
    }

    log.info({ recipient: to, source: n.source }, "Contact notification sent via Resend");
  } catch (err) {
    (log.error ?? log.info).call(
      log,
      { err: err instanceof Error ? err.message : String(err) },
      "Contact notification: Resend send failed, submission persisted only",
    );
  }
}
