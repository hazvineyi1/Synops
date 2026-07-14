import { Router } from "express";
import express from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  sessionsTable,
  dialogueTurnsTable,
  beatsTable,
  modulesTable,
  enrolmentsTable,
  conceptMasteryTable,
  whatsappConversationsTable,
  whatsappMessagesTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { twiml, sendWhatsApp, twilioConfigured, validateTwilioSignature } from "../lib/twilio";
import { generateSocraticTurn, type SocraticContext } from "../lib/socraticEngine";
import { applyCheckpoint } from "../lib/mastery";
import { isDue } from "../lib/sm2";

const router = Router();
const PROMPT_BUDGET = 8;

function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").trim();
}

async function socraticCtxFor(
  user: typeof usersTable.$inferSelect,
  beat: typeof beatsTable.$inferSelect | null | undefined,
  turnCount: number
): Promise<SocraticContext> {
  return {
    beatTitle: beat?.title,
    beatType: beat?.type,
    narration: beat?.narration,
    scenario: beat?.scenario,
    bulletPoints: beat?.bulletPoints,
    learnerName: user.firstName,
    personality: user.coachPersonality,
    learningStyle: user.learningStyle,
    accommodations: user.accommodations,
    turnCount,
    promptBudget: PROMPT_BUDGET,
  };
}

// Pick the next module to work on: first due review, else first module
// in an active enrolment with no mastery row yet.
async function pickNextModule(userId: string): Promise<{ moduleId: string; title: string } | null> {
  const mastery = await db
    .select()
    .from(conceptMasteryTable)
    .where(eq(conceptMasteryTable.userId, userId))
    .orderBy(asc(conceptMasteryTable.dueDate));
  const due = mastery.find((m) => isDue(m.dueDate));
  if (due) return { moduleId: due.moduleId, title: due.moduleTitle };

  const enrolments = await db
    .select()
    .from(enrolmentsTable)
    .where(and(eq(enrolmentsTable.userId, userId), eq(enrolmentsTable.status, "active")));
  const courseIds = enrolments.map((e) => e.courseId);
  if (!courseIds.length) return null;
  const modules = await db
    .select()
    .from(modulesTable)
    .where(and(inArray(modulesTable.courseId, courseIds), eq(modulesTable.status, "published")))
    .orderBy(asc(modulesTable.order));
  const started = new Set(mastery.map((m) => m.moduleId));
  const fresh = modules.find((m) => !started.has(m.id));
  return fresh ? { moduleId: fresh.id, title: fresh.title } : null;
}

async function startSession(
  user: typeof usersTable.$inferSelect,
  moduleId: string
): Promise<{ sessionId: string; beat: typeof beatsTable.$inferSelect | null; opening: string }> {
  const [firstBeat] = await db
    .select()
    .from(beatsTable)
    .where(eq(beatsTable.moduleId, moduleId))
    .orderBy(asc(beatsTable.order))
    .limit(1);
  const [session] = await db
    .insert(sessionsTable)
    .values({ moduleId, userId: user.id, status: "active", masteryScore: "0", currentBeatId: firstBeat?.id ?? null })
    .returning();

  const ctx = await socraticCtxFor(user, firstBeat, 0);
  const opening = await generateSocraticTurn(ctx, [
    { role: "user", content: "I'm ready to begin. Ask me the first question." },
  ], true);

  await db.insert(dialogueTurnsTable).values({
    sessionId: session.id,
    role: "tutor",
    content: opening,
    beatId: firstBeat?.id ?? null,
  });
  return { sessionId: session.id, beat: firstBeat ?? null, opening };
}

