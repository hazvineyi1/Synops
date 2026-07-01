import type {
  BillingInterval,
  CountryCode,
  PaymentMethod,
} from "./config.js";

export type ProviderId = "paynow" | "flutterwave" | "stripe" | "mock";

export type PaymentStatus = "pending" | "paid" | "failed";

export interface InitiateInput {
  reference: string;
  amountMajor: number;
  amountMinor: number;
  currency: string;
  country: CountryCode;
  method: PaymentMethod;
  interval: BillingInterval;
  mobileNumber?: string;
  email: string;
  name: string;
  /** Where the gateway should send the user back to (frontend). */
  returnUrl: string;
  /** Server-to-server webhook URL for async confirmation. */
  resultUrl: string;
}

export interface InitiateResult {
  status: PaymentStatus;
  providerRef?: string;
  pollUrl?: string;
  redirectUrl?: string;
  instructions?: string;
  raw?: Record<string, unknown>;
}

export interface StatusInput {
  reference: string;
  providerRef?: string | null;
  pollUrl?: string | null;
}

export interface StatusResult {
  status: PaymentStatus;
  raw?: Record<string, unknown>;
}

export interface PaymentProvider {
  id: ProviderId;
  /** True when the live API keys for this provider are present. */
  isConfigured(): boolean;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  checkStatus(input: StatusInput): Promise<StatusResult>;
}
