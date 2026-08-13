import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { modulesTable, coursesTable, moduleReadingsTable, gradebookAlertsTable, usersTable, interactiveActivitiesTable, activitySubmissionsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { REASON_LABEL } from "./gradebookEngine";

/**
 * The in-lesson Coach.
 *
 * A learner-facing AI that is available on every module and is THREE things at once: a subject-matter
 * expert on this specific lesson, a professional educator, and a supportive coach that reads and adapts
 * to the individual learner. It is grounded strictly in the module's own content (readings/objectives),
 * is aware of the learner's gaps (reused from the gradebook off-track signals), and adapts to the
 * learner's saved coaching personality, learning style and accommodations.
 */

const MODEL = "claude-sonnet-4-6";

// How each saved coach personality should shape the coaching voice.
const PERSONA_STYLE: Record<string, string> = {
  socratic_mentor: "Guide mostly with well-aimed questions; let the learner reach the answer themselves.",
  drill_sergeant: "Be direct, brisk and demanding — but never cruel; push for precision and effort.",
  warm_encourager: "Be gentle, affirming and patient; notice effort and celebrate small wins.",
  strategic_analyst: "Be structured and analytical; break the problem into clear, ordered steps.",
};

export interface LessonCoachContext {
  learnerName: string;
  courseTitle: string;
  moduleTitle: string;
  objectives: string[];
  lessonText: string;
  gaps: string[];
  masteryPct: number | null;
  persona: string;
  learningStyle: string | null;
  accommodations: string[];
  performance: string[];     // per-activity result lines for THIS module
  weakSpot: string | null;   // the single most useful place to start (an activity or a gap)
}

/** Assemble everything the coach needs about this learner + this lesson. */
export async function buildLessonCoachContext(moduleId: string, userId: string): Promise<LessonCoachContext | null> {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, moduleId) });
  if (!mod) return null;
  const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, mod.courseId) });
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  const readings = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, moduleId));

  let lessonText = readings.map((r) => r.content ?? "").filter(Boolean).join("\n\n").trim();
  if (lessonText.length < 100) lessonText = (mod.description ?? "").trim();

  // Reveal gaps from the gradebook off-track signal (course-level), best-effort.
  let gaps: string[] = [];
  let masteryPct: number | null = null;
  try {
    const alert = await db.query.gradebookAlertsTable.findFirst({
      where: and(eq(gradebookAlertsTable.courseId, mod.courseId), eq(gradebookAlertsTable.userId, userId)),
    });
    if (alert) {
      masteryPct = typeof alert.masteryPct === "number" ? alert.masteryPct : null;
      gaps = (alert.reasons ?? []).map((r) => REASON_LABEL[r] ?? r);
    }
  } catch { /* no gradebook data yet -> coach probes to find the starting point */ }

  // The learner's ACTUAL work in this module: how they scored on each interactive activity. This is
  // what lets the coach pinpoint concrete gaps ("you scored 40% on the cash-flow quiz") instead of
  // guessing. The lowest attempted score becomes the weak spot the coach opens on.
  const performance: string[] = [];
  let weakSpot: string | null = null;
  try {
    const acts = await db.select({ id: interactiveActivitiesTable.id, title: interactiveActivitiesTable.title, maxScore: interactiveActivitiesTable.maxScore })
      .from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.moduleId, moduleId));
    if (acts.length) {
      const subs = await db.select({ activityId: activitySubmissionsTable.activityId, score: activitySubmissionsTable.score, status: activitySubmissionsTable.status })
        .from(activitySubmissionsTable)
        .where(and(eq(activitySubmissionsTable.userId, userId), inArray(activitySubmissionsTable.activityId, acts.map((a) => a.id))));
      const byAct = new Map(subs.map((s) => [s.activityId, s]));
      let worst = 101;
      for (const a of acts) {
        const s = byAct.get(a.id);
        if (!s) { performance.push(`"${a.title}": not attempted yet`); continue; }
        const max = Number(a.maxScore) || 100;
        const sc = s.score != null ? Number(s.score) : null;
        const pct = sc != null && max > 0 ? Math.round((sc / max) * 100) : null;
        performance.push(`"${a.title}": ${pct != null ? pct + "%" : String(s.status)}`);
        if (pct != null && pct < worst) { worst = pct; if (pct < 70) weakSpot = `their ${pct}% on "${a.title}"`; }
      }
    }
  } catch { /* activity data optional */ }
  if (!weakSpot && gaps.length) weakSpot = gaps[0].toLowerCase();

  const nameParts = [user?.firstName, user?.lastName].filter(Boolean) as string[];
  return {
    learnerName: nameParts.length ? nameParts.join(" ") : "there",
    courseTitle: course?.title ?? "this course",
    moduleTitle: mod.title,
    objectives: (mod.objectives ?? []).slice(0, 8),
    lessonText: lessonText.slice(0, 16000),
    gaps,
    masteryPct,
    persona: (user?.coachPersonality as string) ?? "warm_encourager",
    learningStyle: user?.learningStyle ?? null,
    accommodations: user?.accommodations ?? [],
    performance: performance.slice(0, 10),
    weakSpot,
  };
}

