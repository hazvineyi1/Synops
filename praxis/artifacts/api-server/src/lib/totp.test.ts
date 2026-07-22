import { describe, it, expect } from "vitest";
import {
  base32Encode, base32Decode, totp, verifyTotp, generateSecret, otpauthUrl,
  generateBackupCodes, normalizeBackupCode, TIME_STEP,
} from "./totp";

// The RFC 6238 reference secret is the ASCII "12345678901234567890" (20 bytes), base32-encoded.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("base32", () => {
  it("round-trips bytes", () => {
    const b = Buffer.from("12345678901234567890", "ascii");
    expect(base32Encode(b)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
  });
  it("ignores spaces and case when decoding", () => {
    expect(base32Decode("gezd gnbv").equals(base32Decode("GEZDGNBV"))).toBe(true);
  });
});

describe("totp (RFC 6238 SHA1 test vectors)", () => {
  const cases: Array<[number, string]> = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];
  for (const [seconds, expected] of cases) {
    it(`T=${seconds}s -> ${expected}`, () => {
      expect(totp(RFC_SECRET, seconds * 1000)).toBe(expected);
    });
  }
});

describe("verifyTotp", () => {
  const t = 1234567890 * 1000;
  it("accepts the current code", () => {
    expect(verifyTotp(RFC_SECRET, "005924", t)).toBe(true);
  });
  it("accepts a code from the previous/next step within the window", () => {
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t - TIME_STEP * 1000), t, 1)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + TIME_STEP * 1000), t, 1)).toBe(true);
  });
  it("rejects a code outside the window", () => {
    expect(verifyTotp(RFC_SECRET, totp(RFC_SECRET, t + 5 * TIME_STEP * 1000), t, 1)).toBe(false);
  });
  it("rejects a wrong code and malformed input", () => {
    expect(verifyTotp(RFC_SECRET, "000000", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abc", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", t)).toBe(false);
  });
  it("tolerates spaces in the submitted code", () => {
    expect(verifyTotp(RFC_SECRET, "005 924", t)).toBe(true);
  });
});

describe("generateSecret + otpauthUrl", () => {
  it("makes a valid base32 secret whose current code verifies", () => {
    const secret = generateSecret();
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    expect(verifyTotp(secret, totp(secret))).toBe(true);
  });
  it("builds an otpauth URI with issuer + secret + period", () => {
    const url = otpauthUrl("ABC234", "admin@example.com", "SynOps Praxis");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("secret=ABC234");
    expect(url).toContain("issuer=SynOps+Praxis");
    expect(url).toContain(`period=${TIME_STEP}`);
  });
});

describe("backup codes", () => {
  it("generates the requested count of distinct codes", () => {
    const codes = generateBackupCodes(10);
    expect(codes.length).toBe(10);
    expect(new Set(codes).size).toBe(10);
  });
  it("normalises for case- and separator-insensitive matching", () => {
    expect(normalizeBackupCode("ABc12-De34")).toBe(normalizeBackupCode("abc12de34"));
  });
});
