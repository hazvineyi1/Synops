import crypto from "node:crypto";
import { logger } from "../../logger.js";
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  StatusInput,
  StatusResult,
} from "../types.js";

// Paynow (Zimbabwe) - EcoCash, OneMoney and card.
// Docs: https://developers.paynow.co.zw
// Mobile money uses the Express Checkout endpoint (/remotetransaction) which
// pushes a USSD prompt to the customer's phone; card uses the web checkout
// (/initiatetransaction) which returns a browser redirect URL.
const REMOTE_URL = "https://www.paynow.co.zw/interface/remotetransaction";
const WEB_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

function integrationId(): string | undefined {
  return process.env["PAYNOW_INTEGRATION_ID"];
}
function integrationKey(): string | undefined {
  return process.env["PAYNOW_INTEGRATION_KEY"];
}

// Paynow's hash is SHA512 (uppercase hex) over the concatenation of every field
// VALUE in insertion order, followed by the integration key.
function hash(fields: Record<string, string>, key: string): string {
  const concat = Object.values(fields).join("") + key;
  return crypto.createHash("sha512").update(concat, "utf8").digest("hex").toUpperCase();
}

function parseUrlEncoded(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body).entries()) out[k] = v;
  return out;
}

function methodToPaynow(method: string): string {
  // Paynow expects the mobile wallet name in the `method` field.
  if (method === "onemoney") return "onemoney";
  return "ecocash";
}

export const paynowProvider: PaymentProvider = {
  id: "paynow",

  isConfigured() {
    return Boolean(integrationId() && integrationKey());
  },

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const id = integrationId()!;
    const key = integrationKey()!;
    const amount = input.amountMajor.toFixed(2);

    if (input.method === "card") {
      // Web checkout -> returns a browser redirect URL.
      const fields: Record<string, string> = {
        id,
        reference: input.reference,
        amount,
        additionalinfo: "Synops Coach Pro subscription",
        returnurl: input.returnUrl,
        resulturl: input.resultUrl,
        authemail: input.email,
        status: "Message",
      };
      fields["hash"] = hash(fields, key);
      const res = await fetch(WEB_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
      });
      const parsed = parseUrlEncoded(await res.text());
      if ((parsed["status"] ?? "").toLowerCase() !== "ok") {
        throw new Error(`Paynow error: ${parsed["error"] ?? "unknown"}`);
      }
      return {
        status: "pending",
        providerRef: parsed["pollurl"],
        pollUrl: parsed["pollurl"],
        redirectUrl: parsed["browserurl"],
        raw: parsed,
      };
    }

    // Mobile money (EcoCash / OneMoney) - Express Checkout.
    const fields: Record<string, string> = {
      id,
      reference: input.reference,
      amount,
      additionalinfo: "Synops Coach Pro subscription",
      returnurl: input.returnUrl,
      resulturl: input.resultUrl,
      authemail: input.email,
      phone: input.mobileNumber ?? "",
      method: methodToPaynow(input.method),
      status: "Message",
    };
    fields["hash"] = hash(fields, key);
    const res = await fetch(REMOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
    const parsed = parseUrlEncoded(await res.text());
    if ((parsed["status"] ?? "").toLowerCase() !== "ok") {
      throw new Error(`Paynow error: ${parsed["error"] ?? "unknown"}`);
    }
    return {
      status: "pending",
      providerRef: parsed["pollurl"],
      pollUrl: parsed["pollurl"],
      instructions:
        parsed["instructions"] ??
        "Check your phone and approve the payment prompt to continue.",
      raw: parsed,
    };
  },

  async checkStatus(input: StatusInput): Promise<StatusResult> {
    const pollUrl = input.pollUrl ?? input.providerRef;
    if (!pollUrl) return { status: "pending" };
    try {
      const res = await fetch(pollUrl, { method: "POST" });
      const parsed = parseUrlEncoded(await res.text());
      const status = (parsed["status"] ?? "").toLowerCase();
      if (["paid", "awaiting delivery", "delivered"].includes(status)) {
        return { status: "paid", raw: parsed };
      }
      if (["cancelled", "disputed", "refunded", "failed"].includes(status)) {
        return { status: "failed", raw: parsed };
      }
      return { status: "pending", raw: parsed };
    } catch (err) {
      logger.error({ err }, "paynow poll failed");
      return { status: "pending" };
    }
  },
};
