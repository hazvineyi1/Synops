import type {
  InitiateInput,
  InitiateResult,
  PaymentProvider,
  StatusInput,
  StatusResult,
} from "../types.js";

// Sandbox provider used when no live gateway keys are configured. It lets the
// entire checkout flow be exercised end-to-end: a payment is reported as
// `pending`, then flips to `paid` a few seconds later so polling succeeds.
// The "approve after" timestamp is encoded into the providerRef so status checks
// stay stateless.
const APPROVE_AFTER_MS = 6000;

export const mockProvider: PaymentProvider = {
  id: "mock",

  isConfigured() {
    return true;
  },

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const approveAt = Date.now() + APPROVE_AFTER_MS;
    return {
      status: "pending",
      providerRef: `MOCK-${approveAt}-${input.reference}`,
      instructions:
        "Sandbox mode: no live payment keys are connected yet, so this simulates a successful payment in a few seconds. Add your merchant keys to take real payments.",
      raw: { sandbox: true },
    };
  },

  async checkStatus(input: StatusInput): Promise<StatusResult> {
    const ref = input.providerRef ?? "";
    const match = /^MOCK-(\d+)-/.exec(ref);
    if (!match) return { status: "pending" };
    const approveAt = Number(match[1]);
    return { status: Date.now() >= approveAt ? "paid" : "pending", raw: { sandbox: true } };
  },
};
