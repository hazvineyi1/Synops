import { Router, type IRouter } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db, teachersTable, sessionsTable, passwordResetsTable } from "@workspace/paideia-db";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  hashPassword,
  newSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  sessionExpiry,
  verifyPassword,
} from "../../lib/auth.js";
import { REGION_IDS } from "../../lib/catalog.js";
import { requireAuth } from "../../middlewares/auth.js";
import { rateLimit } from "../../middlewares/rateLimit.js";
import { logEvent } from "../../lib/eventLog.js";

const router: IRouter = Router();

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  region: z.string().refine((v) => REGION_IDS.includes(v), {
    message: "Unknown region",
  }),
  country: z.string().max(120).optional(),
  schoolName: z.string().max(200).optional(),
  subjects: z.array(z.string().max(120)).max(20).default([]),
  yearGroups: z.array(z.string().max(40)).max(20).default([]),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

router.post("/signup", rateLimit({ windowMs: 60 * 60 * 1000, max: 5 }), async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const data = parsed.data;
  const emailLower = data.email.trim().toLowerCase();
  const isFounder = adminEmails().has(emailLower);

  const existing = await db
    .select({ id: teachersTable.id })
    .from(teachersTable)
    .where(eq(teachersTable.email, emailLower))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const [teacher] = await db
    .insert(teachersTable)
    .values({
      email: emailLower,
      passwordHash: hashPassword(data.password),
      name: data.name.trim(),
      region: data.region,
      country: data.country?.trim() || null,
      schoolName: data.schoolName?.trim() || null,
      subjects: data.subjects,
      yearGroups: data.yearGroups,
      status: "active",
      approvedAt: new Date(),
    })
    .returning();

  const token = newSessionToken();
  await db.insert(sessionsTable).values({
    token,
    teacherId: teacher.id,
    expiresAt: sessionExpiry(),
  });

  res.cookie(SESSION_COOKIE, token, cookieOptions());
  req.teacher = teacher;
  void logEvent(req, "teacher_signed_up", {
    region: data.region,
    country: data.country ?? null,
    school: data.schoolName ?? null,
  }, { surface: "app" });
  res.json({ teacher: serialiseTeacher(teacher) });
});

router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const emailLower = parsed.data.email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(teachersTable)
    .where(eq(teachersTable.email, emailLower))
    .limit(1);
  const teacher = rows[0];
  if (!teacher || !verifyPassword(parsed.data.password, teacher.passwordHash)) {
    res.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  const token = newSessionToken();
  await db.insert(sessionsTable).values({
    token,
    teacherId: teacher.id,
    expiresAt: sessionExpiry(),
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  req.teacher = teacher;
  void logEvent(req, "teacher_logged_in", {}, { surface: "app" });
  res.json({ teacher: serialiseTeacher(teacher) });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  void logEvent(req, "teacher_logged_out", {}, { surface: "app" });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", (req, res) => {
  if (!req.teacher) {
    res.json({ teacher: null });
    return;
  }
  res.json({
    teacher: serialiseTeacher(req.teacher),
    impersonator: req.impersonator ? serialiseTeacher(req.impersonator) : null,
  });
});

const onboardingSchema = z.object({
  country: z.string().max(120).optional(),
  schoolName: z.string().max(200).optional(),
  subjects: z.array(z.string().max(120)).max(20).default([]),
  yearGroups: z.array(z.string().max(40)).max(20).default([]),
});

router.post("/complete-onboarding", requireAuth, async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please complete every field" });
    return;
  }
  const [updated] = await db
    .update(teachersTable)
    .set({
      country: parsed.data.country?.trim() ?? null,
      schoolName: parsed.data.schoolName?.trim() ?? null,
      subjects: parsed.data.subjects,
      yearGroups: parsed.data.yearGroups,
      onboardedAt: new Date(),
    })
    .where(eq(teachersTable.id, req.teacher!.id))
    .returning();
  void logEvent(req, "onboarding_completed", {}, { surface: "app" });
  res.json({ teacher: serialiseTeacher(updated) });
});

const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

router.post("/reset-password", rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const rows = await db
    .select()
    .from(passwordResetsTable)
    .where(
      and(
        eq(passwordResetsTable.token, parsed.data.token),
        isNull(passwordResetsTable.usedAt),
        gt(passwordResetsTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const reset = rows[0];
  if (!reset) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }
  await db
    .update(teachersTable)
    .set({ passwordHash: hashPassword(parsed.data.password) })
    .where(eq(teachersTable.id, reset.teacherId));
  await db
    .update(passwordResetsTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetsTable.id, reset.id));
  // Invalidate all existing sessions for this teacher.
  await db.delete(sessionsTable).where(eq(sessionsTable.teacherId, reset.teacherId));
  void logEvent(req, "password_reset_completed", {}, { surface: "app" });
  res.json({ ok: true });
});

export async function mintPasswordReset(teacherId: string, adminId: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db
    .insert(passwordResetsTable)
    .values({ teacherId, token, expiresAt, issuedByAdminId: adminId });
  return { token, expiresAt };
}

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  region: z
    .string()
    .refine((v) => REGION_IDS.includes(v), { message: "Unknown region" })
    .optional(),
  country: z.string().max(120).nullable().optional(),
  schoolName: z.string().max(200).nullable().optional(),
  subjects: z.array(z.string().max(120)).max(20).optional(),
  yearGroups: z.array(z.string().max(40)).max(20).optional(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [updated] = await db
    .update(teachersTable)
    .set(parsed.data)
    .where(eq(teachersTable.id, req.teacher!.id))
    .returning();
  res.json({ teacher: serialiseTeacher(updated) });
});

export function adminEmails(): Set<string> {
  return new Set(
    (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function serialiseTeacher(t: typeof teachersTable.$inferSelect) {
  const { passwordHash: _ignored, ...rest } = t;
  return {
    ...rest,
    isAdmin: adminEmails().has(t.email.toLowerCase()),
    onboardedAt: t.onboardedAt ? t.onboardedAt.toISOString() : null,
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
    subscriptionCurrentPeriodEnd: t.subscriptionCurrentPeriodEnd ? t.subscriptionCurrentPeriodEnd.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  };
}

export default router;
