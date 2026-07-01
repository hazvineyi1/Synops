import {
  db,
  submissionsTable,
  assignmentsTable,
  worksheetsTable,
  quizzesTable,
} from "@workspace/paideia-db";
import { and, eq, inArray } from "drizzle-orm";
import { generateJSON } from "./openai.js";

interface QuizItem {
  number: number;
  prompt: string;
  type: "multiple_choice" | "short_answer" | "true_false";
  options: string[] | null;
  correctAnswer: string;
  skillAssessed?: string;
}

interface WorksheetQuestion {
  number: number;
  prompt: string;
  type: "short" | "multiple_choice" | "long" | "calculation";
  options: string[] | null;
  answer: string;
  workingOrRubric?: string;
}

interface FeedbackItem {
  number: number;
  given: string;
  correct: string | null;
  state: "correct" | "incorrect" | "partial" | "needs_review";
  skill?: string;
  aiComment?: string;
  aiScore?: number;
  aiMax?: number;
}

interface AiSummary {
  overall: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
}

interface AiResponse {
  items: Array<{
    number: number;
    score: number;
    max: number;
    state: "correct" | "incorrect" | "partial";
    comment: string;
  }>;
  summary: AiSummary;
}

const SYSTEM_PROMPT = `You are a supportive secondary-school teacher in an African classroom marking a student's work.

You will receive a worksheet or quiz, the marking key, and one student's answers. Your job:
1. Score each question fairly. For free-response items, award partial credit when the reasoning is sound. For multiple choice / true-false, you will see the result of automated marking; copy the score and add a brief comment that helps the student learn.
2. Comment in plain, encouraging language a learner can understand. One or two short sentences per question. Address the student directly ("you").
3. Produce a short overall summary for the teacher: strengths, gaps, and two or three concrete next-step recommendations.

Rules:
- Never invent facts. If you are unsure whether an answer is correct, mark it partial and explain.
- No em dashes anywhere. Use full stops and short sentences.
- No outbound contact, no email addresses, no links.
- Keep comments brief and respectful. Avoid sarcasm.
- For the teacher summary, be specific (cite question numbers or skills) and actionable.

Return strict JSON matching this TypeScript type:
{
  items: Array<{ number: number; score: number; max: number; state: "correct" | "incorrect" | "partial"; comment: string }>;
  summary: { overall: string; strengths: string[]; gaps: string[]; recommendations: string[] };
}`;

function buildUserPrompt(
  resourceTitle: string,
  kind: "quiz" | "worksheet",
  questions: Array<{
    number: number;
    prompt: string;
    type: string;
    correct: string;
    rubric?: string;
    skill?: string;
    given: string;
    autoState?: "correct" | "incorrect" | null;
  }>,
  studentName: string,
): string {
  const lines: string[] = [];
  lines.push(`Resource type: ${kind}`);
  lines.push(`Resource title: ${resourceTitle}`);
  lines.push(`Student: ${studentName}`);
  lines.push("");
  lines.push("Questions, marking key, and the student's answers:");
  for (const q of questions) {
    lines.push("");
    lines.push(`Q${q.number} (${q.type}${q.skill ? `, skill: ${q.skill}` : ""})`);
    lines.push(`Prompt: ${q.prompt}`);
    lines.push(`Marking key: ${q.correct || "(none)"}`);
    if (q.rubric) lines.push(`Rubric: ${q.rubric}`);
    lines.push(`Student answered: ${q.given || "(blank)"}`);
    if (q.autoState) {
      lines.push(`Automated mark: ${q.autoState} (already scored, copy the score and add a learning comment)`);
    }
  }
  lines.push("");
  lines.push("Return JSON with one items[] entry per question above, plus the summary.");
  return lines.join("\n");
}

