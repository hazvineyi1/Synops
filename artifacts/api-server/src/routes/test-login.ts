import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL ?? "testuser@thecoach.dev";

router.post("/test-login", async (_req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_TEST_LOGIN !== "true") {
    return res.status(404).json({ error: "Not found" });
  }

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Clerk secret not configured" });
  }

  try {
    const usersResp = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(TEST_EMAIL)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!usersResp.ok) {
      const body = await usersResp.text();
      return res.status(502).json({ error: "Clerk user lookup failed", status: usersResp.status, details: body });
    }
    const users = (await usersResp.json()) as Array<{ id: string }>;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(404).json({ error: "Test user not found" });
    }
    const userId = users[0].id;

    const tokenResp = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
    });
    const tokenData = (await tokenResp.json()) as { token?: string; errors?: unknown };
    if (!tokenResp.ok || !tokenData.token) {
      return res.status(502).json({ error: "Failed to mint sign-in token", details: tokenData });
    }

    return res.json({ token: tokenData.token });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
