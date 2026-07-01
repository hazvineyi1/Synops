import { Router, type IRouter } from "express";
import { z } from "zod";
import { db, pilotRequestsTable } from "@workspace/paideia-db";
import { logEvent } from "../../lib/eventLog.js";
import { rateLimit } from "../../middlewares/rateLimit.js";

const router: IRouter = Router();
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));

const schema = z.object({
  source: z.string().min(1).max(60),
  schoolName: z.string().max(200).optional().nullable(),
  country: z.string().max(120).optional().nullable(),
  gradeLevels: z.string().max(60).optional().nullable(),
  organization: z.string().max(200).optional().nullable(),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(200),
  message: z.string().max(2000).optional().nullable(),
  sourcePath: z.string().max(400).optional().nullable(),
  sourceReferrer: z.string().max(400).optional().nullable(),
  sourceUtm: z.record(z.string(), z.string().max(200)).optional().nullable(),
  anonymousId: z.string().max(80).optional().nullable(),
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const [row] = await db
    .insert(pilotRequestsTable)
    .values({
      source: d.source,
      schoolName: d.schoolName?.trim() || null,
      country: d.country?.trim() || null,
      gradeLevels: d.gradeLevels?.trim() || null,
      organization: d.organization?.trim() || null,
      contactName: d.contactName.trim(),
      contactEmail: d.contactEmail.trim().toLowerCase(),
      message: d.message?.trim() || null,
      sourcePath: d.sourcePath ?? null,
      sourceReferrer: d.sourceReferrer ?? null,
      sourceUtm: d.sourceUtm ?? null,
      anonymousId: d.anonymousId ?? null,
    })
    .returning();
  void logEvent(req, "pilot_request_submitted", {
    source: d.source,
    school: d.schoolName ?? null,
    country: d.country ?? null,
    pilotRequestId: row?.id,
  }, {
    surface: "site",
    path: d.sourcePath ?? null,
    referrer: d.sourceReferrer ?? null,
    anonymousId: d.anonymousId ?? null,
  });
  res.status(201).json({ ok: true, id: row?.id });
});

export default router;
