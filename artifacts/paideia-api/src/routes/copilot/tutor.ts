import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  db,
  tutorConversationsTable,
  tutorMessagesTable,
  studentsTable,
  assignmentsTable,
  classesTable,
  worksheetsTable,
  quizzesTable,
  lessonPlansTable,
  submissionsTable,
} from "@workspace/paideia-db";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireStudent } from "../../middlewares/auth.js";
import { openai, PRIMARY_MODEL } from "../../lib/openai.js";
import { formatLearningProfileBlock, isLearningProfile, type LearningProfile } from "../../lib/prompts.js";

const router: IRouter = Router();

// Helpers to load grounding material for a student's class
async function loadClassAssignments(classId: string) {
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.classId, classId), eq(assignmentsTable.deliveryMode, "accounts")))
    .orderBy(desc(assignmentsTable.createdAt));
  return rows;
}

async function loadAssignmentDetails(assignment: typeof assignmentsTable.$inferSelect) {
  if (assignment.worksheetId) {
    const w = await db.select().from(worksheetsTable).where(eq(worksheetsTable.id, assignment.worksheetId)).limit(1);
    return w[0] ?? null;
  }
  if (assignment.quizId) {
    const q = await db.select().from(quizzesTable).where(eq(quizzesTable.id, assignment.quizId)).limit(1);
    return q[0] ?? null;
  }
  return null;
}

function summarizeResource(r: any, kind: string): string {
  if (!r) return "";
  if (kind === "worksheet") {
    const c = r.content ?? {};
    const questions = (c.questions ?? []).map((q: any) => `Q${q.number}: ${q.prompt}`).join("\n");
    return `Worksheet: ${r.title}\nTopic: ${r.topic ?? r.subject}\n${questions}`;
  }
  if (kind === "quiz") {
    const c = r.content ?? {};
    const items = (c.items ?? []).map((i: any) => `Q${i.number}: ${i.prompt}`).join("\n");
    return `Quiz: ${r.title}\nTopic: ${r.topic ?? r.subject}\n${items}`;
  }
  return JSON.stringify(r).slice(0, 500);
}

async function buildGroundingContext(
  studentId: string,
  classId: string,
  scope: string,
  scopeRefId: string | null | undefined,
): Promise<{ grounding: string; topicHint: string }> {
  const assignments = await loadClassAssignments(classId);
  let relevant = assignments;
  if (scope === "specific_assignment" && scopeRefId) {
    relevant = assignments.filter((a) => a.id === scopeRefId);
    if (relevant.length === 0) relevant = assignments;
  }

  // Also include student's past submissions for context on what they've done
  const subs = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.studentId, studentId))
    .orderBy(desc(submissionsTable.submittedAt))
    .limit(10);

  const parts: string[] = [];
  for (const a of relevant.slice(0, 5)) {
    const detail = await loadAssignmentDetails(a);
    if (detail) {
      parts.push(summarizeResource(detail, a.resourceKind));
    }
  }

  if (subs.length > 0) {
    parts.push(`\nYour recent work:\n${subs.map((s) => `- Assignment: scored ${s.autoScore}/${s.maxAutoScore}`).join("\n")}`);
  }

  const topicHint = relevant[0]?.title ?? "general class material";
  return { grounding: parts.join("\n\n"), topicHint };
}

function buildSystemPrompt(
  grounding: string,
  socraticMode: boolean,
  learningProfile?: LearningProfile | null,
): string {
  const socraticBlock = socraticMode
    ? `
SOCRATIC MODE IS ACTIVE.

Adjust your approach:
- Default to ASKING rather than telling. When the learner asks a question or makes a claim, respond with a probing question that surfaces their current understanding before you explain.
- Use the classic Socratic moves: ask for definitions ("What do you mean by X?"), ask for examples ("Can you give me an instance of that?"), probe assumptions ("What are you taking for granted?"), test consequences ("If that's true, what follows?"), examine alternatives ("Is there another way to see this?").
- Do not interrogate. Aim for one focused question per turn, not five.
- When the learner is genuinely stuck after two or three turns, switch to teaching mode and explain - but flag the shift: "Let me explain this part directly."
- If the learner asks for direct information ("just tell me the rule"), respect that and answer directly for that turn.
- Your role is to be a thinking partner, not a quiz-master.`
    : "";

  const learningBlock = formatLearningProfileBlock(learningProfile ?? undefined, "tutor");

  return `You are Synops, a patient and encouraging study tutor for a student in an African-curriculum classroom. Your goals, in order:

1. Be ACCURATE. If you don't know something or aren't sure, say so. Do not invent facts, rules, or statistics.

2. Be GROUNDED. The student's class material is below. When their question relates to that material, anchor your answer in it. When their question goes beyond the material, you can answer from general knowledge, but make this transparent.

3. Be PEDAGOGICAL, not just answering. Default to explaining the WHY, the structure, the connections. When the student is stuck, walk them through reasoning rather than just delivering the conclusion.

4. Be CONCISE. Do not produce wall-of-text answers when a paragraph will do. Long explanations only when complexity demands it.

5. Use culturally diverse examples, defaulting to African contexts where relevant. Avoid Euro-centric defaults.

STUDENT'S CLASS MATERIAL:
${grounding}
${socraticBlock}
${learningBlock}`;
}

// List conversations
router.get("/conversations", requireStudent, async (req, res) => {
  const rows = await db
    .select()
    .from(tutorConversationsTable)
    .where(eq(tutorConversationsTable.studentId, req.student!.id))
    .orderBy(desc(tutorConversationsTable.updatedAt));
  res.json({ conversations: rows });
});

