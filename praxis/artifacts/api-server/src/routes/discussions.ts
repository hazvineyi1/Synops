import { Router } from "express";
import { db } from "@workspace/db";
import { discussionsTable, discussionRepliesTable, usersTable, notificationsTable, modulesTable, coursesTable, moduleReadingsTable } from "@workspace/db";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { requireAuth, requireCoFacilitatorOrAbove } from "../middlewares/requireAuth";
import { canStaffActOnCourse, canParticipateInCourse } from "../lib/scope";
import { generateFacilitatorQuestion, countWords } from "../lib/discussionEngine";
import { PEJ_COACH_PERSONA, PEJ_COACH_CONSTRAINTS } from "../lib/stationCoach";
import { MUTALE_PERSONA, MUTALE_CONSTRAINTS } from "../lib/mrbCoach";
import { translateTexts } from "../lib/caseEngine";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const router = Router();

function toUserSnap(u: typeof usersTable.$inferSelect | null) {
  if (!u) return null;
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, avatarUrl: u.avatarUrl, role: u.role };
}

/**
 * GET /courses/:courseId/discussions
 *
 * Each row carries `iHaveReplied` for the CALLING learner. replyCount is a global total, so
 * on its own it cannot answer "has THIS learner participated?" -- which is what a
 * participation requirement actually turns on. Only the caller's own authorship is checked;
 * no other learner's posting activity is exposed here.
 */
