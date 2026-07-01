// WhatsApp sending via the Twilio REST API. We talk to Twilio over plain fetch so
// the server has no extra SDK dependency. Credentials come from env vars that are
// wired up "later" (the connection is deferred): until all three are present,
// isWhatsAppConfigured() returns false and callers skip sending explicitly.

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("WhatsApp (Twilio) is not configured");
    this.name = "WhatsAppNotConfiguredError";
  }
}

function accountSid(): string | undefined {
  return process.env["TWILIO_ACCOUNT_SID"];
}
function authToken(): string | undefined {
  return process.env["TWILIO_AUTH_TOKEN"];
}
// The dedicated WhatsApp sender number in E.164 (e.g. +263771234567). May already
// carry the "whatsapp:" prefix; we normalize either way.
function fromNumber(): string | undefined {
  return process.env["TWILIO_WHATSAPP_FROM"];
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(accountSid() && authToken() && fromNumber());
}

// Loose E.164 check: a leading + and 8-15 digits. We store and send in this shape.
const E164 = /^\+[1-9]\d{7,14}$/;

export function isValidE164(value: string): boolean {
  return E164.test(value.trim());
}

function toWhatsAppAddress(value: string): string {
  const v = value.trim();
  return v.startsWith("whatsapp:") ? v : `whatsapp:${v}`;
}

export interface SendResult {
  sid: string;
}

// Send a free-form WhatsApp message. Note: outside Twilio's 24-hour customer-service
// window, free-form bodies are rejected unless they map to an approved template; that
// is a Twilio-side concern handled when templates are submitted.
export async function sendWhatsAppMessage(opts: {
  to: string;
  body: string;
}): Promise<SendResult> {
  const sid = accountSid();
  const token = authToken();
  const from = fromNumber();
  if (!sid || !token || !from) {
    throw new WhatsAppNotConfiguredError();
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
  const params = new URLSearchParams();
  params.set("To", toWhatsAppAddress(opts.to));
  params.set("From", toWhatsAppAddress(from));
  params.set("Body", opts.body);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Twilio send failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { sid?: string };
  return { sid: data.sid ?? "" };
}
