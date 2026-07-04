import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import { db, contactSubmissionsTable, newsletterSignupsTable } from "@workspace/compass-db";
import { sendContactNotification } from "../lib/email";

const router = Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

const AREAS = [
  "Healthcare & Operations",
  "Learning, EdTech & AI",
  "Platforms & SaaS",
  "Other",
] as const;

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  organization: z.string().max(200).optional(),
  email: z.string().email().max(255),
  phone: z.string().max(50).optional(),
  areaOfInterest: z.enum(AREAS),
  message: z.string().min(1).max(5000),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0).optional().or(z.literal("")),
});

const newsletterSchema = z.object({
  email: z.string().email().max(255),
  website: z.string().max(0).optional().or(z.literal("")),
});

router.post("/contact", formLimiter, async (req, res): Promise<void> => {
  // Honeypot: silently accept bots without persisting.
  if (typeof req.body?.website === "string" && req.body.website.length > 0) {
    res.status(201).json({ ok: true });
    return;
  }

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const [submission] = await db
    .insert(contactSubmissionsTable)
    .values({
      name: parsed.data.name.trim(),
      organization: parsed.data.organization?.trim() || null,
      email: parsed.data.email.toLowerCase().trim(),
      phone: parsed.data.phone?.trim() || null,
      areaOfInterest: parsed.data.areaOfInterest,
      message: parsed.data.message.trim(),
      source: "contact",
    })
    .returning();

  await sendContactNotification(req.log, {
    name: submission.name,
    email: submission.email,
    organization: submission.organization,
    phone: submission.phone,
    areaOfInterest: submission.areaOfInterest,
    message: submission.message,
    source: submission.source,
  });

  res.status(201).json({ ok: true, id: submission.id });
});

router.post("/newsletter", formLimiter, async (req, res): Promise<void> => {
  if (typeof req.body?.website === "string" && req.body.website.length > 0) {
    res.status(201).json({ ok: true });
    return;
  }

  const parsed = newsletterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  await db
    .insert(newsletterSignupsTable)
    .values({ email: parsed.data.email.toLowerCase().trim() })
    .onConflictDoNothing();

  res.status(201).json({ ok: true });
});

export default router;