function systemPrompt(c: LessonCoachContext): string {
  const styleLine = PERSONA_STYLE[c.persona] ?? PERSONA_STYLE.warm_encourager;
  const styleAdapt = c.learningStyle ? `The learner's preferred learning style is ${c.learningStyle} — lean into it (examples, visuals-in-words, practice, or read/write as fits).` : "";
  const accom = c.accommodations.length ? `Honour these accommodations: ${c.accommodations.join(", ")}.` : "";
  const masteryLine = c.masteryPct != null ? `Their current mastery in this course is about ${Math.round((c.masteryPct <= 1 ? c.masteryPct * 100 : c.masteryPct))}%.` : "";
  const gapsLine = c.gaps.length
    ? `Known gaps to work on: ${c.gaps.join("; ")}. Bring these up naturally and help close them.`
    : "There is no gap data yet — ask a couple of quick diagnostic questions to find where they are before teaching.";
  return [
    `You are ${c.learnerName}'s personal learning Coach for the lesson "${c.moduleTitle}" in ${c.courseTitle}.`,
    `You are three things at once: a subject-matter EXPERT on THIS lesson, a professional EDUCATOR, and a supportive COACH with the training to read each learner and adapt to them individually.`,
    `Ground every explanation strictly in the LESSON CONTENT below. You are the expert on THIS material — do not drift into generic advice, and do not invent content that isn't supported by the lesson.`,
    `Your job: figure out where the learner actually is, reveal their specific gaps, and coach them through those gaps one small step at a time.`,
    `Coaching style: ${styleLine} ${styleAdapt} ${accom}`.trim(),
    `Be warm and genuinely human; never shame the learner. Keep replies short (2–5 sentences). End most replies with ONE focused question or a single concrete next step. Never dump the whole lesson at once.`,
    masteryLine,
    gapsLine,
    c.performance.length ? `The learner's actual results on this lesson's activities (use these to pinpoint gaps precisely — refer to real scores, don't guess):\n- ${c.performance.join("\n- ")}` : "",
    c.objectives.length ? `This lesson's objectives:\n- ${c.objectives.join("\n- ")}` : "",
    `\n=== LESSON CONTENT ===\n${c.lessonText || "(No lesson text is available yet; coach from the objectives and the learner's questions.)"}`,
  ].filter(Boolean).join("\n\n");
}

/** One coaching turn. `messages` is the running conversation, learner's latest message last. */
export async function coachReply(c: LessonCoachContext, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 900,
    system: systemPrompt(c),
    messages: messages.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  }, { timeout: 60000, maxRetries: 1 });
  const txt = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return txt || "Let's take it one step at a time — which part of this lesson feels least clear right now?";
}

/** A friendly, proactive opener when the panel first opens (deterministic, so it never fails to load). */
export function deterministicOpener(c: LessonCoachContext): string {
  const first = c.learnerName.split(" ")[0];
  const focus = c.weakSpot ? ` Looking at your work here, I'd suggest we start with ${c.weakSpot} — I think a little time there will pay off.` : "";
  const invite = c.weakSpot ? ` Want to dig into that, or is there something else on your mind?` : ` Tell me what you'd like help with, or say "not sure" and I'll ask a couple of quick questions to find your best starting point.`;
  return `Hi ${first} — I'm your coach for "${c.moduleTitle}", and I know this lesson inside out.${focus}${invite}`;
}