// Create conversation
const createSchema = z.object({
  title: z.string().min(1).max(200),
  scope: z.enum(["all_material", "specific_assignment"]).default("all_material"),
  scopeRefId: z.string().uuid().optional(),
});

router.post("/conversations", requireStudent, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const student = req.student!;
  const [conv] = await db
    .insert(tutorConversationsTable)
    .values({
      studentId: student.id,
      classId: student.classId,
      title: parsed.data.title,
      scope: parsed.data.scope,
      scopeRefId: parsed.data.scopeRefId ?? null,
    })
    .returning();
  res.json({ conversation: conv });
});

// Get conversation with messages
router.get("/conversations/:id", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const convRows = await db
    .select()
    .from(tutorConversationsTable)
    .where(and(eq(tutorConversationsTable.id, id), eq(tutorConversationsTable.studentId, req.student!.id)))
    .limit(1);
  if (!convRows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const msgRows = await db
    .select()
    .from(tutorMessagesTable)
    .where(eq(tutorMessagesTable.conversationId, id))
    .orderBy(tutorMessagesTable.id);
  res.json({ conversation: convRows[0], messages: msgRows });
});

// Send message and get AI response
const messageSchema = z.object({
  content: z.string().min(1).max(4000),
});

router.post("/conversations/:id/messages", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const convRows = await db
    .select()
    .from(tutorConversationsTable)
    .where(and(eq(tutorConversationsTable.id, id), eq(tutorConversationsTable.studentId, req.student!.id)))
    .limit(1);
  if (!convRows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const conv = convRows[0];

  // Load prior messages
  const priorMessages = await db
    .select()
    .from(tutorMessagesTable)
    .where(eq(tutorMessagesTable.conversationId, id))
    .orderBy(tutorMessagesTable.id)
    .limit(20);

  // Load student learning profile
  const studentRows = await db
    .select()
    .from(studentsTable)
    .where(eq(studentsTable.id, req.student!.id))
    .limit(1);
  const rawLearning = studentRows[0]?.learningStyle;
  const learningProfile = isLearningProfile(rawLearning) ? rawLearning : null;

  // Build grounding context
  const { grounding } = await buildGroundingContext(req.student!.id, conv.classId, conv.scope, conv.scopeRefId);

  const systemPrompt = buildSystemPrompt(grounding, conv.socraticMode, learningProfile);

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...priorMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: parsed.data.content },
  ];

  // Save user message first
  const [userMsg] = await db
    .insert(tutorMessagesTable)
    .values({
      conversationId: id,
      role: "user",
      content: parsed.data.content,
    })
    .returning();

  try {
    const response = await openai.chat.completions.create({
      model: PRIMARY_MODEL,
      max_completion_tokens: 4096,
      messages,
    });

    const text = response.choices[0]?.message?.content ?? "I'm not sure how to answer that right now. Could you rephrase?";

    // Extract citations [Concept: TITLE] and [Source: DOMAIN]
    const citations: Array<{ type: "concept" | "source"; title: string; url?: string }> = [];
    const conceptMatches = text.matchAll(/\[Concept:\s*([^\]]+)\]/g);
    for (const m of conceptMatches) {
      citations.push({ type: "concept", title: m[1]!.trim() });
    }
    const sourceMatches = text.matchAll(/\[Source:\s*([^\]]+)\]/g);
    for (const m of sourceMatches) {
      citations.push({ type: "source", title: m[1]!.trim() });
    }

    const [assistantMsg] = await db
      .insert(tutorMessagesTable)
      .values({
        conversationId: id,
        role: "assistant",
        content: text,
        citations: citations.length > 0 ? citations : null,
      })
      .returning();

    // Update conversation timestamp
    await db
      .update(tutorConversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(tutorConversationsTable.id, id));

    res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    req.log?.error({ err }, "tutor AI call failed");
    res.status(500).json({ error: "The tutor is having trouble right now. Please try again in a moment." });
  }
});

// Update conversation (rename, toggle socratic)
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  socraticMode: z.boolean().optional(),
});

router.patch("/conversations/:id", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.socraticMode !== undefined) updateData.socraticMode = parsed.data.socraticMode;
  if (Object.keys(updateData).length === 0) {
    res.json({ ok: true });
    return;
  }
  const result = await db
    .update(tutorConversationsTable)
    .set(updateData)
    .where(and(eq(tutorConversationsTable.id, id), eq(tutorConversationsTable.studentId, req.student!.id)))
    .returning();
  if (!result[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ conversation: result[0] });
});

// Delete conversation
router.delete("/conversations/:id", requireStudent, async (req, res) => {
  const id = req.params["id"] as string;
  await db
    .delete(tutorConversationsTable)
    .where(and(eq(tutorConversationsTable.id, id), eq(tutorConversationsTable.studentId, req.student!.id)));
  res.json({ ok: true });
});

// Get available assignments for scope selection
router.get("/scope-options", requireStudent, async (req, res) => {
  const rows = await db
    .select()
    .from(assignmentsTable)
    .where(and(eq(assignmentsTable.classId, req.student!.classId), eq(assignmentsTable.deliveryMode, "accounts")))
    .orderBy(desc(assignmentsTable.createdAt));
  res.json({ assignments: rows.map((a) => ({ id: a.id, title: a.title, resourceKind: a.resourceKind })) });
});

export default router;
