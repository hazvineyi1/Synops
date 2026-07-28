import { describe, it, expect } from "vitest";
import { shouldRedirectToCanonical } from "./canonicalHost";

// Guards the canonical-host redirect: hits on the raw *.up.railway.app domain bounce to the branded
// domain, but /api (incl. the /api/readyz health check), the /c/ /a/ embeds, and non-GET/HEAD
// requests must be left alone, and it must never loop on the canonical host itself.

const RW = "synops-production.up.railway.app";
const CD = "praxis.synops-consulting.com";
const r = (host: string, method: string, path: string, canonical = CD) =>
  shouldRedirectToCanonical(host, method, path, canonical);

describe("shouldRedirectToCanonical", () => {
  it("redirects a navigational GET on the Railway host", () => {
    expect(r(RW, "GET", "/sign-in")).toBe(true);
    expect(r(RW, "GET", "/platform-overview")).toBe(true);
    expect(r(RW, "HEAD", "/")).toBe(true);
    expect(r(RW, "GET", "/assets/app.js")).toBe(true);
  });

  it("never redirects /api (protects Railway's /api/readyz health check and API calls)", () => {
    expect(r(RW, "GET", "/api/readyz")).toBe(false);
    expect(r(RW, "GET", "/api/version")).toBe(false);
    expect(r(RW, "POST", "/api/auth/login")).toBe(false);
  });

  it("never redirects the /c/ and /a/ external token embeds", () => {
    expect(r(RW, "GET", "/c/abc123")).toBe(false);
    expect(r(RW, "GET", "/a/xyz789")).toBe(false);
  });

  it("only redirects GET and HEAD, never mutating methods", () => {
    expect(r(RW, "POST", "/sign-in")).toBe(false);
    expect(r(RW, "PUT", "/anything")).toBe(false);
    expect(r(RW, "DELETE", "/anything")).toBe(false);
  });

  it("does not redirect requests already on the canonical (branded) host, so there is no loop", () => {
    expect(r(CD, "GET", "/sign-in")).toBe(false);
    expect(r("enza.synops-consulting.com", "GET", "/sign-in")).toBe(false);
  });

  it("is disabled when the canonical host is empty", () => {
    expect(r(RW, "GET", "/sign-in", "")).toBe(false);
  });
});
