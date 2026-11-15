import { describe, it, expect, afterEach } from "vitest";
import { hubMode, injectHubMeta, mrbHubRedirectTarget } from "./hub";

// Guards hub mode: only known hubs switch the SPA, the meta tag lands in <head>, and the old
// /demos/mrb redirect only fires on the main service with a valid https MRB_HUB_URL.

const saved = { HUB_MODE: process.env.HUB_MODE, MRB_HUB_URL: process.env.MRB_HUB_URL };
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

describe("hubMode", () => {
  it("is off by default and for unknown values", () => {
    delete process.env.HUB_MODE;
    expect(hubMode()).toBe("");
    process.env.HUB_MODE = "enza";
    expect(hubMode()).toBe("");
  });
  it("accepts mrb in any case", () => {
    process.env.HUB_MODE = " MRB ";
    expect(hubMode()).toBe("mrb");
  });
});

describe("injectHubMeta", () => {
  const shell = "<html><head><title>x</title></head><body></body></html>";
  it("adds the meta tag inside head in hub mode", () => {
    const out = injectHubMeta(shell, "mrb");
    expect(out).toContain('<meta name="praxis-hub" content="mrb" />');
    expect(out.indexOf("praxis-hub")).toBeLessThan(out.indexOf("</head>"));
  });
  it("leaves the shell untouched outside hub mode", () => {
    expect(injectHubMeta(shell, "")).toBe(shell);
  });
});

describe("mrbHubRedirectTarget", () => {
  it("is null until MRB_HUB_URL is set", () => {
    delete process.env.MRB_HUB_URL;
    expect(mrbHubRedirectTarget("")).toBeNull();
  });
  it("returns the https URL without a trailing slash", () => {
    process.env.MRB_HUB_URL = "https://mrb.synops-consulting.com/";
    expect(mrbHubRedirectTarget("")).toBe("https://mrb.synops-consulting.com");
  });
  it("never redirects on the hub itself or to a non-https URL", () => {
    process.env.MRB_HUB_URL = "https://mrb.synops-consulting.com";
    expect(mrbHubRedirectTarget("mrb")).toBeNull();
    process.env.MRB_HUB_URL = "http://mrb.synops-consulting.com";
    expect(mrbHubRedirectTarget("")).toBeNull();
    process.env.MRB_HUB_URL = "not a url";
    expect(mrbHubRedirectTarget("")).toBeNull();
  });
});
