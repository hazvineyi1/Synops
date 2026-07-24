import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateOtp, hashOtp, verifyOtpHash, maskEmail, maskPhone, smsEnabled } from "./otpChannels";

/**
 * Pure unit tests for the OTP channel helpers: code shape, hash round-trip + constant-time compare,
 * masking, and the SMS availability gate. No DB, no network.
 */

describe("otpChannels", () => {
  it("generates a 6-digit numeric code, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      const c = generateOtp();
      expect(c).toMatch(/^\d{6}$/);
    }
  });

  it("hashes + verifies a code, and rejects the wrong one", () => {
    const code = generateOtp();
    const h = hashOtp(code);
    expect(h).toHaveLength(64); // sha-256 hex
    expect(verifyOtpHash(code, h)).toBe(true);
    expect(verifyOtpHash(code === "000000" ? "111111" : "000000", h)).toBe(false);
    // A garbage stored-hash of the wrong length must not throw and must be false.
    expect(verifyOtpHash(code, "short")).toBe(false);
  });

  it("masks emails and phones without leaking the full value", () => {
    expect(maskEmail("thabo@enza.co.za")).toBe("t****@enza.co.za");
    expect(maskEmail("not-an-email")).toBe("your email");
    const m = maskPhone("+27821234567");
    expect(m).toContain("567");
    expect(m).not.toContain("821");
  });

  describe("smsEnabled", () => {
    const saved = { ...process.env };
    beforeEach(() => { delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM; });
    afterEach(() => { process.env = { ...saved }; });

    it("is false when Twilio env is absent (graceful)", () => {
      expect(smsEnabled()).toBe(false);
    });
    it("is true only when all three Twilio vars are set", () => {
      process.env.TWILIO_ACCOUNT_SID = "AC123";
      expect(smsEnabled()).toBe(false);
      process.env.TWILIO_AUTH_TOKEN = "tok";
      expect(smsEnabled()).toBe(false);
      process.env.TWILIO_FROM = "+15550001111";
      expect(smsEnabled()).toBe(true);
    });
  });
});
