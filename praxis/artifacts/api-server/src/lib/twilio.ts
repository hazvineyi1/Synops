/**
 * Twilio WhatsApp wrapper.
 *
 * Inbound replies are handled with TwiML in the webhook (no credentials
 * needed to reply within a conversation). Proactive OUTBOUND nudges
 * (credential-expiry alerts, daily-plan reminders) use the REST API and
 * require Twilio credentials.
 *
 * Credentials are resolved from env vars, which the Replit Twilio
 * connector provisions once connected:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * (from should be like "whatsapp:+14155238886").
 */

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

export function toWhatsAppAddress(phone: string): string {
  const p = phone.trim();
  if (p.startsWith("whatsapp:")) return p;
  return `whatsapp:${p.startsWith("+") ? p : `+${p.replace(/[^\d]/g, "")}`}`;
}

export interface SendResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/** Send a proactive WhatsApp message via Twilio REST. */
export async function sendWhatsApp(toPhone: string, body: string): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { ok: false, error: "twilio_not_configured" };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_FROM!;

  const params = new URLSearchParams({
    To: toWhatsAppAddress(toPhone),
    From: toWhatsAppAddress(from),
    Body: body,
  });

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `twilio_${resp.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await resp.json()) as { sid?: string };
    return { ok: true, sid: json.sid };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Validate an inbound Twilio webhook signature (X-Twilio-Signature).
 * Twilio signs HMAC-SHA1 over the full request URL followed by each POST
 * param appended as key+value in alphabetical order, keyed by the auth token.
 *
 * Returns true when the signature is valid. When Twilio is not configured
 * (no auth token) we cannot verify, so callers decide how to treat that.
 */
export function validateTwilioSignature(
  signature: string | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;

  // Reconstruct the string Twilio signed.
  const data =
    url +
    Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], "");

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("node:crypto") as typeof import("node:crypto");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Escape text for inclusion inside a TwiML <Message> body. */
export function twiml(message: string): string {
  const esc = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
}
