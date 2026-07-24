import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";

/**
 * WebAuthn / passkey wrapper over @simplewebauthn/server. Registration and assertion for Face ID /
 * Touch ID / Windows Hello / hardware keys. The Relying Party ID (rpID) is the site's registrable
 * domain and the origin is scheme+host; both derive from the request host by default and can be
 * pinned via WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN (needed behind a proxy or on a custom domain).
 *
 * We store a credential as base64url strings so it round-trips through JSON/Postgres cleanly:
 *   { credentialID, publicKey (base64url), counter, transports }.
 */

const RP_NAME = "Praxis";

export interface StoredCredential {
  credentialID: string; // base64url
  publicKey: string; // base64url of the COSE public key
  counter: number;
  transports?: AuthenticatorTransportFuture[];
}

/** rpID (hostname) + origin (scheme://host) for the current request, env-overridable. */
export function rpFromRequest(host: string | undefined, proto: string | undefined): { rpID: string; origin: string } {
  const envRp = process.env.WEBAUTHN_RP_ID;
  const envOrigin = process.env.WEBAUTHN_ORIGIN;
  const cleanHost = String(host ?? "localhost").split(":")[0];
  const scheme = proto === "http" ? "http" : "https";
  const hostWithPort = String(host ?? "localhost");
  return {
    rpID: envRp || cleanHost,
    origin: envOrigin || `${scheme}://${hostWithPort}`,
  };
}

const b64url = (u: Uint8Array): string => Buffer.from(u).toString("base64url");
// Copy into a fresh ArrayBuffer-backed Uint8Array (Buffer's backing store is ArrayBufferLike,
// which the WebAuthnCredential type rejects).
const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const buf = Buffer.from(s, "base64url");
  const ab = new ArrayBuffer(buf.byteLength);
  const out = new Uint8Array(ab);
  out.set(buf);
  return out;
};

/** Registration options for a new passkey. Excludes already-registered credentials. */
export async function registrationOptions(opts: {
  rpID: string;
  userId: string;
  userName: string;
  existing: StoredCredential[];
}) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: opts.rpID,
    userName: opts.userName,
    userID: new TextEncoder().encode(opts.userId),
    attestationType: "none",
    excludeCredentials: opts.existing.map((c) => ({ id: c.credentialID, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}

/** Verify a registration response against the stored challenge; returns the credential to persist. */
export async function verifyRegistration(opts: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  rpID: string;
  origin: string;
}): Promise<StoredCredential | null> {
  const verification = await verifyRegistrationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.origin,
    expectedRPID: opts.rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return null;
  const c = verification.registrationInfo.credential;
  return { credentialID: c.id, publicKey: b64url(c.publicKey), counter: c.counter, transports: c.transports };
}

/** Authentication options (a challenge) for the given user's registered credentials. */
export async function authenticationOptions(opts: { rpID: string; credentials: StoredCredential[] }) {
  return generateAuthenticationOptions({
    rpID: opts.rpID,
    userVerification: "preferred",
    allowCredentials: opts.credentials.map((c) => ({ id: c.credentialID, transports: c.transports })),
  });
}

/**
 * Verify an assertion against a stored credential + challenge. Returns the new signature counter on
 * success (persist it to defend against cloned-authenticator replay), or null on failure.
 */
export async function verifyAssertion(opts: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  rpID: string;
  origin: string;
  credential: StoredCredential;
}): Promise<{ newCounter: number } | null> {
  const verification = await verifyAuthenticationResponse({
    response: opts.response,
    expectedChallenge: opts.expectedChallenge,
    expectedOrigin: opts.origin,
    expectedRPID: opts.rpID,
    requireUserVerification: false,
    credential: {
      id: opts.credential.credentialID,
      publicKey: fromB64url(opts.credential.publicKey),
      counter: opts.credential.counter,
      transports: opts.credential.transports,
    },
  });
  if (!verification.verified) return null;
  return { newCounter: verification.authenticationInfo.newCounter };
}
