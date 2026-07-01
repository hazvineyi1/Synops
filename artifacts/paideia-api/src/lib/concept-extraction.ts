import { db, studyConceptsTable, studyFlashcardsTable } from "@workspace/paideia-db";
import { generateJSON } from "./openai.js";

interface ExtractedConcept {
  title: string;
  explanation: string;
  difficulty: string;
  keyTerms: string[];
}

/**
 * Fire-and-forget concept + flashcard extraction for a newly created study material.
 * Safe to call without awaiting - errors are logged and swallowed.
 */
export function kickoffConceptExtraction(args: {
  userId: string;
  materialId: string;
  title: string;
  contentText: string;
}): void {
  const { userId, materialId, title, contentText } = args;
  if (!contentText || contentText.trim().length < 20) return;

  void (async () => {
    try {
      const raw = await generateJSON<
        { concepts?: ExtractedConcept[] } | ExtractedConcept[]
      >(
        "You are an expert educator. Extract key concepts from the study material. Return JSON with a top-level array named 'concepts'. Each concept has: title, explanation (2-3 sentences), difficulty (easy/medium/hard), and keyTerms (array of important terms).",
        `Extract concepts from this material:\n\nTitle: ${title}\n\n${contentText.slice(0, 8000)}`,
        { kind: "study_concept_extraction" },
      );

      const conceptsData: ExtractedConcept[] = Array.isArray(raw)
        ? raw
        : (raw as any).concepts ?? Object.values(raw as any).find(Array.isArray) ?? [];

      if (conceptsData.length === 0) return;

      const conceptRows = conceptsData.map((c) => ({
        userId,
        materialId,
        title: c.title,
        explanation: c.explanation,
        difficulty: ["easy", "medium", "hard"].includes(c.difficulty) ? c.difficulty : "medium",
        keyTerms: c.keyTerms ?? [],
      }));

      await db.insert(studyConceptsTable).values(conceptRows);

      const flashcardRows = conceptRows.map((c) => ({
        userId,
        materialId,
        front: c.title,
        back: c.explanation,
        hint: c.keyTerms.length > 0 ? `Think about: ${c.keyTerms.slice(0, 3).join(", ")}` : null,
        intervalDays: 1,
        repetitions: 0,
        easeFactor: 2.5,
        nextReviewAt: new Date(),
        reviewCount: 0,
      }));
      await db.insert(studyFlashcardsTable).values(flashcardRows);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Concept extraction failed:", err);
    }
  })();
}
