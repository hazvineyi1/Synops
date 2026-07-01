import { logger } from "../../logger.js";
import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  StatusInput,
  StatusResult,
} from "../types.js";

// Flutterwave - used for Zambia (MTN/Airtel/Zamtel mobile money), South Africa
// cards, and Botswana (card, best-effort Orange Money). Uses the Standard hosted
// checkout (/v3/payments) which returns a redirect link, and verifies by
// reference (/v3/transactions/verify_by_reference).
// Docs: https://developer.flutterwave.com
const BASE = "https://api.flutterwave.com/v3";

function secretKey(): string | undefined {
  return process.env["FLUTTERWAVE_SECRET_KEY"];
}

function paymentOptions(method: string): string {
  switch (method) {
    case "mtn_momo":
    case "airtel_money":
    case "zamtel":
      return "mobilemoneyzambia";
    case "orange_money":
      return "mobilemoneyfranco,card";
    case "bank_transfer":
      return "banktransfer,account,card";
    case "card":
    default:
      return "card";
  }
}

export const flutterwaveProvider: PaymentProvider = {
  id: "flutterwave",

  isConfigured() {
    return Boolean(secretKey());
  },

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const res = await fetch(`${BASE}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey()}`,
      },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amountMajor,
        currency: input.currency,
        redirect_url: input.returnUrl,
        payment_options: paymentOptions(input.method),
        customer: {
          email: input.email,
          name: input.name,
          phonenumber: input.mobileNumber ?? "",
        },
        customizations: {
          title: "Synops Coach Pro",
          description: "Coach Pro subscription",
        },
        meta: { reference: input.reference, interval: input.interval },
      }),
    });
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };
    if (data.status !== "success" || !data.data?.link) {
      throw new Error(`Flutterwave error: ${data.message ?? "unknown"}`);
    }
    return {
      status: "pending",
      redirectUrl: data.data.link,
      providerRef: input.reference,
      raw: data as unknown as Record<string, unknown>,
    };
  },

  async checkStatus(input: StatusInput): Promise<StatusResult> {
    try {
      const url = `${BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
        input.reference,
      )}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${secretKey()}` },
      });
      const data = (await res.json()) as {
        status?: string;
        data?: { status?: string };
      };
      const txStatus = (data.data?.status ?? "").toLowerCase();
      if (txStatus === "successful") return { status: "paid", raw: data as Record<string, unknown> };
      if (txStatus === "failed") return { status: "failed", raw: data as Record<string, unknown> };
      return { status: "pending", raw: data as Record<string, unknown> };
    } catch (err) {
      logger.error({ err }, "flutterwave verify failed");
      return { status: "pending" };
    }
  },
};
