import { test, expect } from "@playwright/test";

// Smoke tests for the Coach deployment. Safe to run against production: they only
// read pages and hit health endpoints. The single write path is an optional
// sign-in with a dedicated test account (creates no data) that runs only when
// TEST_EMAIL / TEST_PASSWORD are provided.

test.describe("Coach smoke", () => {
  test("liveness: /api/healthz responds ok", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("ok");
  });

  test("readiness: /api/readyz reports the database reachable", async ({ request }) => {
    const res = await request.get("/api/readyz");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status?: string };
    expect(body.status).toBe("ready");
  });

  test("Coach sign-in page renders", async ({ page }) => {
    await page.goto("/study/login");
    await expect(page.getByText("Synops Coach")).toBeVisible();
    // The card title "Sign in" renders as a styled div, not a semantic heading,
    // so match on exact text rather than the heading role.
    await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("marketing site root loads", async ({ page }) => {
    const res = await page.goto("/");
    // Just confirm the deployment serves the root without an error status and
    // renders a body; specific marketing copy is intentionally not asserted so
    // this stays stable as the landing page evolves.
    expect(res?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });

  test("authenticated learner reaches the app", async ({ page }) => {
    const email = process.env["TEST_EMAIL"];
    const password = process.env["TEST_PASSWORD"];
    test.skip(
      !email || !password,
      "Set TEST_EMAIL and TEST_PASSWORD secrets to run the authenticated smoke test",
    );
    await page.goto("/study/login");
    await page.locator("#email").fill(email!);
    await page.locator("#password").fill(password!);
    await page.getByRole("button", { name: "Sign In" }).click();
    // On success the app routes to /study/coach; assert we left the login page
    // and the authenticated shell (brand in the nav) is visible.
    await page.waitForURL(/\/study\/(coach|dashboard|today)/, { timeout: 20_000 });
    await expect(page.getByText(/Synops Coach/i).first()).toBeVisible();
  });
});
