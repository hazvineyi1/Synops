import { Router, type IRouter } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import {
  db,
  studyUsersTable,
  studyLearnerProfilesTable,
  studyMaterialsTable,
  studyConceptsTable,
  studyLearningPathsTable,
  studyLearningPathStepsTable,
  studyTutorConversationsTable,
  studyTutorMessagesTable,
} from "@workspace/paideia-db";
import { eq, and, isNull } from "drizzle-orm";
import { requireApiKey } from "../middlewares/apiKey.js";
import { hashPassword } from "../lib/studyAuth.js";
import { mintEntryToken } from "../lib/learnerEntry.js";
import { coachBaseUrl } from "../lib/email.js";

/**
 * The public, API-key-authenticated integration surface (guarded by requireApiKey).
 * Unlike the learner-facing /api/study routes, these ACT ON A PUSHED LEARNER supplied
 * in the body — the API key is the integration's credential, not the learner's identity.
 */
const router: IRouter = Router();

// POST /api/v1/catch-up
// An external LMS (Praxis) pushes a learner who has fallen behind: their content, the
// identified gap, and a plan rationale. The Coach provisions (or finds) the learner,
// ingests the content as study concepts, builds and activates a ready catch-up learning
// path targeting the gap, seeds an opening coach message, and returns a magic-link
// `coachUrl` the learner opens to land straight in the Coach on that plan.
router.post("/catch-up", requireApiKey, async (req, res) => {
  const body = req.body ?? {};
  const email = typeof body.learnerEmail === "string" ? body.learnerEmail.trim().toLowerCase() : "";
  const learnerName = typeof body.learnerName === "string" ? body.learnerName.trim() : "";
  const examName = typeof body.examName === "string" ? body.examName.trim() : "";
  const gap = typeof body.gap === "string" ? body.gap.trim() : "";
  const rationale = typeof body.planRationale === "string" ? body.planRationale.trim() : "";
  const rawContent: Array<{ title?: string; body?: string }> = Array.isArray(body.content) ? body.content : [];

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "learnerEmail (a valid email) is required." });
    return;
  }
  const concepts = rawContent
    .map((c) => ({ title: (c?.title ?? "").toString().trim(), body: (c?.body ?? "").toString().trim() }))
    .filter((c) => c.title && c.body)
    .slice(0, 15);
  if (concepts.length === 0) {
    res.status(400).json({ error: "content[] with {title, body} entries is required." });
    return;
  }

  try {
    // 1) Find or create the learner. Magic-link-only accounts still need a (random,
    //    unusable) password hash to satisfy the NOT NULL column.
    const existing = await db
      .select({ id: studyUsersTable.id })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.email, email))
      .limit(1);
    let learnerId: string;
    const created = !existing[0];
    if (existing[0]) {
      learnerId = existing[0].id;
    } else {
      const [user] = await db
        .insert(studyUsersTable)
        .values({
          email,
          passwordHash: hashPassword(randomBytes(24).toString("base64url")),
          name: learnerName || email.split("@")[0],
        })
        .returning({ id: studyUsersTable.id });
      learnerId = user.id;
    }

    // 2) Ensure a learner profile whose 5 diagnostic signals are all set, so the Coach
    //    treats onboarding as complete and lands the learner on /coach (not /intake).
    const profileExisting = await db
      .select({ id: studyLearnerProfilesTable.id })
      .from(studyLearnerProfilesTable)
      .where(eq(studyLearnerProfilesTable.userId, learnerId))
      .limit(1);
    const diagnosticFields = {
      goals: [gap || examName || "Get back on track"],
      examTarget: examName || gap || "Catch-up",
      weakAreas: gap ? [gap] : [],
      hoursPerWeek: 5,
      baselineLevel: "foundations",
      calibrationSelfRating: "mid",
      failureMode: "scattered",
    };
    if (profileExisting[0]) {
      // Only fill the onboarding signals when the learner never completed a diagnostic
      // (examTarget IS NULL); never clobber a real, self-directed learner's profile.
      await db
        .update(studyLearnerProfilesTable)
        .set(diagnosticFields)
        .where(
          and(
            eq(studyLearnerProfilesTable.userId, learnerId),
            isNull(studyLearnerProfilesTable.examTarget),
          ),
        )
        .catch(() => undefined);
    } else {
      await db.insert(studyLearnerProfilesTable).values({ userId: learnerId, ...diagnosticFields });
    }

    // 3) Ingest the pushed content as one material + a concept per item.
    const [material] = await db
      .insert(studyMaterialsTable)
      .values({
        userId: learnerId,
        title: gap ? `Catch up: ${gap}`.slice(0, 200) : examName || "Catch-up material",
        sourceType: "paste",
        contentText: concepts.map((c) => `# ${c.title}\n${c.body}`).join("\n\n").slice(0, 100_000),
      })
      .returning({ id: studyMaterialsTable.id });

    const conceptRows = await db
      .insert(studyConceptsTable)
      .values(concepts.map((c) => ({ userId: learnerId, materialId: material.id, title: c.title, explanation: c.body })))
      .returning({ id: studyConceptsTable.id, title: studyConceptsTable.title });

    // 4) Build + activate a catch-up learning path. Archive any current active path so
    //    the dashboard shows exactly one, then create ordered steps (first available).
    await db
      .update(studyLearningPathsTable)
      .set({ status: "archived" })
      .where(and(eq(studyLearningPathsTable.userId, learnerId), eq(studyLearningPathsTable.status, "active")));

    const STEPS: Array<{ type: string; label: string; minutes: number }> = [
      { type: "read_material", label: "Review", minutes: 10 },
      { type: "practice_questions", label: "Practice", minutes: 10 },
      { type: "mastery_check", label: "Mastery check", minutes: 5 },
    ];
    const totalMinutes = conceptRows.length * STEPS.reduce((s, x) => s + x.minutes, 0);
    const [path] = await db
      .insert(studyLearningPathsTable)
      .values({
        userId: learnerId,
        title: gap ? `Catch up: ${gap}`.slice(0, 200) : "Catch-up plan",
        description: (rationale || `A focused plan to rebuild ${gap || "the gap"}, one step at a time.`).slice(0, 1000),
        goal: (gap || examName || "Get back on track").slice(0, 500),
        status: "active",
        nodeSequence: [],
        totalEstimatedMinutes: totalMinutes,
        completedMinutes: 0,
      })
      .returning({ id: studyLearningPathsTable.id });

    type StepRow = typeof studyLearningPathStepsTable.$inferInsert;
    const stepRows: StepRow[] = [];
    let order = 1;
    for (let ci = 0; ci < conceptRows.length; ci++) {
      const c = conceptRows[ci];
      let prevId: string | undefined;
      for (let si = 0; si < STEPS.length; si++) {
        const tpl = STEPS[si];
        const id = randomUUID();
        stepRows.push({
          id,
          userId: learnerId,
          pathId: path.id,
          nodeId: null,
          conceptId: c.id,
          order: order++,
          stepType: tpl.type,
          title: `${tpl.label}: ${c.title}`,
          description: `${tpl.label} for "${c.title}"`,
          estimatedMinutes: tpl.minutes,
          status: ci === 0 && si === 0 ? "available" : "locked",
          contentRef: material.id,
          prerequisites: prevId ? [prevId] : [],
          masteryScore: null,
        });
        prevId = id;
      }
    }
    for (const r of stepRows) await db.insert(studyLearningPathStepsTable).values(r);

    // 5) Seed a coach conversation that leads with a diagnostic opener, so remediation
    //    starts from where the learner actually is rather than just presenting a plan.
    const first = conceptRows[0]?.title ?? gap ?? "this";
    const opener =
      `Let's rebuild ${gap || first} together, one step at a time. ` +
      `Before we start, tell me in a sentence or two: what about ${gap ? gap : `"${first}"`} trips you up most right now? ` +
      `There's no wrong answer, it just tells me where to begin.`;
    const [conversation] = await db
      .insert(studyTutorConversationsTable)
      .values({
        userId: learnerId,
        title: gap ? `Catch up: ${gap}`.slice(0, 200) : "Catch-up with your coach",
        socraticMode: true,
      })
      .returning({ id: studyTutorConversationsTable.id });
    await db.insert(studyTutorMessagesTable).values({
      conversationId: conversation.id,
      role: "assistant",
      content: opener,
    });

    // 6) A signed magic link so the pushed learner can open the Coach with no password.
    const token = mintEntryToken(learnerId);
    const coachUrl = `${coachBaseUrl()}/enter?token=${token}`;

    res.status(201).json({
      ok: true,
      learnerEmail: email,
      learnerId,
      created,
      conceptsAdded: conceptRows.length,
      planReady: true,
      conversationId: conversation.id,
      coachUrl,
    });
  } catch (err: unknown) {
    req.log?.error({ err }, "catch-up provisioning failed");
    res.status(500).json({ error: "Could not set up the catch-up plan." });
  }
});

export default router;