router.get("/courses/:courseId/discussions", requireAuth, async (req, res) => {
  if (!(await canParticipateInCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select({ discussion: discussionsTable, author: usersTable })
    .from(discussionsTable)
    .leftJoin(usersTable, eq(discussionsTable.authorId, usersTable.id))
    .where(eq(discussionsTable.courseId, req.params.courseId))
    .orderBy(desc(discussionsTable.isPinned), desc(discussionsTable.createdAt));

  const myReplies = await db
    .select({ discussionId: discussionRepliesTable.discussionId })
    .from(discussionRepliesTable)
    .where(and(
      eq(discussionRepliesTable.authorId, req.userId!),
      eq(discussionRepliesTable.isAiFacilitator, false),
    ));
  // Count, not just a boolean: participation is "5 interactions", so a thread the learner
  // has posted in once is not the same as one they have finished.
  const myCount = new Map<string, number>();
  for (const r of myReplies) myCount.set(r.discussionId, (myCount.get(r.discussionId) ?? 0) + 1);

  // ?moduleId= narrows to one module's threads. Without it the module Participate tab shows
  // every thread in the whole course, which is what it did before.
  const moduleId = typeof req.query.moduleId === "string" ? req.query.moduleId : null;
  const visible = moduleId
    ? rows.filter((r) => r.discussion.moduleId === moduleId || r.discussion.moduleId == null)
    : rows;

  res.json(visible.map(r => {
    const n = myCount.get(r.discussion.id) ?? 0;
    return {
      ...r.discussion,
      author: toUserSnap(r.author),
      iHaveReplied: n >= r.discussion.requiredInteractions,
      myPosts: n,
    };
  }));
});

// POST /courses/:courseId/discussions
router.post("/courses/:courseId/discussions", requireAuth, async (req, res) => {
  // Starting a thread is participation, so the caller must be ON the course -- previously
  // any authenticated user could open a thread in any cohort on the platform.
  if (!(await canParticipateInCourse(req.dbUser!, req.params.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const {
    title, body, requireInitialPost, moduleId, aiFacilitated, language,
    minInitialWords, maxInitialWords, minReplyWords, requiredInteractions,
  } = req.body;
  // Learners may start threads -- asking the group a question is participation, not
  // administration. But only staff may set the participation BAR: otherwise a learner
  // could author a thread that quietly requires one short post and have it count the
  // same as one that requires five substantial ones.
  const isStaff = await canStaffActOnCourse(req.dbUser!, req.params.courseId);

  const [discussion] = await db.insert(discussionsTable).values({
    courseId: req.params.courseId,
    authorId: req.userId!,
    title,
    body,
    requireInitialPost: requireInitialPost ?? false,
    moduleId: moduleId ?? null,
    aiFacilitated: aiFacilitated ?? true,
    language: language ?? "en",
    ...(isStaff && minInitialWords != null ? { minInitialWords } : {}),
    ...(isStaff && maxInitialWords != null ? { maxInitialWords } : {}),
    ...(isStaff && minReplyWords != null ? { minReplyWords } : {}),
    ...(isStaff && requiredInteractions != null ? { requiredInteractions } : {}),
  }).returning();
  res.status(201).json(discussion);
});

// POST /modules/:moduleId/discussions/generate
//
// Reading material often contains reflective PROMPTS -- "identify one skill you will develop first
// and explain why", "which of these would you prioritise?" -- that belong in the Discussion section,
// not buried in the reading. This scans the module's readings (and the course's stored source) and
// turns the genuine discussion-worthy questions into module discussion threads. Staff-only.
router.post("/modules/:moduleId/discussions/generate", requireAuth, requireCoFacilitatorOrAbove, async (req, res) => {
  const mod = await db.query.modulesTable.findFirst({ where: eq(modulesTable.id, req.params.moduleId) });
  if (!mod) { res.status(404).json({ error: "Module not found" }); return; }
  if (!(await canStaffActOnCourse(req.dbUser!, mod.courseId))) { res.status(403).json({ error: "Forbidden" }); return; }

  // Prefer the module's own readings; fall back to the course source material for this module's topic.
  const readings = await db.select().from(moduleReadingsTable).where(eq(moduleReadingsTable.moduleId, mod.id));
  let corpus = readings.map((r) => r.content ?? "").filter(Boolean).join("\n\n").trim();
  if (corpus.length < 200) {
    const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, mod.courseId) });
    corpus = ((course as { sourceMaterial?: string } | undefined)?.sourceMaterial ?? "").trim();
  }
  if (corpus.length < 200) {
    res.status(422).json({ error: "There isn't enough reading content in this module yet. Add or generate a reading first." });
    return;
  }

  const wantRaw = Number((req.body as { count?: number } | undefined)?.count);
  const want = Number.isFinite(wantRaw) ? Math.max(1, Math.min(6, Math.round(wantRaw))) : 4;
  const topic = `${mod.title}. ${mod.description ?? ""}`.slice(0, 400);
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1600,
      messages: [{
        role: "user",
        content: `You are curating DISCUSSION questions for an online course module from its reading.\n\nModule: ${topic}\n\nFrom the reading below, pull out the reflective / open-ended / opinion / "explain why" / "which would you choose" style questions that make good peer DISCUSSION (not quiz questions with one right answer, and not self-rating checklists). Rewrite each as a clear, engaging discussion prompt of 1-2 sentences. Return the ${want} best.\n\nReply with ONLY strict JSON, no prose:\n{ "discussions": [ { "title": "short thread title (<=8 words)", "prompt": "the discussion prompt" } ] }\n\n=== READING ===\n${corpus.slice(0, 40000)}`,
      }],
    }, { timeout: 90000, maxRetries: 1 });
    const text = (message.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }
    const items = Array.isArray(parsed.discussions) ? parsed.discussions : [];
    const clean = items
      .map((x: any) => ({ title: String(x?.title ?? "").trim().slice(0, 120), prompt: String(x?.prompt ?? "").trim().slice(0, 1000) }))
      .filter((x: any) => x.title && x.prompt)
      .slice(0, want);
    if (!clean.length) { res.status(422).json({ error: "No discussion questions were found in this module's reading." }); return; }

    const created = [];
    for (const c of clean) {
      const [d] = await db.insert(discussionsTable).values({
        courseId: mod.courseId, moduleId: mod.id, authorId: req.userId!,
        title: c.title, body: c.prompt, aiFacilitated: true, language: "en",
      }).returning();
      created.push({ id: d.id, title: d.title });
    }
    res.status(201).json({ created });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("discussion gen failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not extract discussion questions. Please try again." });
  }
});

