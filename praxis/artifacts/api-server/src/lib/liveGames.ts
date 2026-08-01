/**
 * Live multiplayer game rooms — the "host a game for the class" layer over the game activities.
 *
 * DELIBERATELY in-memory and REST-polled, not websockets: a classroom session is small (tens of
 * players), short-lived, and this is a single Railway instance, so an in-process Map is the simplest
 * thing that works. Players short-poll `GET /live/:code/state` (~1.5s) for the shared leaderboard,
 * team totals and buzzer feed. Rooms are EPHEMERAL — a redeploy or a 3h idle clears them, which is the
 * correct lifetime for a live class game (nothing here is a system of record). If this ever needs to
 * survive restarts or scale horizontally, swap this module for a Redis-backed store behind the same
 * function signatures.
 *
 * Privacy: the only thing stored about a joiner is a display name they type — no account, no PII. Join
 * is code-gated and unauthenticated (so students without accounts can play); hosting requires auth.
 */

export interface LivePlayer { id: string; name: string; team: string; score: number; joinedAt: number; lastSeen: number }
export interface LiveBuzz { name: string; team: string; at: number }
export interface LiveChat { name: string; text: string; at: number }
export interface LiveRoom {
  code: string;
  activityId: string;
  title: string;
  kind: string;
  hostUserId: string;
  createdAt: number;
  lastActivity: number;
  buzzOpen: boolean;
  players: Map<string, LivePlayer>;
  buzzes: LiveBuzz[];
  chat: LiveChat[];
}

const rooms = new Map<string, LiveRoom>();

const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // 3h idle → gone
const MAX_ROOMS = 500;
const MAX_PLAYERS = 250;
const MAX_CHAT = 60;
const MAX_BUZZ = 30;
// No I/O/O0/1 to avoid read-aloud + handwriting confusion when a teacher reads the code out.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function now(): number { return Date.now(); }

function prune(): void {
  const t = now();
  for (const [code, r] of rooms) if (t - r.lastActivity > ROOM_TTL_MS) rooms.delete(code);
}

function clean(s: unknown, max: number): string {
  return String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + now().toString(36);
}

function genCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return newId().slice(0, 6).toUpperCase();
}

export function createRoom(activityId: string, title: string, kind: string, hostUserId: string): LiveRoom {
  prune();
  if (rooms.size >= MAX_ROOMS) {
    // Evict the most stale room so a live class is never blocked by abandoned ones.
    let oldest: LiveRoom | null = null;
    for (const r of rooms.values()) if (!oldest || r.lastActivity < oldest.lastActivity) oldest = r;
    if (oldest) rooms.delete(oldest.code);
  }
  const code = genCode();
  const room: LiveRoom = {
    code, activityId, title: clean(title, 120) || "Live game", kind: kind || "game", hostUserId,
    createdAt: now(), lastActivity: now(), buzzOpen: true,
    players: new Map(), buzzes: [], chat: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): LiveRoom | undefined {
  const r = rooms.get(String(code || "").toUpperCase());
  if (r) r.lastActivity = now();
  return r;
}

export function joinRoom(code: string, name: string, team: string): LivePlayer | null {
  const r = getRoom(code);
  if (!r) return null;
  if (r.players.size >= MAX_PLAYERS) return null;
  const p: LivePlayer = {
    id: newId(),
    name: clean(name, 24) || "Player",
    team: clean(team, 24) || "Solo",
    score: 0, joinedAt: now(), lastSeen: now(),
  };
  r.players.set(p.id, p);
  return p;
}

export function setScore(code: string, playerId: string, score: number): boolean {
  const r = getRoom(code);
  if (!r) return false;
  const p = r.players.get(playerId);
  if (!p) return false;
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (s > p.score) p.score = s; // keep the player's best
  p.lastSeen = now();
  return true;
}

export function touch(code: string, playerId: string): void {
  const r = getRoom(code);
  const p = r?.players.get(playerId);
  if (p) p.lastSeen = now();
}

export function addBuzz(code: string, playerId: string): boolean {
  const r = getRoom(code);
  if (!r || !r.buzzOpen) return false;
  const p = r.players.get(playerId);
  if (!p) return false;
  // One buzz per player per round.
  if (r.buzzes.some((b) => b.name === p.name && b.team === p.team)) return true;
  r.buzzes.push({ name: p.name, team: p.team, at: now() });
  if (r.buzzes.length > MAX_BUZZ) r.buzzes = r.buzzes.slice(-MAX_BUZZ);
  p.lastSeen = now();
  return true;
}

export function resetBuzz(code: string, hostUserId: string): boolean {
  const r = getRoom(code);
  if (!r || r.hostUserId !== hostUserId) return false;
  r.buzzes = [];
  r.buzzOpen = true;
  return true;
}

export function postChat(code: string, playerId: string, text: string): boolean {
  const r = getRoom(code);
  if (!r) return false;
  const p = r.players.get(playerId);
  if (!p) return false;
  const t = clean(text, 140);
  if (!t) return false;
  r.chat.push({ name: p.name, text: t, at: now() });
  if (r.chat.length > MAX_CHAT) r.chat = r.chat.slice(-MAX_CHAT);
  p.lastSeen = now();
  return true;
}

export function roomState(code: string): {
  code: string; title: string; activityId: string; kind: string; buzzOpen: boolean;
  players: { name: string; team: string; score: number }[];
  teams: { team: string; total: number; players: number }[];
  buzzes: LiveBuzz[]; chat: LiveChat[]; playerCount: number;
} | null {
  const r = getRoom(code);
  if (!r) return null;
  const players = [...r.players.values()]
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p) => ({ name: p.name, team: p.team, score: p.score }));
  const teamMap = new Map<string, { total: number; players: number }>();
  for (const p of r.players.values()) {
    const t = teamMap.get(p.team) ?? { total: 0, players: 0 };
    t.total += p.score; t.players += 1; teamMap.set(p.team, t);
  }
  const teams = [...teamMap.entries()]
    .map(([team, v]) => ({ team, total: v.total, players: v.players }))
    .sort((a, b) => b.total - a.total);
  return {
    code: r.code, title: r.title, activityId: r.activityId, kind: r.kind, buzzOpen: r.buzzOpen,
    players, teams, buzzes: r.buzzes.slice(), chat: r.chat.slice(-30), playerCount: r.players.size,
  };
}

// Test/inspection helper.
export function _roomsCount(): number { return rooms.size; }
