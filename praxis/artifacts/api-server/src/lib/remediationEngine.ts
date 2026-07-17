import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import {
  modulesTable,
  beatsTable,
  remedialSetsTable,
  remedialFlashcardsTable,
  remedialQuestionsTable,
  coachGamificationTable,
} from "@workspace/db";
import { eq, and, inArray, asc, desc } from "drizzle-orm";

/**
 * Adaptive, multi-modal remediation. For a learner's gap (a gradebook category on their
 * active off-track plan) we generate ONCE — grounded in that learner's OWN course content
 * (module beats) — a set of flashcards + knowledge questions, then persist them so the
 * learner works spaced repetition + quizzing over their real class material. Personalised:
 * the coach copy addresses the learner by name. Deterministic fallback so it never blocks.
 */
const MODEL = "claude-sonnet-4-6";

const STOP = new Set(["the", "and", "a", "an", "of", "to", "in", "for", "with", "on", "at", "by", "general", "assignment", "assignments", "assessment", "week", "module", "unit", "part", "quiz", "test", "exam"]);
function tokens(s: string): string[] {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}
function overlap(a: string[], text: string): number {
  if (!a.length) return 0;
  const t = text.toLowerCase();
  return a.reduce((n, w) => (t.includes(w) ? n + 1 : n), 0);
}

interface GenFlash { front: string; back: string; hint?: string }
interface GenQ { prompt: string; options: string[]; correctIndex: number; explanation?: string; difficulty?: string }

/** Pull the learner's course content most relevant to the gap and build a teaching digest. */
async function courseDigest(courseId: string, category: string): Promise<{ digest: string; sourceTitles: string[] }> {
  const modules = await db.select().from(modulesTable).where(eq(modulesTable.courseId, courseId));
  if (!modules.length) return { digest: "", sourceTitles: [] };
  const toks = tokens(category);
  const ranked = modules
    .map((m) => ({ m, score: overlap(toks, `${m.title} ${m.description ?? ""}`) }))
    .sort((a, b) => b.score - a.score);
  // Prefer modules that match the gap; if nothing matches, use the first few modules of the course.
  const picked = (ranked.some((r) => r.score > 0) ? ranked.filter((r) => r.score > 0) : ranked).slice(0, 4).map((r) => r.m);
  const moduleIds = picked.map((m) => m.id);
  const beats = moduleIds.length
    ? await db.select().from(beatsTable).where(inArray(beatsTable.moduleId, moduleIds)).orderBy(asc(beatsTable.order))
    : [];
  const parts: string[] = [];
  for (const m of picked) {
    const mb = beats.filter((b) => b.moduleId === m.id);
    const body = mb
      .map((b) => [b.narration, b.scenario, (Array.isArray(b.bulletPoints) ? b.bulletPoints : []).join("; ")].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("\n");
    if (body.trim()) parts.push(`## ${m.title}\n${body}`);
  }
  return { digest: parts.join("\n\n").slice(0, 7000), sourceTitles: picked.map((m) => m.title) };
}

/** Deterministic flashcards from beat bullet points, so a set is never empty if AI is down. */
function fallbackFlashcards(digest: string): GenFlash[] {
  const cards: GenFlash[] = [];
  for (const block of digest.split("\n\n")) {
    const lines = block.split("\n");
    const heading = (lines[0] || "").replace(/^#+\s*/, "").trim();
    const bullets = (lines.slice(1).join(" ").match(/[^.;]+[.;]/g) || []).map((s) => s.trim()).filter((s) => s.length > 25);
    for (const b of bullets.slice(0, 3)) {
      cards.push({ front: `In "${heading}", what is the key idea here?`, back: b.replace(/[.;]$/, "").trim() });
      if (cards.length >= 8) return cards;
    }
  }
  return cards;
}

/** Ensure a remediation set exists for (userId, planId, category); generate it once if not. */
export async function ensureRemediationSet(opts: {
  userId: string; planId: string | null; courseId: string | null; category: string; learnerName?: string | null;
}): Promise<{ setId: string; status: string }> {
  const { userId, planId, courseId, category } = opts;
  const learnerName = opts.learnerName ?? null;

  const existing = await db
    .select({ id: remedialSetsTable.id, status: remedialSetsTable.status })
    .from(remedialSetsTable)
    .where(and(eq(remedialSetsTable.userId, userId), eq(remedialSetsTable.category, category), planId ? eq(remedialSetsTable.planId, planId) : eq(remedialSetsTable.category, category)))
    .limit(1);
  if (existing[0]) return { setId: existing[0].id, status: existing[0].status };

  const { digest } = courseId ? await courseDigest(courseId, category) : { digest: "" };
  const { flashcards, questions } = await generateItems(digest, category);
  const status = flashcards.length || questions.length ? "ready" : "empty";
  const [set] = await db
    .insert(remedialSetsTable)
    .values({ userId, planId, courseId, category, learnerName, status })
    .returning({ id: remedialSetsTable.id });
  await storeItems(set.id, userId, flashcards, questions);
  return { setId: set.id, status };
}

/** Ask the model for flashcards + MCQs grounded ONLY in `digest`; deterministic fallback. */
async function generateItems(digest: string, targetGap: string): Promise<{ flashcards: GenFlash[]; questions: GenQ[] }> {
  let flashcards: GenFlash[] = [];
  let questions: GenQ[] = [];
  if (digest.trim().length >= 120) {
    try {
      const system =
        "You are a warm, expert learning coach creating study practice from a piece of learning material. " +
        "Using ONLY the material provided, create practice that rebuilds understanding of the target topic. " +
        "Return STRICT JSON only: {\"flashcards\":[{\"front\":string,\"back\":string,\"hint\":string}], \"questions\":[{\"prompt\":string,\"options\":[string,string,string,string],\"correctIndex\":0,\"explanation\":string,\"difficulty\":\"easy|medium|hard\"}]}. " +
        "Make 8 flashcards (clear question on front, concise answer on back, short optional hint) and 6 multiple-choice questions (exactly 4 options each, one correct, a one-sentence explanation). " +
        "Ground every item in the provided material; do not invent facts outside it. Use plain South African English. No markdown, no lists in fields.";
      const payload = { targetTopic: targetGap, material: digest };
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2600,
        system,
        messages: [{ role: "user", content: JSON.stringify(payload) + "\n\nReturn only the JSON object." }],
      });
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (Array.isArray(parsed?.flashcards)) {
        flashcards = parsed.flashcards
          .filter((f: any) => f?.front && f?.back)
          .map((f: any) => ({ front: String(f.front), back: String(f.back), hint: f.hint ? String(f.hint) : undefined }))
          .slice(0, 12);
      }
      if (Array.isArray(parsed?.questions)) {
        questions = parsed.questions
          .filter((q: any) => q?.prompt && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.correctIndex))
          .map((q: any) => ({
            prompt: String(q.prompt),
            options: q.options.slice(0, 6).map((o: any) => String(o)),
            correctIndex: Math.max(0, Math.min(q.options.length - 1, q.correctIndex)),
            explanation: q.explanation ? String(q.explanation) : undefined,
            difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium",
          }))
          .slice(0, 10);
      }
    } catch {
      /* fall through to deterministic cards */
    }
  }
  if (flashcards.length === 0) flashcards = fallbackFlashcards(digest);
  return { flashcards, questions };
}