export async function gradeSubmissionWithAi(submissionId: string): Promise<void> {
  // Atomic claim: only one worker can transition pending|failed -> grading.
  // If another worker already claimed, or the row is already graded, exit.
  const claimed = await db
    .update(submissionsTable)
    .set({ gradingStatus: "grading" })
    .where(
      and(
        eq(submissionsTable.id, submissionId),
        inArray(submissionsTable.gradingStatus, ["pending", "failed"]),
      ),
    )
    .returning({ id: submissionsTable.id });
  if (claimed.length === 0) return;

  const [submission] = await db
    .select()
    .from(submissionsTable)
    .where(eq(submissionsTable.id, submissionId))
    .limit(1);
  if (!submission) return;

  try {
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, submission.assignmentId))
      .limit(1);
    if (!assignment) throw new Error("Assignment missing");

    const resource = await loadResource(assignment);
    if (!resource) throw new Error("Resource missing");

    const existingFeedback = (Array.isArray(submission.feedback) ? submission.feedback : []) as FeedbackItem[];
    const feedbackByNum = new Map<number, FeedbackItem>(existingFeedback.map((f) => [f.number, f]));

    const questions: Array<{
      number: number;
      prompt: string;
      type: string;
      correct: string;
      rubric?: string;
      skill?: string;
      given: string;
      autoState?: "correct" | "incorrect" | null;
    }> = [];

    if (assignment.resourceKind === "quiz") {
      const items = ((resource.content as Record<string, unknown>)["items"] as QuizItem[] | undefined) ?? [];
      for (const q of items) {
        const given = (submission.answers[String(q.number)] ?? "").trim();
        const fb = feedbackByNum.get(q.number);
        const autoState =
          q.type === "multiple_choice" || q.type === "true_false"
            ? (fb?.state === "correct" ? "correct" : "incorrect")
            : null;
        const entry: typeof questions[number] = {
          number: q.number,
          prompt: q.prompt,
          type: q.type,
          correct: q.correctAnswer,
          given,
        };
        if (q.skillAssessed) entry.skill = q.skillAssessed;
        if (autoState) entry.autoState = autoState;
        questions.push(entry);
      }
    } else {
      const items = ((resource.content as Record<string, unknown>)["questions"] as WorksheetQuestion[] | undefined) ?? [];
      for (const q of items) {
        const given = (submission.answers[String(q.number)] ?? "").trim();
        const fb = feedbackByNum.get(q.number);
        const autoState =
          q.type === "multiple_choice"
            ? (fb?.state === "correct" ? "correct" : "incorrect")
            : null;
        const entry: typeof questions[number] = {
          number: q.number,
          prompt: q.prompt,
          type: q.type,
          correct: q.answer,
          given,
        };
        if (q.workingOrRubric) entry.rubric = q.workingOrRubric;
        if (autoState) entry.autoState = autoState;
        questions.push(entry);
      }
    }

    const userPrompt = buildUserPrompt(
      (resource as { title: string }).title,
      assignment.resourceKind === "quiz" ? "quiz" : "worksheet",
      questions,
      submission.displayName,
    );

    const ai = await generateJSON<AiResponse>(SYSTEM_PROMPT, userPrompt, {
      teacherId: assignment.teacherId,
      kind: "grade_submission",
    });

    const aiByNum = new Map(ai.items.map((i) => [i.number, i]));
    let totalScore = 0;
    let totalMax = 0;
    const mergedFeedback: FeedbackItem[] = questions.map((q) => {
      const original = feedbackByNum.get(q.number);
      const aiItem = aiByNum.get(q.number);
      // Objective items (MCQ / true_false) keep the deterministic rule-based mark.
      // AI may only contribute commentary. Free-response items use AI scoring.
      const isObjective = q.autoState != null;
      let max: number;
      let score: number;
      let state: FeedbackItem["state"];
      if (isObjective) {
        max = 1;
        score = q.autoState === "correct" ? 1 : 0;
        state = q.autoState === "correct" ? "correct" : "incorrect";
      } else if (aiItem) {
        max = Math.max(1, Math.round(aiItem.max));
        score = Math.max(0, Math.min(max, Math.round(aiItem.score)));
        state = aiItem.state;
      } else {
        max = 1;
        score = 0;
        state = original?.state ?? "needs_review";
      }
      totalScore += score;
      totalMax += max;
      const merged: FeedbackItem = {
        number: q.number,
        given: q.given,
        correct: q.correct || null,
        state,
        aiScore: score,
        aiMax: max,
      };
      if (q.skill) merged.skill = q.skill;
      if (aiItem?.comment) merged.aiComment = aiItem.comment;
      return merged;
    });

    await db
      .update(submissionsTable)
      .set({
        feedback: mergedFeedback,
        autoScore: totalScore,
        maxAutoScore: totalMax,
        needsReviewCount: 0,
        aiSummary: ai.summary,
        gradingStatus: "graded",
        gradedAt: new Date(),
      })
      .where(eq(submissionsTable.id, submissionId));
  } catch (err) {
    console.error("[aiGrading] failed", submissionId, err);
    await db
      .update(submissionsTable)
      .set({ gradingStatus: "failed" })
      .where(eq(submissionsTable.id, submissionId));
  }
}

async function loadResource(a: {
  resourceKind: string;
  worksheetId: string | null;
  quizId: string | null;
}): Promise<{ title: string; content: unknown } | null> {
  if (a.resourceKind === "worksheet" && a.worksheetId) {
    const r = await db.select().from(worksheetsTable).where(eq(worksheetsTable.id, a.worksheetId)).limit(1);
    return r[0] ?? null;
  }
  if (a.resourceKind === "quiz" && a.quizId) {
    const r = await db.select().from(quizzesTable).where(eq(quizzesTable.id, a.quizId)).limit(1);
    return r[0] ?? null;
  }
  return null;
}