// GET /courses/:courseId/discussions/:discussionId
router.get("/courses/:courseId/discussions/:discussionId", requireAuth, async (req, res) => {
  const [row] = await db
    .select({ discussion: discussionsTable, author: usersTable })
    .from(discussionsTable)
    .leftJoin(usersTable, eq(discussionsTable.authorId, usersTable.id))
    .where(eq(discussionsTable.id, req.params.discussionId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // This returns every reply plus each author's name, email, avatar and role -- effectively
  // the cohort roster and everything they said. Enrolment-only.
  if (!(await canParticipateInCourse(req.dbUser!, row.discussion.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const replyRows = await db
    .select({ reply: discussionRepliesTable, author: usersTable })
    .from(discussionRepliesTable)
    .leftJoin(usersTable, eq(discussionRepliesTable.authorId, usersTable.id))
    .where(eq(discussionRepliesTable.discussionId, req.params.discussionId))
    .orderBy(asc(discussionRepliesTable.createdAt));

  // The caller's own participation against this thread's rule. Sent from the server so the
  // composer and the completion check agree on one count rather than each doing their own
  // arithmetic and drifting. AI facilitator turns never count towards a learner's total.
  const mine = replyRows.filter((r) => r.reply.authorId === req.userId && !r.reply.isAiFacilitator);
  const d = row.discussion;
  res.json({
    ...d,
    author: toUserSnap(row.author),
    replies: replyRows.map(r => ({ ...r.reply, author: toUserSnap(r.author) })),
    myParticipation: {
      posts: mine.length,
      required: d.requiredInteractions,
      hasInitialPost: mine.length > 0,
      met: mine.length >= d.requiredInteractions,
      minInitialWords: d.minInitialWords,
      maxInitialWords: d.maxInitialWords,
      minReplyWords: d.minReplyWords,
    },
  });
});

// PATCH /discussions/:discussionId, the author may edit their own text; moderation
// flags (pin/close) are delivery-staff-only, scoped to the course (decision §4.2).
router.patch("/discussions/:discussionId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, req.params.discussionId) });
  if (!discussion) { res.status(404).json({ error: "Discussion not found" }); return; }
  const isStaff = await canStaffActOnCourse(actor, discussion.courseId);
  const isAuthor = discussion.authorId === actor.id;
  if (!isStaff && !isAuthor) { res.status(403).json({ error: "Forbidden" }); return; }

  const {
    title, body, isPinned, isClosed, aiFacilitated, moduleId,
    minInitialWords, maxInitialWords, minReplyWords, requiredInteractions,
  } = req.body;
  const updates: Partial<typeof discussionsTable.$inferInsert> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body;
  if (isStaff) {
    if (isPinned !== undefined) updates.isPinned = isPinned;
    if (isClosed !== undefined) updates.isClosed = isClosed;
    // Facilitation, module scope and the participation bar are staff decisions. Being
    // settable AFTER creation matters: every thread that existed before AI facilitation
    // shipped has it switched off, and every thread predates module scoping entirely, so
    // without this they could only be changed by editing the database by hand.
    if (aiFacilitated !== undefined) updates.aiFacilitated = !!aiFacilitated;
    if (moduleId !== undefined) updates.moduleId = moduleId || null;
    if (minInitialWords !== undefined) updates.minInitialWords = minInitialWords;
    if (maxInitialWords !== undefined) updates.maxInitialWords = maxInitialWords;
    if (minReplyWords !== undefined) updates.minReplyWords = minReplyWords;
    if (requiredInteractions !== undefined) updates.requiredInteractions = requiredInteractions;
  }
  const [updated] = await db.update(discussionsTable)
    .set(updates)
    .where(eq(discussionsTable.id, req.params.discussionId))
    .returning();
  res.json(updated);
});

/**
 * POST /courses/:courseId/discussions/:discussionId/replies
 *
 * Enforces the thread's participation rule SERVER-SIDE. The composer shows a word counter,
 * but a rule that only lives in the browser is a suggestion -- anything posting straight at
 * the API would sail past it, and the counts feed a completion requirement.
 *
 * Order matters: the learner's own first contribution is the "initial post" and is held to
 * the 100-150 word band; everything after it is an interaction held to the 50-word floor.
 * A one-word "agreed" is exactly what this exists to reject.
 */
router.post("/courses/:courseId/discussions/:discussionId/replies", requireAuth, async (req, res) => {
  const { body, parentReplyId, language } = req.body;
  const user = req.dbUser!;
  const isInstructor = ["coach", "org_admin", "partner_admin", "super_admin"].includes(user.role);

  const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, req.params.discussionId) });
  if (!discussion) { res.status(404).json({ error: "Discussion not found" }); return; }
  // Posting into a cohort's discussion requires being in that cohort. Checked against the
  // DISCUSSION's own course, not the :courseId in the path, so a valid course id in the URL
  // cannot be used to reach a thread that belongs elsewhere.
  if (!(await canParticipateInCourse(req.dbUser!, discussion.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (discussion.isClosed) { res.status(409).json({ error: "This discussion is closed." }); return; }

  const words = countWords(body ?? "");
  if (words === 0) { res.status(400).json({ error: "Write something first." }); return; }

  // Staff and the AI facilitator are not held to the learner participation rule -- it
  // describes what a LEARNER must contribute, not what a facilitator may say.
  if (!isInstructor) {
    const mine = await db
      .select({ id: discussionRepliesTable.id })
      .from(discussionRepliesTable)
      .where(and(
        eq(discussionRepliesTable.discussionId, req.params.discussionId),
        eq(discussionRepliesTable.authorId, req.userId!),
      ));
    const isInitial = mine.length === 0;

    if (isInitial) {
      if (words < discussion.minInitialWords || words > discussion.maxInitialWords) {
        res.status(422).json({
          error: `Your first post should be between ${discussion.minInitialWords} and ${discussion.maxInitialWords} words. Yours is ${words}.`,
          rule: "initial", words,
          min: discussion.minInitialWords, max: discussion.maxInitialWords,
        });
        return;
      }
    } else if (words < discussion.minReplyWords) {
      res.status(422).json({
        error: `Replies need at least ${discussion.minReplyWords} words so there is something for others to engage with. Yours is ${words}.`,
        rule: "reply", words, min: discussion.minReplyWords,
      });
      return;
    }
  }

  const [reply] = await db.insert(discussionRepliesTable).values({
    discussionId: req.params.discussionId,
    authorId: req.userId!,
    body,
    parentReplyId: parentReplyId ?? null,
    isInstructorReply: isInstructor,
    language: typeof language === "string" && language ? language : discussion.language,
    wordCount: words,
  }).returning();

  // bump reply count
  await db.update(discussionsTable)
    .set({ replyCount: sql`${discussionsTable.replyCount} + 1`, updatedAt: new Date() })
    .where(eq(discussionsTable.id, req.params.discussionId));

  // notify original author
  if (discussion && discussion.authorId !== req.userId) {
    await db.insert(notificationsTable).values({
      userId: discussion.authorId,
      type: "discussion_reply",
      title: `${user.firstName ?? "Someone"} replied to your discussion`,
      body: `In: ${discussion.title}`,
      link: `/courses/${req.params.courseId}/discussions/${req.params.discussionId}`,
      courseId: req.params.courseId,
      actorId: req.userId,
    });
  }

  // The AI facilitator asks the next question. Deliberately best-effort and AFTER the
  // learner's post is safely committed: if the model is slow, unconfigured or errors, the
  // learner's contribution still stands. A post must never fail because the facilitator
  // could not think of a question.
  let facilitator: typeof discussionRepliesTable.$inferSelect | null = null;
  // Cap how many times the coach engages a given learner in this thread, so moderation has an end.
  // Predefined/admin-set via the discussion's requiredInteractions; default 5. The coach responds
  // while the learner is within that budget, then steps back.
  const facilitatorLimit = discussion.requiredInteractions && discussion.requiredInteractions > 0 ? discussion.requiredInteractions : 5;
  // Count THIS poster's own human (non-AI) posts in the thread, regardless of role. The coach
  // moderates every substantive contribution -- including a staff member's -- so an admin or
  // instructor demoing the thread also gets moderated, not just learners. The cap still applies.
  const myPostCount = (await db.select({ id: discussionRepliesTable.id }).from(discussionRepliesTable)
    .where(and(
      eq(discussionRepliesTable.discussionId, req.params.discussionId),
      eq(discussionRepliesTable.authorId, req.userId!),
      eq(discussionRepliesTable.isAiFacilitator, false),
    ))).length;
  if (discussion.aiFacilitated && myPostCount <= facilitatorLimit) {
    try {
      // Each programme gets its own coach as moderator: the PEJ justice mentor, or Mutale for the
      // Zambian clinical-leadership course. Other courses keep the default facilitator voice.
      const course = await db.query.coursesTable.findFirst({ where: eq(coursesTable.id, discussion.courseId) });
      const hay = `${course?.title ?? ""} ${(course?.competencyTags ?? []).join(" ")}`;
      const isPEJ = /PEJ-EVD|Project Expedite Justice/i.test(hay);
      const isMRB = /MRB-CLP|Leading with Purpose|Zambian Clinician/i.test(hay);
      const moderatorPersona = isPEJ ? PEJ_COACH_PERSONA : isMRB ? MUTALE_PERSONA : null;
      const moderatorConstraints = isPEJ ? PEJ_COACH_CONSTRAINTS : isMRB ? MUTALE_CONSTRAINTS : null;
      const all = await db
        .select({ reply: discussionRepliesTable, author: usersTable })
        .from(discussionRepliesTable)
        .leftJoin(usersTable, eq(discussionRepliesTable.authorId, usersTable.id))
        .where(eq(discussionRepliesTable.discussionId, req.params.discussionId))
        .orderBy(asc(discussionRepliesTable.createdAt));

      const question = await generateFacilitatorQuestion({
        title: discussion.title,
        prompt: discussion.body,
        langCode: discussion.language,
        courseTitle: course?.title ?? null,
        persona: moderatorPersona,
        constraints: moderatorConstraints,
        turns: all.map((r) => ({
          author: r.author?.firstName ?? "Learner",
          body: r.reply.body,
          isAi: r.reply.isAiFacilitator,
        })),
      });

      if (question) {
        const [f] = await db.insert(discussionRepliesTable).values({
          discussionId: req.params.discussionId,
          authorId: discussion.authorId,
          body: question,
          isInstructorReply: true,
          isAiFacilitator: true,
          language: discussion.language,
          wordCount: countWords(question),
        }).returning();
        facilitator = f;
        await db.update(discussionsTable)
          .set({ replyCount: sql`${discussionsTable.replyCount} + 1`, updatedAt: new Date() })
          .where(eq(discussionsTable.id, req.params.discussionId));
      }
    } catch {
      // Facilitation is a bonus, never a gate on the learner's own post.
    }
  }

  res.status(201).json({ ...reply, author: toUserSnap(user), facilitator });
});

/**
 * DELETE /discussions/:discussionId, staff only.
 *
 * There was no way to remove a discussion at all, so a thread created in error was
 * permanent. Deletes the replies first because nothing enforces the foreign key, and
 * orphaned discussion_replies rows would otherwise accumulate invisibly.
 *
 * Staff-only rather than author-also: deleting a thread destroys other people's
 * contributions, which is a moderation decision, not an authorship one.
 */
router.delete("/discussions/:discussionId", requireAuth, async (req, res) => {
  const discussion = await db.query.discussionsTable.findFirst({
    where: eq(discussionsTable.id, req.params.discussionId),
  });
  if (!discussion) { res.status(204).send(); return; }
  if (!(await canStaffActOnCourse(req.dbUser!, discussion.courseId))) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  await db.delete(discussionRepliesTable).where(eq(discussionRepliesTable.discussionId, req.params.discussionId));
  await db.delete(discussionsTable).where(eq(discussionsTable.id, req.params.discussionId));
  res.status(204).send();
});

/**
 * POST /discussions/:discussionId/translate
 * Body: { langCode }
 *
 * Translates the thread (prompt + every contribution) into the requested language and
 * returns it WITHOUT persisting: translation is a reading aid for the person asking, not an
 * edit to what someone else actually wrote. The original stays the record.
 */
router.post("/discussions/:discussionId/translate", requireAuth, async (req, res) => {
  const langCode = String(req.body?.langCode ?? "en");
  const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, req.params.discussionId) });
  if (!discussion) { res.status(404).json({ error: "Discussion not found" }); return; }
  // Returns the full body of every contribution, so it is a read of the whole thread by
  // another name and needs the same gate as reading it directly.
  if (!(await canParticipateInCourse(req.dbUser!, discussion.courseId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const replies = await db
    .select()
    .from(discussionRepliesTable)
    .where(eq(discussionRepliesTable.discussionId, req.params.discussionId))
    .orderBy(asc(discussionRepliesTable.createdAt));

  const source = [discussion.body, ...replies.map((r) => r.body)];
  const out = await translateTexts(source, langCode);

  // translateTexts returns the originals unchanged on any failure, so a mismatch here is
  // the honest "we could not translate" signal rather than a silent half-translation.
  res.json({
    langCode,
    translated: out.length === source.length && out.some((t, i) => t !== source[i]),
    body: out[0] ?? discussion.body,
    replies: replies.map((r, i) => ({ id: r.id, body: out[i + 1] ?? r.body })),
  });
});

// DELETE /discussions/replies/:replyId, the reply's author may delete their own; anyone
// else needs delivery-staff moderation rights scoped to the course (decision §4.2).
router.delete("/discussions/replies/:replyId", requireAuth, async (req, res) => {
  const actor = req.dbUser!;
  const reply = await db.query.discussionRepliesTable.findFirst({ where: eq(discussionRepliesTable.id, req.params.replyId) });
  if (!reply) { res.status(204).send(); return; }
  let allowed = reply.authorId === actor.id;
  if (!allowed) {
    const discussion = await db.query.discussionsTable.findFirst({ where: eq(discussionsTable.id, reply.discussionId) });
    if (discussion) allowed = await canStaffActOnCourse(actor, discussion.courseId);
  }
  if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.delete(discussionRepliesTable).where(eq(discussionRepliesTable.id, req.params.replyId));
  res.status(204).send();
});

export default router;
