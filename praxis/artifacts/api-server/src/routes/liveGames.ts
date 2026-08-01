import { Router } from "express";
import { db } from "@workspace/db";
import { interactiveActivitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import {
  createRoom, getRoom, joinRoom, setScore, touch, addBuzz, resetBuzz, postChat, roomState,
} from "../lib/liveGames";
import { mathHint, mathWorkedExample } from "../lib/mathCoach";

/**
 * Live multiplayer "host a game for the class" endpoints over the in-memory room store (see
 * lib/liveGames.ts). Hosting requires auth (a teacher); joining is code-gated and open so students
 * without accounts can play. Players short-poll GET /live/:code/state for the shared leaderboard.
 */
const router = Router();

// Host a room for an existing activity. Auth required (the teacher who runs the screen).
router.post("/live/host", requireAuth, async (req, res) => {
  const activityId = String(req.body?.activityId ?? "").trim();
  if (!activityId) { res.status(400).json({ error: "An activityId is required." }); return; }
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, activityId)).limit(1);
  if (!a) { res.status(404).json({ error: "Activity not found" }); return; }
  const room = createRoom(a.id, a.title, a.kind, req.userId!);
  res.status(201).json({ code: room.code, activityId: a.id, title: room.title, kind: a.kind });
});

// Public preview of a room (the join screen checks the code before asking for a name).
router.get("/live/:code", (req, res) => {
  const r = getRoom(req.params.code);
  if (!r) { res.status(404).json({ error: "No game with that code." }); return; }
  res.json({ ok: true, code: r.code, title: r.title, activityId: r.activityId, kind: r.kind, playerCount: r.players.size });
});

// Code-gated Socratic coach for a Math Coach room, so joiners without accounts still get hints.
router.post("/live/:code/hint", async (req, res) => {
  const r = getRoom(req.params.code);
  if (!r) { res.status(404).json({ error: "No game with that code." }); return; }
  const b = req.body ?? {};
  if (!String(b.problem ?? "").trim()) { res.status(400).json({ error: "A problem is required." }); return; }
  const out = await mathHint({ problem: String(b.problem), answer: String(b.answer ?? ""), studentAnswer: b.studentAnswer ? String(b.studentAnswer) : undefined, attempts: Number(b.attempts) || 1, grade: b.grade ? String(b.grade) : undefined });
  res.json(out);
});
router.post("/live/:code/worked-example", async (req, res) => {
  const r = getRoom(req.params.code);
  if (!r) { res.status(404).json({ error: "No game with that code." }); return; }
  const b = req.body ?? {};
  if (!String(b.problem ?? "").trim()) { res.status(400).json({ error: "A problem is required." }); return; }
  const out = await mathWorkedExample({ problem: String(b.problem), answer: String(b.answer ?? ""), grade: b.grade ? String(b.grade) : undefined });
  res.json(out);
});

// The hosted game's HTML — public but CODE-GATED (only the one activity being hosted, nothing else),
// so a joined student without an account can render and play it in the sandbox.
router.get("/live/:code/activity", async (req, res) => {
  const r = getRoom(req.params.code);
  if (!r) { res.status(404).json({ error: "No game with that code." }); return; }
  const [a] = await db.select().from(interactiveActivitiesTable).where(eq(interactiveActivitiesTable.id, r.activityId)).limit(1);
  if (!a) { res.status(404).json({ error: "Game not found" }); return; }
  res.json({ title: a.title, instructions: a.instructions, html: a.html, embedUrl: a.embedUrl });
});

// Join with a display name (+ optional team). No account needed.
router.post("/live/:code/join", (req, res) => {
  const p = joinRoom(req.params.code, String(req.body?.name ?? ""), String(req.body?.team ?? ""));
  if (!p) { res.status(404).json({ error: "That game is not open (bad code or full)." }); return; }
  res.status(201).json({ playerId: p.id, name: p.name, team: p.team });
});

// A player's game posts its result; we keep their best score.
router.post("/live/:code/score", (req, res) => {
  const ok = setScore(req.params.code, String(req.body?.playerId ?? ""), Number(req.body?.score));
  if (!ok) { res.status(404).json({ error: "Not in that game." }); return; }
  res.json({ ok: true });
});

// Chat-based buzzer: a player buzzes in; the host sees the order.
router.post("/live/:code/buzz", (req, res) => {
  const ok = addBuzz(req.params.code, String(req.body?.playerId ?? ""));
  if (!ok) { res.status(400).json({ error: "Buzzer is closed or you're not in the game." }); return; }
  res.json({ ok: true });
});

router.post("/live/:code/chat", (req, res) => {
  const ok = postChat(req.params.code, String(req.body?.playerId ?? ""), String(req.body?.text ?? ""));
  if (!ok) { res.status(400).json({ error: "Could not post." }); return; }
  res.json({ ok: true });
});

// The polled state: leaderboard, team totals, buzzer feed, chat. Pass ?playerId to stay "present".
router.get("/live/:code/state", (req, res) => {
  const pid = String(req.query.playerId ?? "");
  if (pid) touch(req.params.code, pid);
  const s = roomState(req.params.code);
  if (!s) { res.status(404).json({ error: "Game ended or code is wrong." }); return; }
  res.json(s);
});

// Host clears the buzzer for the next question. Only the room's host may.
router.post("/live/:code/buzz-reset", requireAuth, (req, res) => {
  const ok = resetBuzz(req.params.code, req.userId!);
  if (!ok) { res.status(403).json({ error: "Only the host can reset the buzzer." }); return; }
  res.json({ ok: true });
});

export default router;
