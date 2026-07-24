import { createHmac, randomBytes } from "node:crypto";

/**
 * RFC 6238 TOTP (time-based one-time passwords) + RFC 4648 base32, implemented on node:crypto
 * with no third-party dependency (same reasoning as lib/auth.ts: no native modules, nothing to
 * install, nothing that can fail to resolve at boot). Used for opt-in admin two-factor auth.
 *
 * Secrets are base32 (what authenticator apps expect). Codes are verified with a small +/- time
 * window to tolerate clock skew, and compared in constant time to avoid a timing oracle.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TIME_STEP = 30; // seconds
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue; // skip spaces / separators / padding
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP for a given counter. */
function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

/** The current TOTP for a base32 secret at time `t` (ms since epoch). */
export function totp(secretB32: string, t: number = Date.now(), step = TIME_STEP, digits = DIGITS): string {
  return hotp(base32Decode(secretB32), Math.floor(t / 1000 / step), digits);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify a submitted code against the secret, allowing +/- `window` steps of clock skew.
 * Checks every step in the window (no early return) so it can't be used as a timing oracle.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  t: number = Date.now(),
  window = 1,
  step = TIME_STEP,
  digits = DIGITS,
): boolean {
  const clean = String(code ?? "").replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(clean)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(t / 1000 / step);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const c = counter + w;
    if (c < 0) continue;
    if (constantTimeEqual(hotp(secret, c, digits), clean)) ok = true;
  }
  return ok;
}

/** A fresh base32 TOTP secret (160 bits, the RFC-recommended SHA1 key size). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** otpauth:// URI an authenticator app scans / imports. */
export function otpauthUrl(secretB32: string, account: string, issuer = "The Coach"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(TIME_STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Human-friendly one-time backup codes (shown once). Store only their hashes, never these. */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = base32Encode(randomBytes(6)).slice(0, 10).toLowerCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalise a backup code for hashing/compare (case + separators insensitive). */
export function normalizeBackupCode(code: string): string {
  return String(code ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
