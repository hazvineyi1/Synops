import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against a live Coach deployment. Override the target with the
// BASE_URL env var (the e2e workflow sets it); default is the production URL.
const baseURL =
  process.env["BASE_URL"] ??
  "https://wonderful-adaptation-production-ce7f.up.railway.app";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Live-site flakiness (cold starts, network) shouldn't red the run on a blip.
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