/** Persist generated flashcards + questions for a set. */
async function storeItems(setId: string, userId: string, flashcards: GenFlash[], questions: GenQ[]): Promise<void> {
  if (flashcards.length) {
    await db.insert(remedialFlashcardsTable).values(
      flashcards.map((f, i) => ({ setId, userId, front: f.front, back: f.back, hint: f.hint ?? null, order: i })),
    );
  }
  if (questions.length) {
    await db.insert(remedialQuestionsTable).values(
      questions.map((q, i) => ({ setId, userId, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation ?? null, difficulty: q.difficulty ?? "medium", order: i })),
    );
  }
}

/** Turn a document/link the learner uploaded (already extracted to text) into a practice set. */
export async function createUploadSet(opts: {
  userId: string; planId: string | null; courseId: string | null; title: string; text: string; learnerName?: string | null;
}): Promise<{ setId: string; status: string; flashcards: number; questions: number }> {
  const { flashcards, questions } = await generateItems(opts.text, opts.title);
  const status = flashcards.length || questions.length ? "ready" : "empty";
  const [set] = await db
    .insert(remedialSetsTable)
    .values({
      userId: opts.userId,
      planId: opts.planId,
      courseId: opts.courseId,
      category: opts.title.slice(0, 120),
      title: opts.title.slice(0, 200),
      source: "upload",
      learnerName: opts.learnerName ?? null,
      status,
    })
    .returning({ id: remedialSetsTable.id });
  await storeItems(set.id, opts.userId, flashcards, questions);
  return { setId: set.id, status, flashcards: flashcards.length, questions: questions.length };
}

/** The practice sets a learner created from their own uploads, newest first. */
export async function getUploadSets(userId: string): Promise<Array<{ setId: string; title: string; status: string; createdAt: string | null }>> {
  const rows = await db
    .select({ id: remedialSetsTable.id, title: remedialSetsTable.title, status: remedialSetsTable.status, createdAt: remedialSetsTable.createdAt })
    .from(remedialSetsTable)
    .where(and(eq(remedialSetsTable.userId, userId), eq(remedialSetsTable.source, "upload")))
    .orderBy(desc(remedialSetsTable.createdAt));
  return rows.map((r) => ({ setId: r.id, title: r.title ?? "Your material", status: r.status, createdAt: r.createdAt?.toISOString() ?? null }));
}

/** Add XP and update the learner's daily streak. Returns the new gamification state. */
export async function bumpGamification(userId: string, xp: number): Promise<{ xp: number; streak: number; longestStreak: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select().from(coachGamificationTable).where(eq(coachGamificationTable.userId, userId)).limit(1);
  if (!row) {
    await db.insert(coachGamificationTable).values({ userId, xp, streak: 1, longestStreak: 1, lastActivityDate: today }).onConflictDoNothing();
    return { xp, streak: 1, longestStreak: 1 };
  }
  let streak = row.streak;
  if (row.lastActivityDate !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    streak = row.lastActivityDate === yesterday ? row.streak + 1 : 1;
  }
  const longestStreak = Math.max(row.longestStreak, streak);
  const newXp = row.xp + xp;
  await db
    .update(coachGamificationTable)
    .set({ xp: newXp, streak, longestStreak, lastActivityDate: today, updatedAt: new Date() })
    .where(eq(coachGamificationTable.userId, userId));
  return { xp: newXp, streak, longestStreak };
}

export async function getGamification(userId: string): Promise<{ xp: number; streak: number; longestStreak: number }> {
  const [row] = await db.select().from(coachGamificationTable).where(eq(coachGamificationTable.userId, userId)).limit(1);
  return { xp: row?.xp ?? 0, streak: row?.streak ?? 0, longestStreak: row?.longestStreak ?? 0 };
}
