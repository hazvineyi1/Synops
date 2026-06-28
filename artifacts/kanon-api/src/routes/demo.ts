import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod/v4";
import {
  db,
  demoSessionsTable,
  curriculumDemoSessionsTable,
  contactSubmissionsTable,
} from "@workspace/kanon-db";
import {
  DEMO_LEVELS,
  DEMO_LEVEL_LABELS,
  bankForLevel,
  findItem,
  type DemoLevel,
} from "../lib/demoBank";
import { sendContactNotification } from "../lib/email";

const router = Router();

const sessionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

// Opt-in lead capture is a contact-style write, so it gets the tighter limit.
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

const levelSchema = z.enum(["elementary", "secondary", "higher"]);

const answerSchema = z.object({
  itemId: z.string().min(1).max(40),
  optionIndex: z.number().int().min(0).max(10),
});

const sessionSchema = z.object({
  level: levelSchema,
  itemsAttempted: z.number().int().min(0).max(100),
  correctCount: z.number().int().min(0).max(100),
  masteryEstimate: z.number().int().min(0).max(100),
  finalRung: z.string().max(60).optional(),
  path: z
    .array(
      z.object({
        itemId: z.string().max(40),
        difficulty: z.number().int().min(1).max(5),
        correct: z.boolean(),
      }),
    )
    .max(100),
});

const curriculumSessionSchema = z.object({
  courseTitle: z.string().max(200).optional(),
  gradeBand: z.string().max(60).optional(),
  objectiveCount: z.number().int().min(0).max(100),
  assessmentCount: z.number().int().min(0).max(100),
  qaScore: z.number().int().min(0).max(100),
  stageReached: z.enum(["qa", "handoff"]),
});

const demoLeadSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(255),
  organization: z.string().max(200).optional(),
  demo: z.enum(["curriculum", "reading"]),
  summary: z.string().max(2000).optional(),
});

// Demo leads land in the same inbox as contact-form leads. Map each demo to a
// sensible area of interest and a human label for the synthesized message.
const DEMO_AREA: Record<"curriculum" | "reading", string> = {
  curriculum: "Platforms & SaaS",
  reading: "Learning, EdTech & AI",
};
const DEMO_LABEL: Record<"curriculum" | "reading", string> = {
  curriculum: "Curriculum Builder demo",
  reading: "Adaptive Reading and Reasoning demo",
};

// List available reading levels.
router.get("/demo/levels", (_req, res): void => {
  res.json(
    DEMO_LEVELS.map((level) => ({ value: level, label: DEMO_LEVEL_LABELS[level] })),
  );
});

// Return the item bank for a level WITHOUT the answer keys.
router.get("/demo/bank", (req, res): void => {
  const parsed = levelSchema.safeParse(req.query.level);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid or missing level" });
    return;
  }
  const items = bankForLevel(parsed.data as DemoLevel).map((item) => ({
    id: item.id,
    difficulty: item.difficulty,
    skill: item.skill,
    passage: item.passage,
    question: item.question,
    options: item.options,
  }));
  res.json({ level: parsed.data, items });
});

// Grade a single answer server-side (answer keys never leave the server).
router.post("/demo/answer", (req, res): void => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const item = findItem(parsed.data.itemId);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const correct = parsed.data.optionIndex === item.correctIndex;
  res.json({
    correct,
    correctIndex: item.correctIndex,
    hint: correct ? null : item.hint,
  });
});

// Persist an anonymous completed run.
router.post("/demo/sessions", sessionLimiter, async (req, res): Promise<void> => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [row] = await db
    .insert(demoSessionsTable)
    .values({
      level: parsed.data.level,
      itemsAttempted: parsed.data.itemsAttempted,
      correctCount: parsed.data.correctCount,
      masteryEstimate: parsed.data.masteryEstimate,
      finalRung: parsed.data.finalRung ?? null,
      path: parsed.data.path,
    })
    .returning();
  res.status(201).json({ ok: true, id: row.id });
});

// Persist an anonymous curriculum builder demo run for usage counting.
router.post(
  "/demo/curriculum-sessions",
  sessionLimiter,
  async (req, res): Promise<void> => {
    const parsed = curriculumSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const [row] = await db
      .insert(curriculumDemoSessionsTable)
      .values({
        courseTitle: parsed.data.courseTitle?.trim() || null,
        gradeBand: parsed.data.gradeBand?.trim() || null,
        objectiveCount: parsed.data.objectiveCount,
        assessmentCount: parsed.data.assessmentCount,
        qaScore: parsed.data.qaScore,
        stageReached: parsed.data.stageReached,
      })
      .returning();
    res.status(201).json({ ok: true, id: row.id });
  },
);

// Opt-in lead capture from either demo. Persisted alongside contact-form leads
// and best-effort emailed to the team; the email never blocks the response.
router.post("/demo/leads", leadLimiter, async (req, res): Promise<void> => {
  // Honeypot: a populated hidden field means a bot, so accept silently.
  if (typeof req.body?.website === "string" && req.body.website.length > 0) {
    res.status(201).json({ ok: true });
    return;
  }

  const parsed = demoLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const label = DEMO_LABEL[parsed.data.demo];
  const summary = parsed.data.summary?.trim();
  const message = summary
    ? `Lead from the ${label}.\n\n${summary}`
    : `Lead from the ${label}.`;

  const [submission] = await db
    .insert(contactSubmissionsTable)
    .values({
      name: parsed.data.name.trim(),
      organization: parsed.data.organization?.trim() || null,
      email: parsed.data.email.toLowerCase().trim(),
      phone: null,
      areaOfInterest: DEMO_AREA[parsed.data.demo],
      message,
      source: `demo-${parsed.data.demo}`,
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

export default router;
