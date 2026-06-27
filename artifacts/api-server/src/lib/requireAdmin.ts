import { clerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function isAdminUser(userId: string): Promise<boolean> {
  if (adminEmails.length === 0) return false;
  try {
    const user = await clerkClient.users.getUser(userId);
    const emails = (user.emailAddresses ?? [])
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.toLowerCase());
    return emails.some((e) => adminEmails.includes(e));
  } catch {
    return false;
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = (req as any).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ok = await isAdminUser(userId);
  if (!ok) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