// POST /whatsapp/webhook — Twilio inbound (two-way Socratic dialogue over WhatsApp)
router.post(
  "/whatsapp/webhook",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    // When Twilio is configured, reject any request that is not a genuine,
    // signed Twilio webhook. This stops spoofed inbound posts from
    // impersonating a phone number to manipulate sessions/mastery.
    if (twilioConfigured()) {
      const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ?? req.protocol;
      const host = (req.headers["x-forwarded-host"] as string) ?? req.get("host");
      const url = process.env.TWILIO_WEBHOOK_URL ?? `${proto}://${host}${req.originalUrl}`;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.body ?? {})) params[k] = String(v);
      const ok = validateTwilioSignature(
        req.headers["x-twilio-signature"] as string | undefined,
        url,
        params
      );
      if (!ok) {
        res.status(403).type("text/plain").send("Invalid signature");
        return;
      }
    }

    const from = normalizePhone(String(req.body.From ?? ""));
    const body = String(req.body.Body ?? "").trim();
    res.setHeader("Content-Type", "text/xml");

    if (!from) {
      res.send(twiml("Sorry, I could not read your number. Please try again from the app."));
      return;
    }

    const user = await db.query.usersTable.findFirst({ where: eq(usersTable.phone, from) });
    if (!user || !user.whatsappOptIn) {
      res.send(
        twiml(
          "This number is not linked to a Synops Praxis account yet. Open the app, go to Coach settings, add this WhatsApp number and turn on WhatsApp coaching."
        )
      );
      return;
    }

    await db.insert(whatsappMessagesTable).values({ userId: user.id, phone: from, direction: "in", body });

    let convo = await db.query.whatsappConversationsTable.findFirst({
      where: eq(whatsappConversationsTable.phone, from),
    });
    if (!convo) {
      const [created] = await db
        .insert(whatsappConversationsTable)
        .values({ userId: user.id, phone: from, mode: "idle" })
        .returning();
      convo = created;
    }

    const lower = body.toLowerCase();
    let reply = "";

    const sendReply = async (text: string) => {
      await db.insert(whatsappMessagesTable).values({ userId: user.id, phone: from, direction: "out", body: text });
      await db
        .update(whatsappConversationsTable)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(whatsappConversationsTable.id, convo!.id));
      res.send(twiml(text));
    };

    // ── Commands ──────────────────────────────────────────────
    if (["stop", "pause", "quit", "exit"].includes(lower)) {
      await db
        .update(whatsappConversationsTable)
        .set({ mode: "idle", currentSessionId: null, currentBeatId: null })
        .where(eq(whatsappConversationsTable.id, convo.id));
      await sendReply("Paused. Reply START anytime to pick up where the Coach left off.");
      return;
    }

    if (lower === "help") {
      await sendReply(
        "I am your Synops Praxis coach. Commands: START to begin or resume a session, PLAN to hear today's plan, STOP to pause. Otherwise, just answer my questions and we will keep going."
      );
      return;
    }

    if (lower === "plan") {
      const next = await pickNextModule(user.id);
      await sendReply(
        next
          ? `Today, let us work on: ${next.title}. Reply START and I will ask you the first question.`
          : "You are all caught up, nothing is due today. Reply START to explore something new from your courses."
      );
      return;
    }

    if (lower === "start" || (convo.mode === "idle" && !convo.currentSessionId)) {
      const next = await pickNextModule(user.id);
      if (!next) {
        await sendReply("You are not enrolled in anything with published modules yet. Ask your coach or admin to enrol you, then reply START.");
        return;
      }
      const started = await startSession(user, next.moduleId);
      await db
        .update(whatsappConversationsTable)
        .set({
          mode: "session",
          currentSessionId: started.sessionId,
          currentModuleId: next.moduleId,
          currentBeatId: started.beat?.id ?? null,
        })
        .where(eq(whatsappConversationsTable.id, convo.id));
      await sendReply(started.opening);
      return;
    }

    // ── In-session: treat the message as the learner's answer ──
    if (convo.mode === "session" && convo.currentSessionId) {
      const session = await db.query.sessionsTable.findFirst({
        where: eq(sessionsTable.id, convo.currentSessionId),
      });
      if (!session || session.status === "mastered") {
        await db
          .update(whatsappConversationsTable)
          .set({ mode: "idle", currentSessionId: null })
          .where(eq(whatsappConversationsTable.id, convo.id));
        await sendReply("That session is complete. Reply START to begin the next one.");
        return;
      }

      const beat = convo.currentBeatId
        ? await db.query.beatsTable.findFirst({ where: eq(beatsTable.id, convo.currentBeatId) })
        : null;

      const history = await db
        .select()
        .from(dialogueTurnsTable)
        .where(eq(dialogueTurnsTable.sessionId, session.id))
        .orderBy(desc(dialogueTurnsTable.createdAt))
        .limit(8);
      const historyOrdered = history.reverse();

      await db.insert(dialogueTurnsTable).values({
        sessionId: session.id,
        role: "learner",
        content: body,
        beatId: convo.currentBeatId ?? null,
      });

      const exchangeCount = Math.floor(Number(session.turnCount) / 2);
      const ctx = await socraticCtxFor(user, beat, exchangeCount);
      const chat: { role: "user" | "assistant"; content: string }[] = [
        ...historyOrdered.map((t) => ({
          role: t.role === "tutor" ? ("assistant" as const) : ("user" as const),
          content: t.content,
        })),
        { role: "user", content: body },
      ];

      const coachReply = await generateSocraticTurn(ctx, chat, false);

      const result = await applyCheckpoint({
        userId: user.id,
        session,
        socraticCtx: ctx,
        learnerResponse: body,
        historyOrdered,
        tutorReply: coachReply,
      });

      await db.insert(dialogueTurnsTable).values({
        sessionId: session.id,
        role: "tutor",
        content: coachReply,
        beatId: convo.currentBeatId ?? null,
        reasoning: result.reasoning,
      });

      let out = coachReply;
      if (result.mastered) {
        out += "\n\n\u2728 You have just earned a PraxisMark for this module. Reply START for the next one.";
        await db
          .update(whatsappConversationsTable)
          .set({ mode: "idle", currentSessionId: null, currentBeatId: null })
          .where(eq(whatsappConversationsTable.id, convo.id));
      }
      await sendReply(out);
      return;
    }

    // Fallback
    await sendReply("Reply START to begin a coaching session, or PLAN to hear today's plan.");
  }
);

// POST /whatsapp/test-send — dev helper to verify outbound is configured.
// Restricted to non-production or platform admins so it can't be abused to
// burn Twilio outbound spend.
router.post("/whatsapp/test-send", requireAuth, async (req, res) => {
  const isAdmin = req.dbUser?.role === "super_admin" || req.dbUser?.role === "partner_admin";
  if (process.env.NODE_ENV === "production" && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { to, message } = req.body as { to: string; message: string };
  if (!twilioConfigured()) {
    res.status(503).json({ error: "Twilio not configured", configured: false });
    return;
  }
  const result = await sendWhatsApp(to, message ?? "Test from Synops Praxis coach.");
  res.status(result.ok ? 200 : 502).json(result);
});

// GET /whatsapp/status — is the outbound channel live?
router.get("/whatsapp/status", requireAuth, async (_req, res) => {
  res.json({ configured: twilioConfigured() });
});

export default router;
