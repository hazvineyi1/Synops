import crypto from "node:crypto";

/**
 * Cross-product admin SSO tokens.
 *
 * A tiny, dependency-free HS256 signed token (JWT shape) that the issuer (this app) mints and
 * each consumer product verifies with the SAME shared secret (env SSO_SHARED_SECRET). Tokens are
 * short-lived (2 minutes) and bound to a single product via the `aud` claim. Possession of a valid
 * token is NOT sufficient on its own: every consumer independently authorises the email against its
 * own admin model before establishing a session.
 */

const ISS = "synops-sso";
const TTL_SECONDS = 120;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hmac(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export interface SsoClaims {
  sub: string; // admin email (lowercased)
  name?: string;
  iss: string;
  aud: string; // product key
  iat: number;
  exp: number;
  jti: string;
}

/** Sign an SSO token for one product audience. */
export function mintSsoToken(email: string, name: string | undefined, aud: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SsoClaims = {
    sub: email.toLowerCase(),
    name: name || undefined,
    iss: ISS,
    aud,
    iat: now,
    exp: now + TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = hmac(`${header}.${body}`, secret);
  return `${header}.${body}.${sig}`;
}

/** Verify an SSO token for the expected audience. Returns claims, or null if invalid/expired. */
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

/**
 * The product registry. Extensible: to add a new product, add an entry here (and set its
 * SSO consume endpoint + the shared secret on that service). Base URLs are env-overridable.
 */
export interface SsoProduct {
  key: string;
  label: string;
  aud: string;
  baseUrl: string;
  landing: string; // path to land on after SSO
}

export function ssoProducts(): SsoProduct[] {
  return [
    { key: "praxis", label: "Synops Praxis", aud: "praxis", baseUrl: process.env["SSO_PRAXIS_URL"] ?? "https://praxis.synops-consulting.com", landing: "/platform" },
  ];
}
