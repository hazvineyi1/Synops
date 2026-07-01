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
}

export interface GradedResult {
  autoScore: number;
  maxAutoScore: number;
  needsReviewCount: number;
  feedback: Array<{
    number: number;
    given: string;
    correct: string | null;
    state: "correct" | "incorrect" | "needs_review";
    skill?: string;
  }>;
}

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function gradeQuiz(items: QuizItem[], answers: Record<string, string>): GradedResult {
  const feedback: GradedResult["feedback"] = [];
  let auto = 0;
  let max = 0;
  let review = 0;
  for (const item of items) {
    const given = (answers[String(item.number)] ?? "").trim();
    if (item.type === "multiple_choice" || item.type === "true_false") {
      max += 1;
      const correct = normalise(item.correctAnswer) === normalise(given);
      if (correct) auto += 1;
      feedback.push({
        number: item.number,
        given,
        correct: item.correctAnswer,
        state: correct ? "correct" : "incorrect",
        ...(item.skillAssessed ? { skill: item.skillAssessed } : {}),
      });
    } else {
      review += 1;
      feedback.push({
        number: item.number,
        given,
        correct: item.correctAnswer,
        state: "needs_review",
        ...(item.skillAssessed ? { skill: item.skillAssessed } : {}),
      });
    }
  }
  return { autoScore: auto, maxAutoScore: max, needsReviewCount: review, feedback };
}

export function gradeWorksheet(questions: WorksheetQuestion[], answers: Record<string, string>): GradedResult {
  const feedback: GradedResult["feedback"] = [];
  let auto = 0;
  let max = 0;
  let review = 0;
  for (const q of questions) {
    const given = (answers[String(q.number)] ?? "").trim();
    if (q.type === "multiple_choice") {
      max += 1;
      const correct = normalise(q.answer) === normalise(given);
      if (correct) auto += 1;
      feedback.push({
        number: q.number,
        given,
        correct: q.answer,
        state: correct ? "correct" : "incorrect",
      });
    } else {
      review += 1;
      feedback.push({
        number: q.number,
        given,
        correct: q.answer,
        state: "needs_review",
      });
    }
  }
  return { autoScore: auto, maxAutoScore: max, needsReviewCount: review, feedback };
}
