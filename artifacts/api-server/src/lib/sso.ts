import crypto from "node:crypto";

/**
 * Verifier for cross-product admin SSO tokens minted by the Synops issuer (paideia-api).
 * HS256, shared secret via env SSO_SHARED_SECRET, short-lived, bound to this product via `aud`.
 * A valid token only proves the issuer vouches for the email. Arete still independently checks
 * the email against ADMIN_EMAILS before minting a Clerk sign-in ticket.
 */

const ISS = "synops-sso";

function hmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export interface SsoClaims {
  sub: string;
  name?: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export function verifySsoToken(token: string, secret: string, expectedAud: string): SsoClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = hmac(`${header}.${body}`, secret);
  const a = Buffer.from(sig ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload: SsoClaims;
  try {
    payload = JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as SsoClaims;
  } catch {
    return null;
  }
  if (payload.iss !== ISS) return null;
  if (payload.aud !== expectedAud) return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;
  return payload;
}
