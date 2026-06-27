import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { db } from "@workspace/db";
import { checkpointsTable, conceptsTable, profilesTable, coachMessagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createMessage, MODEL, getPersonalityPrompt, checkRateLimit, FORMATTING_RULES } from "../lib/anthropic";
import { sm2Update } from "../lib/sm2";
import { emitWebhook } from "../lib/apiAuth";

const router = Router();

// GET /checkpoints
router.get("/checkpoints", requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const conceptId = req.query.conceptId ? Number(req.query.conceptId) : undefined;

  const rows = await db
    .select()
    .from(checkpointsTable)
    .where(
      conceptId
        ? and(eq(checkpointsTable.userId, userId), eq(checkpointsTable.conceptId, conceptId))
        : eq(checkpointsTable.userId, userId)
    )
    .orderBy(desc(checkpointsTable.id))
    .limit(limit);

  res.json(rows);
});

// POST /checkpoints/grade — grade a checkpoint and update SM-2
router.post("/checkpoints/grade", requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  const { conceptId, prompt, userAnswer, confidenceBefore } = req.body as {
    conceptId: number;
    prompt: string;
    userAnswer: string;
    confidenceBefore?: number | null;
  };

  // Validate/bound input before spending a rate unit or tokens.
  if (
    !conceptId ||
    typeof prompt !== "string" ||
    !prompt.trim() ||
    typeof userAnswer !== "string" ||
    !userAnswer.trim()
  ) {
    res.status(400).json({ error: "conceptId, prompt, and a non-empty answer are required." });
    return;
  }
  const boundedPrompt = prompt.trim().slice(0, 2000);
  const boundedAnswer = userAnswer.trim().slice(0, 4000);

  if (!checkRateLimit(userId, !!(req as any).entitlement?.isPro)) {
    res.status(429).json({ error: "Daily AI call limit reached" });
    return;
  }

  // Get concept for grading context
  const concepts = await db
    .select()
    .from(conceptsTable)
    .where(and(eq(conceptsTable.userId, userId), eq(conceptsTable.id, conceptId)))
    .limit(1);

  if (concepts.length === 0) {
    res.status(404).json({ error: "Concept not found" });
    return;
  }

  const concept = concepts[0];
  const profiles = await db.select().from(profilesTable).where(eq(profilesTable.userId, userId)).limit(1);
  const personality = profiles[0]?.coachPersonality ?? "warm";
  const personalityPrompt = getPersonalityPrompt(personality);

  // AI grading
  const gradingResponse = await createMessage({
    model: MODEL,
    max_tokens: 600,
    system: `${personalityPrompt}

You are grading a learner's answer to a study checkpoint. Grade on 0-3 scale:
0 = Wrong or completely off track
1 = Partially correct but missing key elements  
2 = Mostly correct with minor gaps
3 = Fully correct and well-articulated

Output a JSON grade line then your feedback:
GRADE: {"score":N}
Then 2-3 sentences of feedback in your coaching voice. Reference what they got right/wrong specifically. If they were confident (confidenceBefore=2-3) but wrong, address that gap. If they underestimated and got it right, acknowledge that.

${FORMATTING_RULES}`,
    messages: [
      {
        role: "user",
        content: `Concept: ${concept.title}\nConcept definition: ${concept.content}\n\nQuestion asked: ${boundedPrompt}\n\nLearner's answer: ${boundedAnswer}\n\nConfidence before seeing answer: ${confidenceBefore ?? "not provided"}/3`,
      },
    ],
  }, { label: "grade", userId });

  const gradeText = gradingResponse.content[0]?.type === "text" ? gradingResponse.content[0].text : "";
  const gradeMatch = gradeText.match(/GRADE:\s*\{"score":(\d)\}/);
  const score = gradeMatch ? Math.min(3, Math.max(0, Number(gradeMatch[1]))) : 1;
  const feedback = gradeText.replace(/GRADE:\s*\{[^\n]+\}\n?/, "").trim();

  // Save checkpoint
  const today = new Date().toISOString().slice(0, 10);
  const [checkpoint] = await db
    .insert(checkpointsTable)
    .values({
      userId,
      conceptId,
      date: today,
      prompt: boundedPrompt,
      userAnswer: boundedAnswer,
      coachGrade: score,
      coachFeedback: feedback,
      confidenceBefore: confidenceBefore ?? null,
    })
    .returning();

  // Update SM-2 on concept
  const updated = sm2Update(concept.mastery, concept.ef, concept.interval, concept.reps, score);
  await db
    .update(conceptsTable)
    .set({
      mastery: updated.mastery,
      ef: updated.ef,
      interval: updated.interval,
      reps: updated.reps,
      dueDate: updated.dueDate,
    })
    .where(eq(conceptsTable.id, conceptId));

  // Bring the graded turn into the conversation so the loop stays in the chat:
  // the learner's answer, then the coach's feedback with a way to continue.
  const feedbackText = feedback || "Got your answer. Let's keep going.";
  await db.insert(coachMessagesTable).values({ userId, role: "user", content: boundedAnswer });
  await db.insert(coachMessagesTable).values({
    userId,
    role: "coach",
    content: feedbackText,
    richBlocks: { graded: { score, conceptId }, quick_replies: ["Continue", "Go deeper on this"] },
  });

  // Notify any subscribed developer webhooks (fire-and-forget).
  void emitWebhook(userId, "checkpoint.graded", {
    conceptId,
    concept: concept.title,
    score,
    confidenceBefore: confidenceBefore ?? null,
  });

  res.json(checkpoint);
});

export default router;
