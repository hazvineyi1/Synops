"use strict";
const crypto = require("crypto");
const { q, audit } = require("./db");

const COOKIE = "djh_sid";
const SESSION_HOURS = 12;
const PROD = process.env.NODE_ENV === "production";

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return "scrypt$" + salt.toString("base64") + "$" + key.toString("base64");
}
function verifyPassword(pw, stored) {
  const [alg, s, k] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const key = crypto.scryptSync(pw, Buffer.from(s, "base64"), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(k, "base64");
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((p) => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '" + SESSION_HOURS + " hours')", [sha(token), userId]);
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${PROD ? "; Secure" : ""}`);
}
async function destroySession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) await q("DELETE FROM sessions WHERE token_hash=$1", [sha(t)]);
  res.setHeader("Set-Cookie", `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${PROD ? "; Secure" : ""}`);
}
async function loadUser(req, _res, next) {
  req.user = null;
  const t = parseCookies(req)[COOKIE];
  if (t) {
    const r = await q(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.status='active'`, [sha(t)]);
    req.user = r.rows[0] || null;
  }
  next();
}
function requireUser(req, res, next) { if (!req.user) return res.status(401).json({ error: "Sign in to continue." }); next(); }
function requireRole(...roles) { return (req, res, next) => { if (!req.user) return res.status(401).json({ error: "Sign in to continue." }); if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have access to this." }); next(); }; }

// Simple in-memory rate limiter (per key). Pilot scale only; use a shared store for multiple instances.
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); const b = buckets.get(key) || []; const recent = b.filter((t) => now - t < windowMs);
  recent.push(now); buckets.set(key, recent); return recent.length > max;
}
function publicUser(u) { return u && { id: u.id, email: u.email, name: u.name, prole: u.prole, route: u.route, role: u.role, lang: u.lang, unit: u.unit, institution: u.institution }; }

async function seedDemo() {
  if (process.env.SEED_DEMO !== "1") return;
  const pw = process.env.DEMO_PASSWORD || "Pilot-Demo-2026";
  const people = [
    ["demo.prosecutor@justice.example", "Olena Demo", "Prosecutor", "pro", "learner"],
    ["demo.investigator@justice.example", "Taras Demo", "Police investigator", "inv", "learner"],
    ["demo.judge@justice.example", "Iryna Demo", "Judge", "jud", "learner"],
    ["demo.admin@justice.example", "Coordinator Demo", "Other approved justice actor", "pro", "admin"]
  ];
  for (const [email, name, prole, route, role] of people) {
    await q(`INSERT INTO users(email,name,prole,route,role,status,unit,institution,lang,pw_hash,approved_at)
             VALUES ($1,$2,$3,$4,$5,'active','Demo unit','Demo institution','en',$6,now()) ON CONFLICT (email) DO NOTHING`, [email, name, prole, route, role, hashPassword(pw)]);
  }
  await audit(null, "demo accounts ensured", "seed");
}
module.exports = { hashPassword, verifyPassword, createSession, destroySession, loadUser, requireUser, requireRole, limited, publicUser, seedDemo };
